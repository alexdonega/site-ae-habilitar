-- =============================================================================
--  mensagens: coluna "abertura" — a mensagem enviada ANTES do orçamento
-- =============================================================================
--  Projeto: site-alex-donega (ref dtugwspbkkqxkeoajunf) — o mesmo do app.
--  Como rodar: Supabase Dashboard → SQL Editor → colar → Run.
--  Idempotente: pode rodar mais de uma vez, a partir de qualquer estado.
--
--  Os orçamentos do /mensagens são enviados em DUAS mensagens no WhatsApp:
--  primeiro a abertura (a MEGA OFERTA "Abertura do carrinho" — "as condições
--  completas eu já te mando agora 👇"), logo depois o orçamento em si. A
--  coluna guarda o texto da abertura em cada linha de orçamento (texto PURO
--  com formatação WhatsApp, igual ao "conteudo"); NULL = envio de 1 mensagem.
--
--  No editor (/mensagens/:id de categoria Orçamentos) o botão "Adicionar
--  mensagem" abre o campo pré-preenchido com a "Abertura do carrinho" da
--  biblioteca; o mockup mostra as duas bolhas na ordem de envio.
--
--  Até rodar este DDL: o GET não devolve a coluna (o editor não reabre o
--  campo) e o /api/mensagens grava normalmente sem a abertura quando ela
--  vem vazia — salvar COM abertura devolve erro pedindo este SQL.
-- =============================================================================

alter table public.mensagens
    add column if not exists abertura text;

comment on column public.mensagens.abertura is
    'Mensagem enviada ANTES desta, no mesmo atendimento (ex.: a MEGA OFERTA antes do orçamento) — texto puro com formatação WhatsApp; NULL = envio de uma mensagem só';

-- Verificação:
--   select ordem, titulo, (abertura is not null) as tem_abertura
--   from public.mensagens order by ordem;
