# Integração FalazApp — criação de contato após o formulário

> Rota interna: **POST /api/falazapp-contact** · Disparo: submit da pré-matrícula (`src/App.jsx`)
> Adicionada em: 2026-09-01 · Docs da API: <https://principal.suitehelpers.com.br/docs/api-criar-contato>

## Visão geral

Quando um lead preenche o formulário de pré-matrícula da landing page, além de
gravar o lead no Supabase (tabela `leads`) e disparar as integrações Google
Sheets e webhook Novo Envio, o site agora **cria um contato na plataforma
FalazApp** (CRM WhatsApp da família suitehelpers).

A chamada usa uma **Vercel Function** (`api/falazapp-contact.js`) como proxy:
o Bearer token da API vive apenas em `process.env` (server-side), nunca no
bundle do navegador — mesma regra de segurança da integração Z.ai.

O envio é **fire-and-forget**: acontece em background após o redirecionamento
para a página de obrigado e, se falhar, só loga no console (`Erro FalazApp:`).
A falha NÃO afeta o usuário nem as outras integrações. Não há retry nem
registro de sincronização na tabela `leads`.

## Variáveis de ambiente

| Variável | Onde | Função |
|---|---|---|
| `FALAZAPP_API_URL` | Vercel + `.env` local | URL base da API (padrão no código: `https://back.falazapp.com.br`). |
| `FALAZAPP_API_TOKEN` | Vercel + `.env` local | Bearer token da API. 🚨 Segredo server-side, sem prefixo `VITE_`/`PUBLIC_`. |

## Endpoint da FalazApp usado

Base: `https://back.falazapp.com.br` · Auth: `Authorization: Bearer <FALAZAPP_API_TOKEN>`

| Operação | Método & path | Body |
|---|---|---|
| Criar contato | `POST /api/contacts` | Ver mapeamento abaixo |

### Mapeamento de campos

| Campo FalazApp | Origem | Observação |
|---|---|---|
| `name` | `nome_completo` | Mesmo valor enviado ao Supabase |
| `number` | `whatsapp` | Normalizado: remove a máscara do form (`(65) 99999-9999`) e prefixa `55` se não houver DDI → `5565999999999` |
| `email` | `email` | Mesmo valor enviado ao Supabase |
| `estado` | fixo `MT` | Campanha Meteórico (Sorriso/MT) |
| `cidade` | fixo `Sorriso` | |
| `referencia` | fixo `Meteórico Setembro/2026` | Atualizar a cada nova campanha em `api/_falazapp.js` (`FIXED_FIELDS`) |
| `carteiraId` | fixo `254` | Atendente responsável — sem carteira o contato não aparece na listagem padrão do painel |

## Nossos arquivos

| Arquivo | Rota | Descrição |
|---|---|---|
| `api/_falazapp.js` | — | Helper compartilhado (validação, normalização do número, fetch). Arquivos com `_` não viram endpoints. |
| `api/falazapp-contact.js` | `POST /api/falazapp-contact` | Body `{nome_completo, whatsapp, email}` → cria o contato. `405` método errado, `400` campo ausente, `500` token não configurado, `502` FalazApp recusou. |
| `src/App.jsx` | — | `handleSubmit` chama `/api/falazapp-contact` em background, junto das integrações Sheets/Novo Envio. |
| `vite.config.js` | — | Middleware `devApiFalazapp` replica a função no `npm run dev` (o dev server do Vite não executa `api/`). |

## Como rodar local

```bash
# .env preenchido com FALAZAPP_API_URL e FALAZAPP_API_TOKEN
npm run dev
```

Teste rápido (⚠️ cria um contato REAL na plataforma — use dados de teste):

```bash
curl -X POST http://localhost:5175/api/falazapp-contact \
  -H "Content-Type: application/json" \
  -d '{"nome_completo":"Teste Integracao","whatsapp":"(65) 99999-9999","email":"teste@exemplo.com"}'
# → {"ok":true,...} e o contato aparece na plataforma
```

Teste E2E completo (formulário real em Chrome headless — cria lead no Supabase
E contato na FalazApp; exige `npm i --no-save puppeteer-core`):

```bash
npm run dev &                       # dev server na 5173+
npm i --no-save puppeteer-core
node scripts/e2e-falazapp.mjs http://localhost:5175
```

## Checklist de produção

1. Definir `FALAZAPP_API_URL` e `FALAZAPP_API_TOKEN` na Vercel
   (Settings → Environment Variables, Production + Preview).
2. Deploy (push para `master` dispara).
3. Preencher o formulário no site de produção e conferir o contato na plataforma.

## Limites conhecidos

- Sem retry: se a FalazApp estiver fora no momento do submit, o contato não é
  criado (apenas `console.error` no navegador).
- Sem coluna de sincronismo na tabela `leads` — não há como saber pelo banco
  quais leads viraram contato.
- A resposta de sucesso da API não é documentada oficialmente; o endpoint
  devolve o corpo retornado pela FalazApp dentro de `contact`.

## Problemas conhecidos

### `403 "Expired Session - New token generated!"` (transitório)

Observado em 2026-09-01: em um determinado momento TODAS as chamadas com o
token falhavam com esse 403 (token inválido mesmo retorna `401 "Acesso não
permitido"` — erro diferente) e, minutos depois, o MESMO token voltou a
funcionar sem nenhuma mudança nossa. Interpretação: a sessão da conexão
WhatsApp da plataforma caiu/reconectou nesse intervalo e, durante a janela de
reconexão, a API rejeita o token da conexão. Com o envio fire-and-forget do
site, leads enviados nessa janela são perdidos (apenas `console.error`).

**Como mitigar**: se isso se repetir com frequência, definir na conexão um
token fixo escolhido por você (Conexões → editar → campo Token é digitável —
docs: <https://principal.suitehelpers.com.br/docs/token-da-conexao>) e monitorar
as falhas (o endpoint `/api/falazapp-contact` devolve `502` + a mensagem da
FalazApp quando a criação falha).
