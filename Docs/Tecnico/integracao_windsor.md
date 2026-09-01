# Integração Windsor.ai — performance de mídia no Supabase

> Destino: tabela **`public.marketing_performance`** (projeto Supabase `site-alex-donega`, ref `dtugwspbkkqxkeoajunf`)
> Adicionada em: 2026-09-01 (expandida no mesmo dia: schema completo 33 colunas) · Docs do destino: <https://windsor.ai/destinations/supabase-integrations/>, <https://windsor.ai/documentation/how-to-integrate-data-into-postgresql/>

## Visão geral

O [Windsor.ai](https://windsor.ai) é um ELT de dados de marketing (350+ fontes).
Nesta integração ele puxa os dados da conta de anúncios (Meta/Facebook Ads) e
grava, **uma vez por dia**, a tabela fato **`marketing_performance`** com
granularidade **anúncio × dia** e o schema completo de 33 colunas (14 dimensões
+ 19 métricas — nomes exatos do [catálogo de campos do conector
Facebook](https://windsor.ai/data-field/facebook/)). Campanha, conjunto e anúncio
são agregações dessa fato (via views ou no próprio `/meta-ads`).

Dois consumidores no site:

- **`/dash`** — painel resumido de mídia (investimento, cliques, CPL médio) junto
  dos leads, via `GET /api/marketing`;
- **`/meta-ads`** — dashboard completa de mídia (KPIs, CTR/CPC/CPM, séries
  diárias, tabelas por campanha/conjunto/anúncio), também via `GET /api/marketing`
  + `GET /api/leads` (para CPL cruzado com o CRM).

## Fluxo dos dados

```
Meta Ads (e outras fontes) → Windsor.ai ──sync diário 07:00 UTC──▶ Supabase
  public.marketing_performance (fato anúncio × dia, 33 colunas, RLS sem policies)
        │                                   │
        │ /api/marketing (service_role)     │ views: v_meta_ads_diario,
        │ /api/leads    (service_role)      │ v_meta_ads_campanha, v_meta_ads_conjunto,
        ▼                                   │ v_meta_ads_anuncio, v_cpl_campanha
  /dash (painel resumido) ·                 ▼
  /meta-ads (dashboard completa)      SQL Editor / análises
```

## Passo 1 — Destination task no Windsor (manual, uma vez)

Em <https://onboard.windsor.ai/app/data-preview> (ou Destinations → Supabase),
"Connect Supabase" e escolha a conta **Donega Negócios Digitais** / projeto
**site-alex-donega** — host/port/user preenchem sozinhos a partir do
**IPv4 Transaction Pooler** (`aws-1-us-east-1.pooler.supabase.com:6543`,
usuário `postgres.dtugwspbkkqxkeoajunf`). Preencher o resto:

| Campo | Valor |
|---|---|
| Task name | `marketing-performance-diario` |
| Table name | `marketing_performance` (tabela **já criada** por nós — ver Passo 2) |
| Schema | (vazio — default `public`) |
| Password | 🔒 Senha do banco: Supabase → Project Settings → Database. Nunca no repo/chat. |
| Schedule type / (UTC) | `Daily` · `07:00` (= 04:00 de Brasília; dados do dia anterior já consolidados) |
| Columns to Match | `date,datasource,account_id,ad_id` |

**Columns to Match** é a chave de upsert ("rows to replace"): com a granularidade
anúncio × dia, a chave precisa incluir `ad_id` — sem isso, um re-sync da janela de
~3 dias substituiria as linhas de TODOS os anúncios da conta naquele dia.

**Colunas selecionadas** (33 — o Windsor só entrega o que estiver marcado; as
outras colunas da tabela ficam NULL):

```
date, datasource, source,
account_id, account_name, account_currency,
campaign, campaign_id, adset_name, adset_id, ad_name, ad_id, creative_id,
objective,
clicks, unique_clicks, impressions, reach, frequency, spend, cpc, cpm,
actions_link_click, actions_landing_page_view,
actions_lead, actions_leadgen_grouped, actions_offsite_conversion_fb_pixel_lead,
actions_complete_registration,
actions_offsite_conversion_fb_pixel_complete_registration,
actions_onsite_conversion_total_messaging_connection,
actions_onsite_conversion_messaging_conversation_started_7d,
cost_per_action_type_lead, cost_per_action_type_complete_registration
```

Depois: **Test Connection** → **Save** → aguardar o primeiro upload (status
"ok" no painel do Windsor). A tabela já existe (pré-criada no Passo 2), então o
Windsor apenas escreve nela — não cria nem altera schema.

### Rede

O Supabase aceita qualquer IP por padrão. **Só se** o projeto tiver *Network
Restrictions* ativas (Project Settings → Database → Network Restrictions),
liberar o IP do Windsor: `168.119.226.193`.

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

## Nossos arquivos

| Arquivo | Rota | Descrição |
|---|---|---|
| `api/marketing.js` | `GET /api/marketing` | Linhas de `marketing_performance` via `service_role` (order `date desc`, limit 5000). `405` método errado, `500` credenciais ausentes, `502` Supabase recusou (ex.: tabela inexistente). |
| `vite.config.js` | — | Middleware `devApiMarketing` replica o endpoint no `npm run dev`. |
| `src/Dash.jsx` | `/dash` | Painel de mídia resumido (investimento/cliques/CPL médio + tabela por campanha). |
| `src/MetaAds.jsx` | `/meta-ads` | Dashboard completa: 8 KPIs (Investimento, Leads CRM, CPL, Cliques, CTR, CPC, CPM, Impressões) + chips (alcance, frequência, views, leads Meta, cadastros, conversas WhatsApp) + gráficos investimento/leads por dia + tabelas por Campanha/Conjunto/Anúncio. Presets de período (Tudo/Hoje/7/14/30) + datas custom. |
| `supabase/sql/2026-09-01-windsor-marketing-performance.sql` | — | DDL da tabela completa + RLS + índices + views (executado via SQL Editor). |

Sem variáveis de ambiente novas — os endpoints reusam `PUBLIC_SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY`/`service_role` (Vercel e `.env` local).

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
- **Colunas não selecionadas no Windsor ficam NULL** na tabela (o Windsor só
  escreve os campos marcados na task). Se adicionar campos depois, rode
  novamente o SQL do repo para garantir as colunas (o bloco `alter ... add
  column if not exists` cobre).
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

### Test Connection falha / timeout

Confirmar que a conexão é pelo **pooler** (`...pooler.supabase.com:6432/6543`) — o
Windsor preenche assim por padrão; conexão direta costuma dar timeout. Checar
senha (reset em Project Settings → Database) e Network Restrictions (IP
`168.119.226.193`).

### `/api/marketing` responde 502 "Could not find the table 'public.marketing_performance'"

Não deve mais ocorrer (tabela pré-criada). Se ocorrer, rodar o SQL do repo no SQL
Editor. Antes do primeiro sync do Windsor a tabela existe mas está **vazia** — o
`/meta-ads` mostra o estado "sem dados" com aviso, e as métricas aparecem zeradas
até o primeiro upload.
