-- =============================================================================
--  "produtos": separa o nome em produto + plano (página /imagens)
-- =============================================================================
--  Projeto: site-alex-donega (ref dtugwspbkkqxkeoajunf) — o mesmo do app.
--  Como rodar: Supabase Dashboard → SQL Editor → colar → Run.
--  Idempotente: pode rodar mais de uma vez, a partir de qualquer estado.
--
--  Até aqui a linha guardava tudo junto em "nome" (ex: "Primeira habilitação
--  Carro e Moto — Plano Básico"). Passa a guardar em duas colunas:
--    produto → "Primeira habilitação Carro e Moto"
--    plano   → "Básico"
--  O backfill divide o nome existente pelo separador " — Plano " e depois a
--  coluna "nome" é REMOVIDA — sem dois lugares para a mesma informação.
--  (fotos_perfil não muda: lá "nome" é só um rótulo, não tem plano.)
-- =============================================================================

-- 1) Novas colunas.
alter table public.produtos
    add column if not exists produto text not null default '',
    add column if not exists plano   text not null default '';

-- 2) Backfill — só pega linhas ainda sem produto (primeira rodada).
update public.produtos
   set produto = split_part(nome, ' — Plano ', 1),
       plano   = split_part(nome, ' — Plano ', 2)
 where produto = ''
   and nome like '% — Plano %';

-- Linhas fora do padrão (se houver): nome inteiro vai para produto.
update public.produtos
   set produto = nome
 where produto = ''
   and nome is not null;

-- 3) Remove a coluna única antiga.
alter table public.produtos drop column if exists nome;

comment on column public.produtos.produto is
    'Produto/serviço: "Primeira habilitação Carro e Moto", "Somente uma categoria (Carro ou Moto)", "Adição (Carro ou Moto)"';
comment on column public.produtos.plano is
    'Plano: "Básico", "Ouro", "Diamante", "Bronze", "Prata"...';

-- 4) Verificação (rodar no SQL Editor):
--    select produto, plano, ordem from public.produtos order by ordem;
--    → 9 linhas, ex: "Primeira habilitação Carro e Moto" | "Básico" | 10
