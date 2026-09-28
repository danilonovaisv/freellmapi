import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogPopup, DialogTitle } from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { X } from 'lucide-react'
import type { ApiKey } from '../../../../shared/types'
import { useI18n } from '@/i18n'
import { PLATFORMS } from './shared'

type UpdateBody = {
  label?: string
  key?: string
  monthlyRequestCap?: number
  monthlyTokenCap?: number
}

/** Parse a budget-cap input: empty means "no change" (null); otherwise a
 *  non-negative integer (0 clears the cap). Invalid → null so the field is
 *  simply not submitted. */
function parseCap(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return Number.isSafeInteger(n) ? n : null
}

/** Format a cap for the input: 0 (unlimited) shows as empty. */
function capToInput(cap: number | undefined): string {
  return cap && cap > 0 ? String(cap) : ''
}

/** Edit the mutable parts of a key without deleting its stable endpoint
 *  identity. Changing the credential itself is deliberately explicit: the
 *  field starts empty because the API never sends plaintext secrets back. */
export function EditKeyDialog({
  apiKey,
  onOpenChange,
}: {
  apiKey: ApiKey
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [label, setLabel] = useState(apiKey.label)
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [accountId, setAccountId] = useState('')
  const [attempted, setAttempted] = useState(false)
  // Monthly budget caps (#1158): editable here so the cap is settable from
  // the dashboard at all; it shipped API-only. Empty = unlimited.
  const [requestCap, setRequestCap] = useState(capToInput(apiKey.monthlyRequestCap))
  const [tokenCap, setTokenCap] = useState(capToInput(apiKey.monthlyTokenCap))

  const needsAccountId = apiKey.platform === 'cloudflare'
  const canEditCredential = !apiKey.keyless
  const provider = PLATFORMS.find(p => p.value === apiKey.platform)
  const credential = useMemo(() => {
    if (!canEditCredential || !apiKeyValue.trim()) return ''
    if (needsAccountId) return accountId.trim() ? `${accountId.trim()}:${apiKeyValue.trim()}` : ''
    return apiKeyValue.trim()
  }, [accountId, apiKeyValue, canEditCredential, needsAccountId])

  const credentialError = needsAccountId &&
    (accountId.trim() ? !apiKeyValue.trim() : Boolean(apiKeyValue.trim()))
    ? t('keys.editCredentialPartsRequired')
    : null
  const requestCapChanged = parseCap(requestCap) !== (apiKey.monthlyRequestCap || 0) || requestCap.trim() !== capToInput(apiKey.monthlyRequestCap)
  const tokenCapChanged = parseCap(tokenCap) !== (apiKey.monthlyTokenCap || 0) || tokenCap.trim() !== capToInput(apiKey.monthlyTokenCap)
  const hasChanges = label !== apiKey.label || Boolean(credential) || requestCapChanged || tokenCapChanged

  const updateKey = useMutation({
    mutationFn: (body: UpdateBody) =>
      apiFetch(`/api/keys/${apiKey.id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      for (const key of ['keys', 'health']) queryClient.invalidateQueries({ queryKey: [key] })
      onOpenChange(false)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (credentialError) {
      setAttempted(true)
      return
    }

    const body: UpdateBody = {}
    if (label !== apiKey.label) body.label = label
    if (credential) body.key = credential
    // Cap fields: an emptied field means "unlimited" (0); an unparsable
    // value is not sent at all (the server would reject it anyway).
    if (requestCap.trim() !== capToInput(apiKey.monthlyRequestCap)) {
      const parsed = parseCap(requestCap)
      if (parsed !== null) body.monthlyRequestCap = parsed
      else if (!requestCap.trim()) body.monthlyRequestCap = 0
    }
    if (tokenCap.trim() !== capToInput(apiKey.monthlyTokenCap)) {
      const parsed = parseCap(tokenCap)
      if (parsed !== null) body.monthlyTokenCap = parsed
      else if (!tokenCap.trim()) body.monthlyTokenCap = 0
    }
    if (Object.keys(body).length > 0) updateKey.mutate(body)
    else onOpenChange(false)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogPopup maxWidth="max-w-lg">
        <div className="mb-4 flex items-center justify-between gap-4">
          <DialogTitle>{t('keys.editKey')}</DialogTitle>
          <DialogClose
            aria-label={t('common.dismiss')}
            className="-mr-1 rounded-lg p-1 text-muted-foreground/70 transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X className="size-4" />
          </DialogClose>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('keys.platform')}</Label>
              <Input value={provider?.label ?? apiKey.platform} readOnly className="bg-muted/30" />
              <p className="text-[11px] text-muted-foreground">{t('keys.editPlatformLocked')}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="edit-key-label">{t('keys.label')}</Label>
              <Input
                id="edit-key-label"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder={t('keys.customDisplayNameOptional')}
              />
            </div>
          </div>

          {apiKey.baseUrl && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t('keys.customBaseUrl')}</Label>
              <Input value={apiKey.baseUrl} readOnly className="bg-muted/30 font-mono text-xs" />
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs" htmlFor="edit-key-value">
                {needsAccountId ? t('keys.apiToken') : t('keys.customApiKey')}
              </Label>
              <code className="font-mono text-[11px] text-muted-foreground">{apiKey.maskedKey}</code>
            </div>
            {canEditCredential ? (
              <>
                {needsAccountId && (
                  <Input
                    value={accountId}
                    onChange={e => setAccountId(e.target.value)}
                    placeholder={t('keys.accountId')}
                    className="font-mono text-xs"
                    aria-invalid={attempted && Boolean(credentialError)}
                  />
                )}
                <Input
                  id="edit-key-value"
                  type="password"
                  autoComplete="new-password"
                  value={apiKeyValue}
                  onChange={e => setApiKeyValue(e.target.value)}
                  placeholder={needsAccountId ? t('keys.bearerTokenPlaceholder') : t('keys.pasteKeyPlaceholder')}
                  className="font-mono text-xs"
                  aria-invalid={attempted && Boolean(credentialError)}
                />
                {attempted && <FieldError error={credentialError} />}
                <p className="text-[11px] text-muted-foreground">{t('keys.editCredentialHint')}</p>
              </>
            ) : (
              <Input value={t('keys.noKeyNeededPlaceholder')} readOnly className="bg-muted/30 font-mono text-xs" />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="edit-key-request-cap">{t('keys.monthlyRequestCapLabel')}</Label>
              <Input
                id="edit-key-request-cap"
                inputMode="numeric"
                value={requestCap}
                onChange={e => setRequestCap(e.target.value)}
                placeholder={t('keys.capUnlimitedPlaceholder')}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="edit-key-token-cap">{t('keys.monthlyTokenCapLabel')}</Label>
              <Input
                id="edit-key-token-cap"
                inputMode="numeric"
                value={tokenCap}
                onChange={e => setTokenCap(e.target.value)}
                placeholder={t('keys.capUnlimitedPlaceholder')}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>
              {apiKey.monthlyUsage
                ? t('keys.monthlyUsageLine', {
                    requests: apiKey.monthlyUsage.requests.toLocaleString(),
                    tokens: apiKey.monthlyUsage.tokens.toLocaleString(),
                  })
                : null}
            </span>
            {apiKey.monthlyUsage?.resetsAt && (
              <span>
                {t('keys.monthlyUsageResets', {
                  date: new Date(apiKey.monthlyUsage.resetsAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                })}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{t('keys.capEditHint')}</p>

          {updateKey.isError && (
            <p className="text-xs text-destructive">{(updateKey.error as Error).message}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={!hasChanges || updateKey.isPending}>
              {updateKey.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  )
}
