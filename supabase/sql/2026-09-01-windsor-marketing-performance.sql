-- =============================================================================
--  Windsor.ai → Supabase: tabela fato COMPLETA de mídia + views de análise
-- =============================================================================
--  Projeto: site-alex-donega (ref dtugwspbkkqxkeoajunf) — o mesmo do app.
--  Como rodar: Supabase Dashboard → SQL Editor → colar → Run.
--  Idempotente: pode rodar mais de uma vez (IF NOT EXISTS em tudo).
--
--  A tabela é PRÉ-CRIADA aqui com o schema completo (33 colunas — nomes exatos
--  do catálogo de campos do conector Facebook Ads do Windsor:
--  https://windsor.ai/data-field/facebook/). A destination task do Windsor
--  (table name "marketing_performance") escreve nela — granularidade
--  anúncio × dia, pois o campo ad_id/ad_name está no conjunto selecionado.
--
--  Campos que o Windsor deve sincronizar (task → "columns selected"):
--    date, datasource, source, account_id, account_name, account_currency,
--    campaign, campaign_id, adset_name, adset_id, ad_name, ad_id, creative_id,
--    objective, clicks, unique_clicks, impressions, reach, frequency,
--    spend, cpc, cpm, actions_link_click, actions_landing_page_view,
--    actions_lead, actions_leadgen_grouped, actions_offsite_conversion_fb_pixel_lead,
--    actions_complete_registration,
--    actions_offsite_conversion_fb_pixel_complete_registration,
--    actions_onsite_conversion_total_messaging_connection,
--    actions_onsite_conversion_messaging_conversation_started_7d,
--    cost_per_action_type_lead, cost_per_action_type_complete_registration
--
--  Columns to Match (chave de upsert no Windsor, grain anúncio × dia):
--    date,datasource,account_id,ad_id
--
--  Runbook: Docs/Tecnico/integracao_windsor.md
-- =============================================================================

-- 1) Tabela fato ----------------------------------------------------------------

create table if not exists public.marketing_performance (
    date                         date,
    datasource                   text,
    source                       text,
    account_id                   text,
    account_name                 text,
    account_currency             text,
    campaign                     text,
    campaign_id                  text,
    adset_name                   text,
    adset_id                     text,
    ad_name                      text,
    ad_id                        text,
    creative_id                  text,
    objective                    text,
    clicks                       numeric,
    unique_clicks                numeric,
    impressions                  numeric,
    reach                        numeric,
    frequency                    numeric,
    spend                        numeric,
    cpc                          numeric,
    cpm                          numeric,
    actions_link_click           numeric,
    actions_landing_page_view    numeric,
    actions_lead                 numeric,
    actions_leadgen_grouped      numeric,
    actions_offsite_conversion_fb_pixel_lead numeric,
    actions_complete_registration numeric,
    actions_offsite_conversion_fb_pixel_complete_registration numeric,
    actions_onsite_conversion_total_messaging_connection numeric,
    actions_onsite_conversion_messaging_conversation_started_7d numeric,
    cost_per_action_type_lead    numeric,
    cost_per_action_type_complete_registration numeric
);

-- Completa colunas caso a tabela já exista com schema parcial (ex.: criada
-- antes pelo Windsor com menos campos).
alter table public.marketing_performance add column if not exists date date;
alter table public.marketing_performance add column if not exists datasource text;
alter table public.marketing_performance add column if not exists source text;
alter table public.marketing_performance add column if not exists account_id text;
alter table public.marketing_performance add column if not exists account_name text;
alter table public.marketing_performance add column if not exists account_currency text;
alter table public.marketing_performance add column if not exists campaign text;
alter table public.marketing_performance add column if not exists campaign_id text;
alter table public.marketing_performance add column if not exists adset_name text;
alter table public.marketing_performance add column if not exists adset_id text;
alter table public.marketing_performance add column if not exists ad_name text;
alter table public.marketing_performance add column if not exists ad_id text;
alter table public.marketing_performance add column if not exists creative_id text;
alter table public.marketing_performance add column if not exists objective text;
alter table public.marketing_performance add column if not exists clicks numeric;
alter table public.marketing_performance add column if not exists unique_clicks numeric;
alter table public.marketing_performance add column if not exists impressions numeric;
alter table public.marketing_performance add column if not exists reach numeric;
alter table public.marketing_performance add column if not exists frequency numeric;
alter table public.marketing_performance add column if not exists spend numeric;
alter table public.marketing_performance add column if not exists cpc numeric;
alter table public.marketing_performance add column if not exists cpm numeric;
alter table public.marketing_performance add column if not exists actions_link_click numeric;
alter table public.marketing_performance add column if not exists actions_landing_page_view numeric;
alter table public.marketing_performance add column if not exists actions_lead numeric;
alter table public.marketing_performance add column if not exists actions_leadgen_grouped numeric;
alter table public.marketing_performance add column if not exists actions_offsite_conversion_fb_pixel_lead numeric;
alter table public.marketing_performance add column if not exists actions_complete_registration numeric;
alter table public.marketing_performance add column if not exists actions_offsite_conversion_fb_pixel_complete_registration numeric;
alter table public.marketing_performance add column if not exists actions_onsite_conversion_total_messaging_connection numeric;
alter table public.marketing_performance add column if not exists actions_onsite_conversion_messaging_conversation_started_7d numeric;
alter table public.marketing_performance add column if not exists cost_per_action_type_lead numeric;
alter table public.marketing_performance add column if not exists cost_per_action_type_complete_registration numeric;

-- 2) Segurança: RLS sem policies = somente postgres (Windsor) e service_role
--    (funções serverless do app) acessam. A anon key é pública no bundle da
--    landing e não pode listar investimento.
alter table public.marketing_performance enable row level security;

-- 3) Índices (filtro/ordenação por data e drilldown por campanha)
create index if not exists idx_marketing_performance_date
    on public.marketing_performance (date);
create index if not exists idx_marketing_performance_campaign_id
    on public.marketing_performance (campaign_id);

-- 4) Views de análise (security_invoker → respeitam o RLS das tabelas base;
--    a anon key não lê por aqui também) --------------------------------------

-- Totais por dia (série temporal do /meta-ads).
create or replace view public.v_meta_ads_diario
with (security_invoker = true) as
select
    date,
    sum(spend)     as spend,
    sum(impressions) as impressions,
    sum(reach)     as reach,
    sum(clicks)    as clicks,
    sum(actions_lead) as leads_meta,
    sum(actions_complete_registration) as registrations,
    sum(actions_onsite_conversion_total_messaging_connection) as messaging_connections
from public.marketing_performance
group by date;

-- Totais por campanha.
create or replace view public.v_meta_ads_campanha
with (security_invoker = true) as
select
    campaign_id,
    max(campaign) as campaign,
    sum(spend)     as spend,
    sum(impressions) as impressions,
    sum(reach)     as reach,
    sum(clicks)    as clicks,
    sum(actions_lead) as leads_meta,
    sum(actions_complete_registration) as registrations,
    sum(actions_onsite_conversion_total_messaging_connection) as messaging_connections
from public.marketing_performance
group by campaign_id;

-- Totais por conjunto (adset), com a campanha pai.
create or replace view public.v_meta_ads_conjunto
with (security_invoker = true) as
select
    adset_id,
    max(adset_name) as adset_name,
    max(campaign)   as campaign,
    sum(spend)     as spend,
    sum(impressions) as impressions,
    sum(reach)     as reach,
    sum(clicks)    as clicks,
    sum(actions_lead) as leads_meta,
    sum(actions_complete_registration) as registrations
from public.marketing_performance
group by adset_id;

-- Totais por anúncio, com conjunto e campanha pais.
create or replace view public.v_meta_ads_anuncio
with (security_invoker = true) as
select
    ad_id,
    max(ad_name)    as ad_name,
    max(adset_name) as adset_name,
    max(campaign)   as campaign,
    sum(spend)     as spend,
    sum(impressions) as impressions,
    sum(reach)     as reach,
    sum(clicks)    as clicks,
    sum(actions_lead) as leads_meta,
    sum(actions_complete_registration) as registrations
from public.marketing_performance
group by ad_id;

-- CPL por dia × campanha: spend do Windsor × leads da tabela leads
-- (join exige utm_campaign = nome da campanha, normalizado).
create or replace view public.v_cpl_campanha
with (security_invoker = true) as
select
    m.date,
    m.datasource,
    m.campaign,
    sum(m.spend)  as spend,
    sum(m.clicks) as clicks,
    count(l.id)   as leads
from public.marketing_performance m
left join public.leads l
    on l.created_at::date = m.date
   and lower(trim(coalesce(l.utm_campaign, ''))) = lower(trim(m.campaign))
group by m.date, m.datasource, m.campaign;

comment on table public.marketing_performance is
    'Fato de mídia (anúncio × dia) gravada pelo Windsor.ai — conector Facebook Ads. Ver Docs/Tecnico/integracao_windsor.md no repo ae-habilitar.';

-- Verificação rápida (após o Run e depois do primeiro sync do Windsor):
--   select count(*) from public.marketing_performance;
--   select * from public.v_meta_ads_diario order by date desc limit 14;
--   select * from public.v_meta_ads_anuncio order by spend desc limit 10;
