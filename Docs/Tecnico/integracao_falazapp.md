# Integração FalazApp — contato + mensagem após o formulário

> Rota interna: **POST /api/falazapp-contact** · Disparo: submit da pré-matrícula (`src/App.jsx`)
> Adicionada em: 2026-09-01 · Docs da API: <https://principal.suitehelpers.com.br/docs/api-criar-contato>, <https://principal.suitehelpers.com.br/docs/api-mensagem-de-texto>

## Visão geral

Quando um lead preenche o formulário de pré-matrícula da landing page, além de
gravar o lead no Supabase (tabela `leads`) e disparar as integrações Google
Sheets e webhook Novo Envio, o site:

1. **cria um contato** na plataforma FalazApp (CRM WhatsApp da família
   suitehelpers);
2. logo em seguida **envia uma mensagem de confirmação** por WhatsApp para o
   lead, abrindo um ticket na fila 155 (status "aguardando").

As chamadas usam uma **Vercel Function** (`api/falazapp-contact.js`) como
proxy: o Bearer token da API vive apenas em `process.env` (server-side), nunca
no bundle do navegador — mesma regra de segurança da integração Z.ai.

O envio é **fire-and-forget**: acontece em background após o redirecionamento
para a página de obrigado e, se falhar, só loga no console (`Erro FalazApp:`).
A falha NÃO afeta o usuário nem as outras integrações. Não há retry nem
registro de sincronização na tabela `leads`. Se o contato for criado mas a
mensagem falhar, a resposta do endpoint traz `messageError` (contato segue
salvo).

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
| Enviar mensagem de texto | `POST /api/messages/send` | `{ number, openTicket: "1", queueId: "155", body }` |
| Aplicar tags ao ticket | `POST /api/tags/add` | `{ ticketId, tags: [{ id }, ...] }` |
| Listar tags da empresa | `GET /api/tags` | sem payload |

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
| `extraInfo` | metadados do envio | Lista `{name, value}` com `produto` (categoria escolhida), `created_at`/`updated_at` (instante do envio, igual ao insert no Supabase), `page_url`, `page_title`, `referrer`, todas as UTMs e `formulario` (campos vazios são omitidos) — mesmos dados gravados no Supabase pelo `buildLeadMeta()` |

### Mensagem de confirmação (WhatsApp)

Logo após criar o contato com sucesso, `createContactAndNotify()` envia a
mensagem de confirmação da pré-inscrição (`buildConfirmationMessage()` em
`api/_falazapp.js`):

- `number` = WhatsApp do lead normalizado (DDI 55);
- `openTicket: "1"` + `queueId: "155"` = abre ticket na fila 155 e joga a
  conversa em status "aguardando" (comportamento documentado da API);
- corpo fixo com duas linhas dinâmicas: nome completo (`nome_completo`) e
  categoria da CNH (`produto`);
- a data/texto da promoção ("sexta-feira, dia 04 de setembro", "50 vagas")
  estão escritos no texto — atualizar em `buildConfirmationMessage()` a cada
  nova campanha;
- se o contato for criado mas a mensagem falhar, o endpoint responde `200`
  com `messageError` preenchido (o contato continua salvo).

### Tags do ticket

A API de criar contato e a de enviar mensagem **não aceitam tags** — elas são
aplicadas ao **ticket** via `POST /api/tags/add` logo após o envio (o
`ticketId` vem na resposta da mensagem, em `retorno.ticketId`). Semântica de
**substituição**: todas as tags existentes são apagadas e as enviadas são
aplicadas (irrelevante aqui, pois o ticket acaba de nascer vazio).

Tags aplicadas a cada lead (IDs em `api/_falazapp.js`, listados via
`GET /api/tags`):

| Tag | ID | Origem |
|---|---|---|
| Moto [A] / Carro [B] / Carro e Moto [AB] / Adição Moto [A] / Adição Carro [B] | 595 / 579 / 572 / 584 / 583 | Dinâmica: categoria escolhida no formulário (`produto`) |
| meteorico-2026 | 674 | Fixa — espelha a referencia "Meteórico Setembro/2026" |
| setembro | 673 | Fixa — mês de captação |
| Negociando | 573 | Fixa — status inicial do lead após o formulário |

Falha nas tags não derruba nada: volta em `tagsError` na resposta do endpoint.

### Gravação do ID no Supabase (`contact_falazapp`)

Após criar o contato, a função grava o `contact.id` da FalazApp na coluna
`contact_falazapp` do lead correspondente (tabela `leads`). O insert do lead é
client-side com anon key e o RLS não devolve o id da linha, então a correlação
é pelo `whatsapp` (mesma string mascarada gravada no lead), via **service
role** (mesmo padrão do `/api/leads`). Só preenche linhas com a coluna vazia
(`contact_falazapp is null`) — se o lead reenviar o formulário, o primeiro ID
é preservado. Falha no update não derruba contato/mensagem/tags: volta em
`leadUpdate` na resposta.

## Nossos arquivos

| Arquivo | Rota | Descrição |
|---|---|---|
| `api/_falazapp.js` | — | Helper compartilhado (validação, normalização do número, fetch). Arquivos com `_` não viram endpoints. |
| `api/falazapp-contact.js` | `POST /api/falazapp-contact` | Body `{nome_completo, whatsapp, email}` → cria o contato. `405` método errado, `400` campo ausente, `500` token não configurado, `502` FalazApp recusou. |
| `api/falazapp-ticket.js` | `GET /api/falazapp-ticket?whatsapp=` | `302` para o ticket mais recente do contato no painel (`app.falazapp.com.br/tickets/{uuid}`); sem ticket → `302` para `wa.me`. Usado pela coluna WhatsApp do `/dash`. |
| `src/App.jsx` | — | `handleSubmit` chama `/api/falazapp-contact` em background, junto das integrações Sheets/Novo Envio. |
| `src/Dash.jsx` | — | A coluna WhatsApp aponta para `/api/falazapp-ticket` (abre o ticket no FalazApp em nova aba). |
| `vite.config.js` | — | Middlewares `devApiFalazapp` e `devApiFalazappTicket` replicam as funções no `npm run dev` (o dev server do Vite não executa `api/`). |

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
