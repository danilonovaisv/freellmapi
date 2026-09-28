# 🚀 Guia Completo de Configuração e Uso — FreeLLMAPI Local Proxy

Este guia fornece instruções práticas, passo a passo, para configurar, executar e utilizar o seu servidor proxy local de IA. Ele combina os tiers gratuitos de mais de **14 provedores de IA** em um **único endpoint compatível com OpenAI** (`/v1`), com failover automático, rate limiting preventivo, criptografia local e dashboard web administrativo.

---

## 📌 Sumário
1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Inicialização Rápida no macOS](#2-inicialização-rápida-no-macos)
3. [Como Obter as Chaves Gratuitas dos 14 Provedores](#3-como-obter-as-chaves-gratuitas-dos-14-provedores)
4. [Configuração no Dashboard Web](#4-configuração-no-dashboard-web)
5. [Configuração da Cadeia de Fallback (Prioridades)](#5-configuração-da-cadeia-de-fallback-prioridades)
6. [Obtenção e Uso da Chave Unificada](#6-obtenção-e-uso-da-chave-unificada)
7. [Exemplos Práticos de Integração (Python, Node.js, cURL)](#7-exemplos-práticos-de-integração)
8. [Integração com Ferramentas de Código (Cursor, Claude Code, Aider, Continue)](#8-integração-com-ferramentas-de-código)
9. [Execução Contínua em Background (macOS e Raspberry Pi)](#9-execução-contínua-em-background-macos-e-raspberry-pi)
10. [Segurança e Manutenção do Banco SQLite](#10-segurança-e-manutenção-do-banco-sqlite)

---

## 1. Visão Geral da Arquitetura

```mermaid
graph LR
    Client["Qualquer Cliente OpenAI\n(Python, Cursor, Aider, Claude Code)"] -->|Bearer freellmapi-...| Proxy["FreeLLMAPI Local Proxy\nhttp://localhost:3001/v1"]
    Proxy --> Router{"Roteador Inteligente\n(Fallback Chain)"}
    Router -->|1ª Tentativa| P1["Groq / Cerebras\n(Ultra Rápido)"]
    Router -.->|Se 429 ou Erro 5xx| P2["Google Gemini\n(Contexto Amplo)"]
    Router -.->|Se 429 ou Erro 5xx| P3["SambaNova / Mistral\n(Alta Capacidade)"]
    Router -.->|Fallback Final| P4["OpenRouter / HuggingFace\n(Free Endpoints)"]
    Proxy <--> DB[("SQLite Local\nfreeapi.db (AES-256-GCM)")]
```

- **Porta padrão**: `3001`
- **Endpoint OpenAI**: `http://localhost:3001/v1/chat/completions`
- **Dashboard Web**: `http://localhost:3001`
- **Banco de Dados**: SQLite embarcado em `freellmapi/server/data/freeapi.db`
- **Criptografia**: Chaves de API de terceiros são encriptadas em repouso com `AES-256-GCM`.

---

## 2. Inicialização Rápida no macOS

O repositório já está clonado em `/Users/danilonovais/MacOS-Use/freellmapi` e suas dependências e compilação já foram concluídas com sucesso.

### 2.1. O Arquivo `.env`
O arquivo `freellmapi/.env` já foi criado com uma chave criptográfica mestra de 64 caracteres hexadecimais (32 bytes):
```bash
ENCRYPTION_KEY=9c3af160d232dffc9bb0082ade895c195ebec29029392bccfa56a34a913e999b
PORT=3001
HOST=127.0.0.1
PROXY_RATE_LIMIT_RPM=120
ADMIN_RATE_LIMIT_RPM=600
```

### 2.2. Como Iniciar o Servidor

No terminal, execute:
```bash
cd /Users/danilonovais/MacOS-Use/freellmapi
npm run start -w server
```
*(Para modo de desenvolvimento com hot-reload do frontend e backend simultâneos, use `npm run dev`).*

Ao iniciar, você verá logs semelhantes a:
```text
Database initialized at .../server/data/freeapi.db
Seeded 25 models and fallback config
  Your unified API key: freellmapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Server running on http://127.0.0.1:3001
Proxy endpoint: http://127.0.0.1:3001/v1/chat/completions
```

---

## 3. Como Obter as Chaves Gratuitas dos 14 Provedores

Acesse os portais dos provedores abaixo para gerar suas chaves gratuitas (a maioria leva menos de 1 minuto):

| # | Provedor | Modelo Principal Gratuito | Onde Obter a Chave Gratuita |
|---|---|---|---|
| 1 | **Google Gemini** | Gemini 2.5 Flash, 1.5 Flash | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| 2 | **Groq** | Llama 3.3 70B Versatile, Llama 3.1 8B | [Groq Cloud Console](https://console.groq.com/keys) |
| 3 | **Cerebras** | Llama 3.3 70B, Llama 3.1 8B (CS-3) | [Cerebras Cloud Portal](https://cloud.cerebras.ai/) |
| 4 | **SambaNova** | Llama 3.3 70B, Qwen 2.5 72B | [SambaNova Cloud](https://cloud.sambanova.ai/) |
| 5 | **Mistral AI** | Mistral Large, Codestral, Mistral Small | [Mistral La Plateforme](https://console.mistral.ai/api-keys/) |
| 6 | **OpenRouter** | DeepSeek R1, Llama 3.3 (rotas `:free`) | [OpenRouter Keys](https://openrouter.ai/keys) |
| 7 | **Cloudflare** | Workers AI (10.000 neurônios/dia grátis) | [Cloudflare Dashboard](https://dash.cloudflare.com/) (AI > Workers AI) |
| 8 | **Hugging Face** | Serverless Inference API (Qwen, Mistral) | [HuggingFace Settings Tokens](https://huggingface.co/settings/tokens) |
| 9 | **NVIDIA NIM** | Llama 3.3, Nemotron (Tier de Avaliação) | [build.nvidia.com](https://build.nvidia.com/) |
| 10 | **Cohere** | Command R, Command R+ (Trial Key) | [Cohere Dashboard](https://dashboard.cohere.com/api-keys) |
| 11 | **Zhipu AI / Z.ai** | GLM-4 Flash (gratuito) | [Zhipu Open Platform](https://open.bigmodel.cn/) ou [Z.ai](https://z.ai/) |
| 12 | **ModelScope** | Qwen e modelos abertos | [ModelScope Studio](https://modelscope.cn/my/myaccesstoken) |
| 13 | **DeepSeek** | DeepSeek V3 / R1 | [DeepSeek Platform](https://platform.deepseek.com/api_keys) |
| 14 | **Custom / Ollama** | Modelos Locais (Llama, DeepSeek, Qwen) | `http://localhost:11434/v1` (sem custo, 100% offline) |

---

## 4. Configuração no Dashboard Web

1. Com o servidor rodando, abra o navegador em: **`http://localhost:3001`**.
2. **Primeiro Acesso**:
   - Crie sua conta de administrador local (e-mail e senha). Como o acesso é local (`127.0.0.1`), a criação é instantânea.
3. **Cadastrando as Chaves**:
   - No menu lateral, clique em **Keys**.
   - Selecione o provedor desejado (ex: **Google**, **Groq**, **Cerebras**).
   - Cole a respectiva API Key.
   - Clique em **Save**. A chave é imediatamente encriptada com AES-256-GCM e salva no SQLite.
   - Clique no botão **Test Key** para validar se o provedor está respondendo com status 200.

---

## 5. Configuração da Cadeia de Fallback (Prioridades)

No menu **Fallback Chain** do dashboard:
1. Você verá a lista de modelos disponíveis agrupados pelos provedores que possuem chave cadastrada.
2. **Reordenação Drag-and-Drop**: Arraste os cards para definir a ordem exata de tentativa.
3. **Estratégia Recomendada para Desenvolvimento**:
   - **1º Groq / Cerebras**: Latência ultrabaixa (~300-800 tokens/s), ideal para respostas imediatas.
   - **2º Google Gemini 2.5 Flash**: Janela gigante de contexto e raciocínio refinado.
   - **3º SambaNova**: Excelente vazão e suporte a modelos 70B.
   - **4º Mistral AI**: Excelente para código e raciocínio lógico.
   - **5º OpenRouter (`:free`)**: Rede de segurança caso todos os anteriores atinjam limite diário.
4. **Comportamento de Failover**:
   - Quando um provedor retorna **429 (Too Many Requests)** ou **5xx**, o FreeLLMAPI automaticamente o coloca em cooldown de 60 segundos e despacha a requisição instantaneamente para o próximo provedor da cadeia sem estourar erro para o seu cliente!

---

## 6. Obtenção e Uso da Chave Unificada

1. No topo da página **Keys** ou no cabeçalho do Dashboard, você verá o seu **Unified API Key**:
   ```text
   freellmapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
2. Esta é a **única chave** que você precisa passar para qualquer cliente de IA, biblioteca ou editor.

---

## 7. Exemplos Práticos de Integração

### 7.1. Python (SDK Oficial `openai`)
```python
from openai import OpenAI

# Conecta ao proxy local usando a chave unificada
client = OpenAI(
    base_url="http://localhost:3001/v1",
    api_key="SUA_CHAVE_UNIFICADA_AQUI"
)

# Roteamento automático para o melhor modelo da cadeia (ou use model="auto")
response = client.chat.completions.create(
    model="auto",
    messages=[
        {"role": "system", "content": "Você é um assistente técnico especialista."},
        {"role": "user", "content": "Explique a diferença entre mutex e semáforo."}
    ],
    stream=True  # Streaming em tempo real suportado
)

for chunk in response:
    content = chunk.choices[0].delta.content or ""
    print(content, end="", flush=True)
print()
```

### 7.2. Node.js / TypeScript (`openai`)
```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:3001/v1',
  apiKey: process.env.FREELLMAPI_KEY || 'SUA_CHAVE_UNIFICADA_AQUI',
});

async function main() {
  const stream = await openai.chat.completions.create({
    model: 'auto',
    messages: [{ role: 'user', content: 'Escreva uma função debounce em TypeScript' }],
    stream: true,
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
  }
}

main();
```

### 7.3. Teste Rápido via `curl`
```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SUA_CHAVE_UNIFICADA_AQUI" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Teste de conexão!"}],
    "stream": false
  }'
```

---

## 8. Integração com Ferramentas de Código

### 8.1. Cursor / VS Code (Continue / Cline / Roo Code)
- **Base URL**: `http://localhost:3001/v1`
- **API Key**: `freellmapi-...`
- **Model Name**: `auto` (ou nome de cadeia personalizada como `auto:coding`)

### 8.2. Aider CLI
```bash
export OPENAI_API_BASE=http://localhost:3001/v1
export OPENAI_API_KEY=SUA_CHAVE_UNIFICADA_AQUI
aider --model openai/auto
```

### 8.3. Claude Code / Codex CLI
O FreeLLMAPI suporta emulação nativa do formato Anthropic `/v1/messages`. Você pode inicializar o assistente apontando o endpoint de API para o proxy local:
```bash
cd /Users/danilonovais/MacOS-Use/freellmapi
npx freellmapi setup-claude
# ou para Codex:
npx freellmapi setup-codex
```

---

## 9. Execução Contínua em Background (macOS e Raspberry Pi)

Se você deseja que o FreeLLMAPI continue rodando em segundo plano sem manter a janela do terminal aberta:

### 9.1. Usando PM2 (Recomendado)
```bash
# Instalar o PM2 globalmente (se ainda não tiver)
npm install -g pm2

# Iniciar o servidor FreeLLMAPI gerenciado pelo PM2
cd /Users/danilonovais/MacOS-Use/freellmapi
pm2 start npm --name "freellmapi" -- run start -w server

# Verificar status e logs
pm2 status
pm2 logs freellmapi

# Configurar para iniciar automaticamente com o sistema
pm2 startup
pm2 save
```

### 9.2. Acessando de Outros Dispositivos na Rede Local (Ex: Raspberry Pi / Laptop)
Para permitir que outros computadores da sua rede utilizem o proxy:
1. No arquivo `freellmapi/.env`, mude:
   ```bash
   HOST=0.0.0.0
   ```
2. Reinicie o servidor.
3. Em outros dispositivos na sua rede, configure os clientes para:
   `http://<IP_DO_SEU_MAC_OU_PI>:3001/v1`

---

## 10. Segurança e Manutenção do Banco SQLite

- **Onde ficam os dados**: Todos os dados (chaves encriptadas, contadores de uso, configurações de prioridade e logs) ficam armazenados em:
  `/Users/danilonovais/MacOS-Use/freellmapi/server/data/freeapi.db`
- **Backup Simples**: Para fazer backup, basta copiar a pasta `server/data/` com o servidor pausado, ou usar a rotina automática embutida no FreeLLMAPI.
- **Segurança da Chave Mestra**: Mantenha o arquivo `.env` seguro. As chaves de terceiros jamais são expostas na web ou salvas em texto puro.
