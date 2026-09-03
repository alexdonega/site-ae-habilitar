-- =============================================================================
--  mensagens: coluna updated_at (+ trigger) para as colunas "Atualizado"
-- =============================================================================
--  Projeto: site-alex-donega (ref dtugwspbkkqxkeoajunf) — o mesmo do app.
--  Como rodar: Supabase Dashboard → SQL Editor → colar → Run.
--  Idempotente: pode rodar mais de uma vez, a partir de qualquer estado.
--
--  Adiciona updated_at (a tabela já tem created_at) e um trigger que a
--  mantém fresca a cada UPDATE — alimenta a coluna "Atualizado" do /mensagens
--  e funciona de graça para o PATCH do /api/mensagens (nenhuma mudança lá).
--
--  Até rodar, a página mostra "—" na coluna Atualizado (o GET só devolve as
--  colunas que existem) e tudo o mais continua funcionando.
-- =============================================================================

-- 1) Coluna (linhas existentes ficam com updated_at = now() do momento do Run).
alter table public.mensagens
    add column if not exists updated_at timestamptz not null default now();

-- 2) Função + trigger: updated_at sempre fresco em UPDATE.
create or replace function public.set_updated_at()
    returns trigger
    language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end $$;

drop trigger if exists trg_mensagens_updated_at on public.mensagens;
create trigger trg_mensagens_updated_at
    before update on public.mensagens
    for each row execute function public.set_updated_at();

-- 3) Verificação:
--    select titulo, created_at, updated_at from public.mensagens order by ordem limit 3;
--    → updated_at preenchido nas 11 linhas.
