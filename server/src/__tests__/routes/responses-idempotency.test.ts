import { describe, it, expect, beforeAll, vi } from 'vitest';

// Mock only routeRequest so we don't need real provider keys; count calls to
// prove a replay never touches the provider.
const { mockRouteRequest } = vi.hoisted(() => ({ mockRouteRequest: vi.fn() }));
vi.mock('../../services/router.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/router.js')>();
  return { ...actual, routeRequest: mockRouteRequest };
});

import type { Express } from 'express';
import { createApp } from '../../app.js';
import { initDb, getUnifiedApiKey } from '../../db/index.js';

function fakeRoute(text: string, finishReason = 'stop') {
  mockRouteRequest.mockReturnValue({
    provider: {
      async chatCompletion() {
        return {
          id: 'c', object: 'chat.completion', created: 0, model: 'fake-model',
          choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: finishReason }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        };
      },
      async *streamChatCompletion() { /* unused */ },
    },
    modelId: 'fake-model', modelDbId: 9999, apiKey: 'k', keyId: 1,
    platform: 'fake', displayName: 'Fake Model',
  });
}

async function post(app: Express, body: any, key: string, headers: Record<string, string> = {}) {
  const server = app.listen(0, '127.0.0.1');
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const addr = server.address() as any;
  const res = await fetch(`http://127.0.0.1:${addr.port}/v1/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  server.close();
  return { status: res.status, text, headers: res.headers };
}

describe('POST /v1/responses — Idempotency-Key', () => {
  let app: Express;
  let key: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    app = createApp();
    key = getUnifiedApiKey();
  });

  it('replays the original response for a retried key at zero provider cost', async () => {
    mockRouteRequest.mockClear();
    fakeRoute('first answer');
    const body = { input: 'retry me', stream: false };

    const first = await post(app, body, key, { 'Idempotency-Key': 'resp-key-1' });
    expect(first.status).toBe(200);
    expect(JSON.parse(first.text).output_text).toBe('first answer');
    expect(mockRouteRequest).toHaveBeenCalledTimes(1);

    fakeRoute('second answer — should never run');
    const retry = await post(app, body, key, { 'Idempotency-Key': 'resp-key-1' });
    expect(retry.status).toBe(200);
    expect(JSON.parse(retry.text).output_text).toBe('first answer');
    expect(retry.headers.get('x-routed-via')).toBe('idempotency');
    // The whole point: the retry never reached the router / provider.
    expect(mockRouteRequest).toHaveBeenCalledTimes(1);
  });

  it('rejects key reuse with a different fingerprint (409)', async () => {
    mockRouteRequest.mockClear();
    fakeRoute('alpha');
    const ok = await post(app, { input: 'alpha prompt', stream: false }, key, { 'Idempotency-Key': 'resp-key-2' });
    expect(ok.status).toBe(200);

    const clash = await post(app, { input: 'totally different', stream: false }, key, { 'Idempotency-Key': 'resp-key-2' });
    expect(clash.status).toBe(409);
    expect(JSON.parse(clash.text).error.message).toBe('idempotency_key_conflict');
    // The conflict short-circuits before routing.
    expect(mockRouteRequest).toHaveBeenCalledTimes(1);
  });

  it('does not store truncated turns for replay', async () => {
    mockRouteRequest.mockClear();
    fakeRoute('cut off', 'length');
    const body = { input: 'truncation probe', stream: false };

    const first = await post(app, body, key, { 'Idempotency-Key': 'resp-key-3' });
    expect(first.status).toBe(200);

    fakeRoute('fresh full answer');
    const retry = await post(app, body, key, { 'Idempotency-Key': 'resp-key-3' });
    expect(retry.status).toBe(200);
    // Regenerated, not replayed: the truncated turn was never claimed.
    expect(JSON.parse(retry.text).output_text).toBe('fresh full answer');
    expect(retry.headers.get('x-routed-via')).not.toBe('idempotency');
  });

  it('without the header, identical requests each hit the provider', async () => {
    mockRouteRequest.mockClear();
    fakeRoute('one');
    const a = await post(app, { input: 'no key here', stream: false }, key);
    fakeRoute('two');
    const b = await post(app, { input: 'no key here', stream: false }, key);
    expect(JSON.parse(a.text).output_text).toBe('one');
    expect(JSON.parse(b.text).output_text).toBe('two');
    expect(mockRouteRequest).toHaveBeenCalledTimes(2);
  });
});
