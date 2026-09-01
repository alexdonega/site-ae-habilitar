# Integração Windsor.ai — performance de mídia no Supabase

> Destino: tabela **`public.marketing_performance`** (projeto Supabase `site-alex-donega`, ref `dtugwspbkkqxkeoajunf`)
> Adicionada em: 2026-09-01 (expandida no mesmo dia: schema completo 33 colunas + sync próprio via Connectors API) · Docs da API: <https://windsor.ai/api-documentation/>

## Visão geral

O [Windsor.ai](https://windsor.ai) é um ELT de dados de marketing (350+ fontes).
Nesta integração ele puxa os dados da conta de anúncios (Meta/Facebook Ads) e
alimenta a tabela fato **`marketing_performance`** com granularidade
**anúncio × dia** e o schema completo de 33 colunas (14 dimensões + 19 métricas
— nomes exatos do [catálogo de campos do conector
Facebook](https://windsor.ai/data-field/facebook/)). Campanha, conjunto e anúncio
são agregações dessa fato (via views ou no próprio `/meta-ads`).

**Escritor dos dados: nosso sync via Connectors API** (`api/_windsor.js`):
busca em `https://connectors.windsor.ai/facebook?api_key=...&fields=<33>&date_from&date_to`
e grava com **replace por período** (DELETE do intervalo + INSERT) — idempotente,
rodar de novo não duplica. A *destination task* "Supabase" do painel do Windsor
(feita primeiro) reportava sucesso mas nunca gravou linhas neste projeto — ver
"Problemas conhecidos".

Dois consumidores no site:

- **`/dash`** — painel resumido de mídia (investimento, cliques, CPL médio) junto
  dos leads, via `GET /api/marketing`;
- **`/meta-ads`** — dashboard completa de mídia (KPIs, CTR/CPC/CPM, séries
  diárias, tabelas por campanha/conjunto/anúncio), também via `GET /api/marketing`
  + `GET /api/leads` (para CPL cruzado com o CRM).

## Fluxo dos dados

```
Meta Ads → Windsor.ai (conectado) ──Connectors API (api_key)──▶ api/_windsor.js
        cron Vercel 07:10 UTC (/api/windsor-sync, janela 3d)          │
        ou CLI local: node scripts/windsor-sync.mjs (backfill)        ▼
                                                 Supabase public.marketing_performance
                                                 (fato anúncio × dia, 33 colunas, RLS)
        │                                   │
        │ /api/marketing (service_role)     │ views: v_meta_ads_diario,
        │ /api/leads    (service_role)      │ v_meta_ads_campanha, v_meta_ads_conjunto,
        ▼                                   │ v_meta_ads_anuncio, v_cpl_campanha
  /dash (painel resumido) ·                 ▼
  /meta-ads (dashboard completa)      SQL Editor / análises
```

## Passo 1 — API key do Windsor (manual, uma vez)

Em <https://onboard.windsor.ai/app/data-preview>, aba **Data**: a query bar no
topo já mostra a URL com `api_key=...` (a chave da conta). Copiar o valor
**completo** (copiar e colar, nunca digitar/ler de screenshot) e salvar no `.env`
local e na Vercel como **`WINDSOR_API_KEY`**.

⚠️ A chave é longa e o input corta visualmente — selecione o texto inteiro antes
de copiar. Teste rápido (não expõe a chave no histórico se usar variável):

```bash
source .env 2>/dev/null; curl -s "https://connectors.windsor.ai/facebook?api_key=$WINDSOR_API_KEY&fields=date,campaign,spend&date_preset=last_7d" | head -c 300
```

## Passo 2 — SQL da tabela completa + views (JÁ EXECUTADO em 2026-09-01)

Executado no SQL Editor do Supabase (snippet salvo como "Untitled query" em
PRIVATE; fonte canônica no repo):
[`supabase/sql/2026-09-01-windsor-marketing-performance.sql`](../supabase/sql/2026-09-01-windsor-marketing-performance.sql).
O script é **idempotente** (pode rodar de novo) e faz:

1. `create table` da fato `marketing_performance` com as 33 colunas (+ bloco de
   `alter table ... add column if not exists` para completar schemas parciais);
2. `enable row level security` sem policies: só `postgres` (Windsor) e
   `service_role` (funções serverless) acessam — a anon key é pública no bundle
   da landing e não pode listar investimento;
3. índices em `(date)` e `(campaign_id)`;
4. views `security_invoker = true`: `v_meta_ads_diario`, `v_meta_ads_campanha`,
   `v_meta_ads_conjunto`, `v_meta_ads_anuncio` (agregações por nível) e
   `v_cpl_campanha` (spend × leads por dia/campanha).

Verificação:

```sql
select count(*), min(date), max(date) from public.marketing_performance;
select * from public.v_meta_ads_diario order by date desc limit 14;
select * from public.v_meta_ads_anuncio order by spend desc limit 10;
```

## Passo 3 — Sincronizar (backfill manual + cron diário)

A lógica vive em `api/_windsor.js` (`WINDSOR_FIELDS` = as 33 colunas, na ordem
do catálogo do conector Facebook). O replace é por período: DELETE
`date between from and to` + INSERT das linhas normalizadas (dedup por
`date|datasource|account_id|adset_id|ad_id|creative_id`) — rodar a janela de
novo nunca duplica. A API pode rejeitar campos que a conta não tem; o sync
retira os campos ofensivos e segue (colunas ficam NULL).

**Backfill local (uma vez, e sempre que precisar repuxar histórico):**

```bash
node scripts/windsor-sync.mjs --selftest              # valida gravação no Supabase
node scripts/windsor-sync.mjs --days=30 [--dry-run]   # últimos 30 dias
node scripts/windsor-sync.mjs --from=2026-06-01 --to=2026-08-31
```

**Sync contínuo (produção):** `vercel.json` agenda o cron
`10 7 * * *` → `GET /api/windsor-sync` (janela default 3 dias — a Meta ainda
revisa os últimos ~3 dias). Na Vercel, definir as variáveis:

| Variável | Onde | Função |
|---|---|---|
| `WINDSOR_API_KEY` | Vercel + `.env` local | Chave da conta Windsor (query bar do data-preview). 🚨 Segredo. |
| `CRON_SECRET` (ou `WINDSOR_SYNC_SECRET`) | Vercel | Segredo do endpoint: o cron da Vercel envia `Authorization: Bearer $CRON_SECRET` automaticamente; chamadas manuais usam `?secret=...`. Sem ela o endpoint responde 500 por segurança. |
| `PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | já existem | Gravação via REST. |

Disparo manual em produção:

```bash
curl "https://autoescolahabilitar.vercel.app/api/windsor-sync?secret=$WINDSOR_SYNC_SECRET&days=3"
```

## Nossos arquivos

| Arquivo | Rota | Descrição |
|---|---|---|
| `api/_windsor.js` | — | Núcleo do sync: fetch no Connectors API, normalização, replace por período no Supabase (REST via service_role), `selftestSupabase()`. Arquivos com `_` não viram endpoints. |
| `scripts/windsor-sync.mjs` | — | CLI: `--selftest`, `--days=N`, `--from/--to`, `--dry-run`. Carrega o `.env` sozinho. |
| `api/windsor-sync.js` | `GET/POST /api/windsor-sync` | Sync da janela (1–7 dias) para o cron da Vercel. Exige `CRON_SECRET`/`WINDSOR_SYNC_SECRET`; `401` sem segredo válido, `500` sem configuração, `502` Windsor/Supabase recusaram. |
| `vercel.json` | — | Cron `10 7 * * *` → `/api/windsor-sync`. |
| `api/marketing.js` | `GET /api/marketing` | Linhas de `marketing_performance` via `service_role` (order `date desc`, limit 5000). `405` método errado, `500` credenciais ausentes, `502` Supabase recusou (ex.: tabela inexistente). |
| `vite.config.js` | — | Middlewares `devApiMarketing` e `devApiWindsorSync` replicam os endpoints no `npm run dev` (sync local sem segredo — só escuta em localhost). |
| `src/Dash.jsx` | `/dash` | Painel de mídia resumido (investimento/cliques/CPL médio + tabela por campanha). |
| `src/MetaAds.jsx` | `/meta-ads` | Dashboard completa: 8 KPIs (Investimento, Leads CRM, CPL, Cliques, CTR, CPC, CPM, Impressões) + chips (alcance, frequência, views, leads Meta, cadastros, conversas WhatsApp) + gráficos investimento/leads por dia + tabelas por Campanha/Conjunto/Anúncio. Presets de período (Tudo/Hoje/7/14/30) + datas custom. |
| `supabase/sql/2026-09-01-windsor-marketing-performance.sql` | — | DDL da tabela completa + RLS + índices + views (executado via SQL Editor). |

Variáveis de ambiente: `WINDSOR_API_KEY` (novo) + as já existentes
`PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`/`service_role`
(Vercel e `.env` local) + `CRON_SECRET`/`WINDSOR_SYNC_SECRET` (Vercel).

## Como os indicadores são calculados

- **CTR** = cliques ÷ impressões · **CPC** = investimento ÷ cliques ·
  **CPM** = investimento ÷ impressões × 1000 · **Frequência** = impressões ÷ alcance.
- **CPL médio (blended)** = investimento total ÷ leads do período (tabela
  `leads`). Não depende de casamento de nomes — funciona sempre.
- **CPL por campanha** = investimento da campanha ÷ leads cujo `utm_campaign`
  casa (normalizado, `lower(trim())`) com o nome da campanha no Windsor.
- **Leads Meta / Cadastros / Conversas WhatsApp** vêm das colunas `actions_*`
  (eventos atribuídos pela Meta) — independentes do CRM.

## Limites conhecidos

- **Casamento campanha ↔ utm_campaign**: o Windsor grava o *nome* da campanha;
  os leads gravam o valor do parâmetro `utm_campaign`. Se a operação usar slugs
  diferentes do nome (ex.: `cnh-barata` vs `A CNH Mais Barata...`), o CPL por
  campanha não casa — o CPL médio continua valendo. Ajuste: padronizar o
  `utm_campaign` dos links para o nome exato da campanha, ou alterar o join
  (view `v_cpl_campanha` + `campaignKey` no `MetaAds.jsx`/`Dash.jsx`).
- **Campos que a conta não possui ficam NULL**: se o Connectors API rejeitar
  um campo (ex.: `actions_*` de eventos nunca disparados), o sync o retira da
  query e a coluna correspondente fica NULL — o restante sincroniza normalmente.
- **Janela de refresh ~3 dias**: dados mais antigos são considerados estáveis
  pelo Windsor; correções além da janela exigem reprocesso no painel deles.
- **Não renomear/remover colunas** da tabela manualmente — quebra o sync.
- **`api/marketing.js` limita a 5000 linhas** (anúncio × dia) — suficiente para
  mais de um ano de histórico desta operação.
- **Granularidade mínima**: evitar selecionar campos de *breakdown*
  (`publisher_platform`, `device_platform`, `impression_device`) na task, pois
  multiplicam as linhas por plataforma/dispositivo e quebram a aditividade do
  alcance.

## Problemas conhecidos

### `Please check the API key used: ...` (Connectors API rejeita a chave)

A `WINDSOR_API_KEY` está errada/incompleta. A chave da query bar do
data-preview é longa e o input corta visualmente — copie selecionando o texto
inteiro. Se ainda assim falhar, a chave pode ter sido regerada: conferir em
onboard.windsor.ai → Account/API keys. O CLI devolve essa dica automaticamente
(em `.invalidKey`).

### Destination task "Supabase" do Windsor: sucesso no painel, 0 linhas no banco

Situação observada em 2026-09-01: a task `marketing-performance-diario`
reportava "Destination task ran successfully!" (Rows 1728) mas nenhuma linha
chegava ao projeto (`marketing_performance` vazia; nenhuma tabela nova em
nenhum schema — verificado via catálogo). Causa não identificada (possíveis:
task apontando para outro destino, escrita adiada pelo plano trial). Decisão:
**o sync via Connectors API (`/api/windsor-sync`) é o escritor oficial**. Se um
dia a task voltar a gravar, escolher UM escritor só: ou pausar/excluir a task
no painel do Windsor, ou remover o cron do `vercel.json` — os dois juntos
podem duplicar linhas (a task faz upsert pelas match columns; nosso sync faz
replace por período, que apagaria as linhas da task na janela sincronizada).

Referência da época (task manual, atualmente **não é o caminho ativo**): host do
IPv4 Transaction Pooler `aws-1-us-east-1.pooler.supabase.com:6543`, usuário
`postgres.dtugwspbkkqxkeoajunf`, columns to match
`date,datasource,account_id,ad_id`; só permitir o IP `168.119.226.193` se o
projeto tiver Network Restrictions ativas.

### `/api/marketing` responde 502 "Could not find the table 'public.marketing_performance'"

Não deve mais ocorrer (tabela pré-criada). Se ocorrer, rodar o SQL do repo no SQL
Editor. Antes do primeiro sync do Windsor a tabela existe mas está **vazia** — o
`/meta-ads` mostra o estado "sem dados" com aviso, e as métricas aparecem zeradas
até o primeiro upload.
