-- =============================================================================
--  leads: coluna "status" — etapa do atendimento na dashboard /lead
-- =============================================================================
--  Projeto: site-alex-donega (ref dtugwspbkkqxkeoajunf) — o mesmo do app.
--  Como rodar: Supabase Dashboard → SQL Editor → colar → Run.
--  Idempotente: pode rodar mais de uma vez, a partir de qualquer estado.
--
--  Valores da coluna Status do /lead (select inline na tabela de leads):
--    'Pagou' | 'Passou documento' | 'Vai passar dados' | 'Vai na Autoescola'
--  NULL = sem status (lead novo, ainda sem andamento no atendimento).
--  A mesma lista vive em api/leads.js (validação do PATCH) e src/Dash.jsx.
--
--  Até rodar: o GET não devolve a coluna (a tabela mostra "Sem status") e o
--  PATCH /api/leads?id= devolve erro claro pedindo este SQL.
-- =============================================================================

alter table public.leads
    add column if not exists status text;

comment on column public.leads.status is
    'Etapa do atendimento: Pagou | Passou documento | Vai passar dados | Vai na Autoescola — NULL = sem status';

-- Verificação:
--   select id, nome_completo, status from public.leads order by id desc limit 5;
