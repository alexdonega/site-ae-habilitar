-- =============================================================================
--  Biblioteca de criativos — tabela criativos + bucket Storage + copy no Windsor
-- =============================================================================
--  Projeto: site-alex-donega (ref dtugwspbkkqxkeoajunf) — o mesmo do app.
--  Como rodar: Supabase Dashboard → SQL Editor → colar → Run.
--  Idempotente: pode rodar mais de uma vez, a partir de qualquer estado.
--
--  1) Tabela public.criativos: biblioteca de criativos (imagem/vídeo) para o
--     gestor de tráfego — mídia no bucket "criativos" + copy + referência ao
--     anúncio que já rodou (campos espelham os nomes da marketing_performance:
--     campaign, adset_name, ad_name, creative_id).
--  2) Bucket público de Storage "criativos": a mídia é servida em
--     /storage/v1/object/public/criativos/<caminho> (URL gravada em arquivo_url).
--     Uploads acontecem via service_role (API) ou signed upload URL criada no
--     servidor — o arquivo nunca passa pela função da Vercel (limite ~4,5MB).
--  3) marketing_performance: colunas de copy do anúncio, validadas na
--     Connectors API em 2026-09-03 COM dados para a conta Auto Escola Habilitar:
--       headline / body / title / description / image_url / thumbnail_url
--     (body = texto principal, title = headline exibida no anúncio). Campos de
--     nível criativo — não multiplicam linhas (mesmo grain de creative_id).
--
--  Depois de rodar este SQL, re-sincronizar o histórico para preencher as
--  colunas novas de copy (o sync introspecta o schema — até rodar, ele grava
--  só as colunas existentes e reporta skippedColumns):
--    node scripts/windsor-sync.mjs --from=2026-06-01 --to=2026-09-03
--  (janela máxima de 92 dias por chamada — repetir por período)
-- =============================================================================

-- 1) Tabela de criativos -------------------------------------------------------
create table if not exists public.criativos (
    id uuid primary key default gen_random_uuid(),
    titulo text not null,
    tipo text not null check (tipo in ('imagem', 'video')),
    formato text,
    arquivo_nome text unique,          -- nome original do arquivo (dedup da carga)
    arquivo_path text not null,        -- caminho no bucket "criativos"
    arquivo_url text not null,         -- URL pública do Storage
    -- copy usada no anúncio (fonte: Windsor — body/title do Meta Ads)
    headline text,                     -- ← Windsor "title" (headline exibida)
    texto_principal text,              -- ← Windsor "body" (primary text)
    descricao text,                    -- ← Windsor "description"
    -- referência ao tráfego pago (nomes idênticos aos de marketing_performance)
    campaign text,
    adset_name text,
    ad_name text,
    creative_id text,
    status text not null default 'novo'
        check (status in ('novo', 'aprovado', 'em_uso', 'arquivado')),
    observacoes text,
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

comment on table public.criativos is
    'Biblioteca de criativos (imagem/vídeo) para o gestor de tráfego — mídia no bucket Storage "criativos", copy do anúncio e referência à campanha/conjunto/anúncio que já rodou. Página: /criativos.';

create index if not exists idx_criativos_status on public.criativos (status);
create index if not exists idx_criativos_tipo on public.criativos (tipo);
create index if not exists idx_criativos_criado_em on public.criativos (criado_em desc);

-- atualizado_em sempre fresco em UPDATE
create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
    new.atualizado_em = now();
    return new;
end;
$$;

drop trigger if exists trg_criativos_atualizado_em on public.criativos;
create trigger trg_criativos_atualizado_em
    before update on public.criativos
    for each row execute function public.set_atualizado_em();

-- Mesmo padrão de acesso de marketing_performance/leads: RLS ligado SEM
-- policies — só service_role (server-side nas /api) lê e escreve.
alter table public.criativos enable row level security;

-- 2) Bucket público de Storage -------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('criativos', 'criativos', true, 209715200)  -- 200MB (plano decide o real)
on conflict (id) do nothing;

-- 3) Copy dos anúncios na marketing_performance --------------------------------
alter table public.marketing_performance
    add column if not exists headline text,
    add column if not exists body text,
    add column if not exists title text,
    add column if not exists description text,
    add column if not exists image_url text,
    add column if not exists thumbnail_url text;

-- 4) View de anúncios passa a expor a copy (colunas novas no FIM —
--    create or replace permite acrescentar; nada depende desta view).
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
    sum(actions_complete_registration) as registrations,
    max(headline)  as headline,
    max(body)      as texto_principal
from public.marketing_performance
group by ad_id;

-- Verificação rápida (após o Run e o re-backfill do Windsor):
--   select count(*) from public.criativos;
--   select ad_name, headline, left(texto_principal, 60) as texto
--     from public.v_meta_ads_anuncio order by spend desc limit 10;
--   select id, name, public from storage.buckets where id = 'criativos';
