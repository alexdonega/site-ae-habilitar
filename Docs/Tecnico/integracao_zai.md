# Integração Z.ai — AE Studio (imagens e vídeos com IA)

> Rota: **/studio** · Funções: `/api/create-image`, `/api/create-video`, `/api/task-status`
> Adicionada em: 2026-08-31 · Docs da API: <https://docs.z.ai/api-reference/image/generate-image>, <https://docs.z.ai/api-reference/video/generate-video>

## Visão geral

O AE Studio permite gerar **imagens (GLM-Image)** e **vídeos (CogVideoX-3)** pela
API da Z.ai, direto do navegador, sem expor a chave da API.

O site é um SPA estático (Vite + React) — não há servidor de aplicação. A
integração usa **Vercel Functions** (diretório `api/`), que são deployadas junto
com o site estático sem mudar o pipeline. A regra de segurança é simples:

- `ZAI_API_KEY` vive **apenas** em `process.env` (server-side). Sem prefixo
  `VITE_`/`PUBLIC_`, nunca vai para o bundle.
- Toda função exige o header `x-studio-token` igual ao env `ZAI_STUDIO_TOKEN`
  (senha que o Studio pede no login). Sem ele → `401`, e nada é gasto na Z.ai.

## Variáveis de ambiente

| Variável | Onde | Função |
|---|---|---|
| `ZAI_API_KEY` | Vercel + `.env` local | Bearer token das chamadas a `api.z.ai`. Criar em <https://z.ai> → API Keys. |
| `ZAI_STUDIO_TOKEN` | Vercel + `.env` local | Senha de acesso à página `/studio` (comparada via `timingSafeEqual`). |

## Endpoints da Z.ai usados

Base: `https://api.z.ai/api` · Auth: `Authorization: Bearer <ZAI_API_KEY>`

| Operação | Método & path | Uso |
|---|---|---|
| Imagem síncrona | `POST /paas/v4/images/generations` | Qualidade `standard` (~5-10s) — devolve `data[0].url` direto |
| Imagem assíncrona | `POST /paas/v4/async/images/generations` | Qualidade `hd` (~20s) — o endpoint async só aceita `hd` |
| Vídeo (sempre async) | `POST /paas/v4/videos/generations` | CogVideoX-3, texto e/ou imagem |
| Consulta de tarefa | `GET /paas/v4/async-result/{id}` | Polling: `PROCESSING` → `SUCCESS` \| `FAIL` |

Resposta da consulta: imagens em `image_result[].url`; vídeos em
`video_result[].url` + `video_result[].cover_image_url`.

## Nossas funções (`api/`)

| Arquivo | Rota | Descrição |
|---|---|---|
| `api/_zai.js` | — | Helpers compartilhados (auth, fetch, erros). Arquivos com `_` não viram endpoints. |
| `api/create-image.js` | `POST /api/create-image` | Body `{prompt, size, quality}`. `standard` → síncrono (devolve `url`); `hd` → async (devolve `id`). |
| `api/create-video.js` | `POST /api/create-video` | Body `{prompt?, images?, quality, size?, fps, duration, with_audio}`. Sempre async. |
| `api/task-status.js` | `GET /api/task-status?id=` | Normaliza a consulta: `{id, model, status, urls[], coverUrl?}`. Chamada sem `id` → `400` (o Studio usa isso para validar o token sem gastar nada). |

Validações implementadas server-side: whitelist de tamanhos; `prompt` ≤512
caracteres (vídeo); 0–2 imagens (data-URL base64, total ≤ ~3.5MB — limite
prático do body de função na Vercel, que é 4.5MB); `duration` 5\|10; `fps`
30\|60; 2 imagens forçam `quality: "speed"` (regra da API para modo
primeiro/último quadro).

`vercel.json` configura `maxDuration: 30` para as funções. O rewrite catch-all
do SPA **não** conflita com `/api/*`: a Vercel resolve funções antes de aplicar
rewrites.

## Front-end (`src/Studio.jsx`, rota `/studio`)

- Login por token (`sessionStorage`), visual consistente com o CRM (dark).
- Aba **Imagem**: prompt, presets de tamanho (1:1, 3:2, 16:9, 9:16…), qualidade.
- Aba **Vídeo**: prompt com contador 512, upload de 1–2 imagens (comprimidas no
  navegador via canvas → JPEG máx. 1920px antes do base64), qualidade, formato,
  duração, fps, áudio IA.
- **Fila de tarefas**: polling em `/api/task-status` a cada 5s até terminar
  (timeout de segurança após 10 min); preview de imagem/vídeo, copiar link e
  abrir/baixar.
- **Histórico local** (`localStorage`, últimos 50): mostra quantos dias faltam
  para o link expirar. **Os links da Z.ai expiram em 30 dias** — decisão do
  produto: não persistimos mídia em storage; quem quiser manter baixa o arquivo.

## Como rodar local

```bash
# .env preenchido com ZAI_API_KEY e ZAI_STUDIO_TOKEN
npm run build   # valida o front
vercel dev      # sobe Vite + funções /api juntos (não use só `npm run dev`,
                # pois o dev server do Vite não conhece o diretório api/)
```

Teste rápido das funções:

```bash
curl -i http://localhost:3000/api/task-status -H "x-studio-token: dev-studio-local"
# → 400 (id ausente) = token OK; 401 = token errado

curl -X POST http://localhost:3000/api/create-image \
  -H "Content-Type: application/json" -H "x-studio-token: dev-studio-local" \
  -d '{"prompt":"gato na janela","size":"1280x1280","quality":"standard"}'
```

## Checklist de produção

1. Criar a API key na Z.ai e definir `ZAI_API_KEY` na Vercel (Production + Preview).
2. Definir `ZAI_STUDIO_TOKEN` forte na Vercel (diferente do valor de dev do `.env`).
3. Deploy (push para `master` dispara) e acessar `/studio`.

## Limites conhecidos

- Links de mídia expiram em **30 dias** (aviso exibido na UI).
- Z.ai: até **5MB por imagem** no envio (vídeo); nós limitamos o total a
  ~3.5MB por causa do body da função na Vercel.
- Imagem HD leva ~20s; vídeos, minutos — tudo assíncrono com polling, então o
  timeout de função (30s) não é um problema.
- Custos: cada geração consome créditos da conta Z.ai — por isso o token gate.
