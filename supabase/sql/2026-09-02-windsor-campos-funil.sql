-- =============================================================================
--  Windsor → marketing_performance: colunas do funil WhatsApp/engajamento
-- =============================================================================
--  Projeto: site-alex-donega (ref dtugwspbkkqxkeoajunf) — o mesmo do app.
--  Como rodar: Supabase Dashboard → SQL Editor → colar → Run.
--  Idempotente: pode rodar mais de uma vez, a partir de qualquer estado.
--
--  Adiciona 7 colunas (grain anúncio × dia, conector Facebook Ads do Windsor),
--  todas validadas na Connectors API em 2026-09-02 COM dados para a conta
--  Auto Escola Habilitar:
--    actions_onsite_conversion_messaging_first_reply
--      → respostas enviadas pelo lead no WhatsApp (1ª resposta)
--    cost_per_messaging_connection
--      → custo por conversa WhatsApp iniciada ("cost per result" do Ads
--        Manager). ⚠️ Nome ENCURTADO: o nome original do Windsor
--        (cost_per_action_type_onsite_conversion_total_messaging_connection)
--        tem 64 chars e o Postgres trunca identificadores em 63 — a coluna
--        nascia com nome cortado e o INSERT do sync falhava (PGRST204).
--        O sync mapeia o campo → esta coluna (COLUMN_ALIASES em api/_windsor.js).
--    cost_per_action_type_onsite_conversion_messaging_first_reply
--      → custo por resposta no WhatsApp (62 chars, cabe sem truncar)
--    cost_per_messaging_started_7d
--      → custo por conversa iniciada (janela 7d). ⚠️ Nome ENCURTADO, mesmo
--        motivo (original com 71 chars).
--    actions_post_engagement     → engajamento com a publicação
--    inline_link_clicks          → cliques no link (o "clicks" do Meta inclui
--                                  cliques gerais: perfil, reactions etc.)
--    cost_per_inline_link_click  → custo por clique no link
--
--  A primeira execução (2026-09-02) criou colunas TRUNCADAS para os dois
--  campos longos — o bloco DO abaixo as remove se existirem.
--
--  Depois de rodar este SQL, re-sincronizar o histórico para preencher as
--  colunas novas (o sync introspecta o schema: até rodar, ele grava só as
--  colunas existentes e reporta skippedColumns):
--    curl "https://autoescolahabilitar.vercel.app/api/windsor-sync?secret=...&from=2024-02-01&to=..."
--  (janela máxima de 92 dias por chamada — repetir por período)
-- =============================================================================

-- 1) Remove colunas truncadas criadas pela 1a execução deste script (nomes
--    cortados em 63 chars) — estão vazias e com nomes inválidos.
do $$
declare c text;
begin
    for c in
        select column_name from information_schema.columns
        where table_schema = 'public'
          and table_name = 'marketing_performance'
          and (column_name like 'cost\_per\_action\_type\_onsite\_conversion\_total\_messaging\_connec%'
            or column_name like 'cost\_per\_action\_type\_onsite\_conversion\_messaging\_conversation%')
    loop
        execute format('alter table public.marketing_performance drop column %I', c);
    end loop;
end $$;

-- 2) Colunas novas (nomes <= 63 chars).
alter table public.marketing_performance
    add column if not exists actions_onsite_conversion_messaging_first_reply numeric,
    add column if not exists cost_per_messaging_connection numeric,
    add column if not exists cost_per_action_type_onsite_conversion_messaging_first_reply numeric,
    add column if not exists cost_per_messaging_started_7d numeric,
    add column if not exists actions_post_engagement numeric,
    add column if not exists inline_link_clicks numeric,
    add column if not exists cost_per_inline_link_click numeric;

-- 3) Views de análise com o funil WhatsApp. DROP + CREATE (e não
--    "create or replace") porque reordenam/renomeiam colunas — o Postgres só
--    permite replace acrescentando colunas NO FIM (erro 42P16 "cannot change
--    name of view column"). Nada depende destas views (o app lê a tabela via
--    /api/marketing).
drop view if exists public.v_meta_ads_diario;
drop view if exists public.v_meta_ads_campanha;

create view public.v_meta_ads_diario
with (security_invoker = true) as
select
    date,
    sum(spend)     as spend,
    sum(impressions) as impressions,
    sum(reach)     as reach,
    sum(clicks)    as clicks,
    sum(inline_link_clicks) as link_clicks,
    sum(actions_landing_page_view) as landing_views,
    sum(actions_lead) as leads_meta,
    sum(actions_complete_registration) as registrations,
    sum(actions_onsite_conversion_total_messaging_connection) as messaging_connections,
    sum(actions_onsite_conversion_messaging_first_reply) as messaging_replies,
    sum(actions_onsite_conversion_messaging_conversation_started_7d) as messaging_started_7d
from public.marketing_performance
group by date;

create view public.v_meta_ads_campanha
with (security_invoker = true) as
select
    campaign_id,
    max(campaign) as campaign,
    sum(spend)     as spend,
    sum(impressions) as impressions,
    sum(reach)     as reach,
    sum(clicks)    as clicks,
    sum(inline_link_clicks) as link_clicks,
    sum(actions_landing_page_view) as landing_views,
    sum(actions_lead) as leads_meta,
    sum(actions_complete_registration) as registrations,
    sum(actions_onsite_conversion_total_messaging_connection) as messaging_connections,
    sum(actions_onsite_conversion_messaging_first_reply) as messaging_replies
from public.marketing_performance
group by campaign_id;

-- 4) CPL por dia × campanha: o join casa o lead por campaign_id OU pelo nome
--    da campanha (o utm_campaign dos anúncios desta operação vem com o ID da
--    campanha, ex.: 120248846128830407). Também DROP + CREATE.
drop view if exists public.v_cpl_campanha;

create view public.v_cpl_campanha
with (security_invoker = true) as
select
    m.date,
    m.datasource,
    m.campaign_id,
    m.campaign,
    sum(m.spend)  as spend,
    sum(m.clicks) as clicks,
    sum(m.actions_onsite_conversion_total_messaging_connection) as messaging_connections,
    count(l.id)   as leads
from public.marketing_performance m
left join public.leads l
    on l.created_at::date = m.date
   and (
        coalesce(l.utm_campaign, '') = m.campaign_id
     or lower(trim(coalesce(l.utm_campaign, ''))) = lower(trim(m.campaign))
   )
group by m.date, m.datasource, m.campaign_id, m.campaign;

-- Verificação rápida (após o Run e o re-backfill):
--   select count(*) from public.marketing_performance;
--   select date, messaging_connections, messaging_replies, link_clicks
--     from public.v_meta_ads_diario order by date desc limit 14;
--   select campaign, spend, leads, round(spend/nullif(leads,0),2) as cpl
--     from public.v_cpl_campanha order by spend desc limit 10;
