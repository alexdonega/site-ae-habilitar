-- =============================================================================
--  Tabela "mensagens" — scripts de WhatsApp exibidos em /mensagens
-- =============================================================================
--  Projeto: site-alex-donega (ref dtugwspbkkqxkeoajunf) — o mesmo do app.
--  Como rodar: Supabase Dashboard → SQL Editor → colar → Run.
--  Idempotente: pode rodar mais de uma vez, a partir de qualquer estado.
--
--  Cria public.mensagens com as mensagens de comunicação e orçamentos da
--  Autoescola Habilitar (coladas por Alex em 2026-09-03, conteúdo verbatim).
--  O campo "conteudo" guarda texto PURO com a formatação nativa do WhatsApp:
--    *negrito*  _itálico_  ~riscado~  ```monoespaçado```
--  A página /mensagens renderiza o preview em mockup de celular e o botão
--  "Copiar" devolve exatamente o texto salvo aqui (cola perfeito no WhatsApp).
--
--  Segurança: RLS habilitado SEM policies — nem anon nem authenticated leem;
--  apenas service_role (endpoint /api/mensagens) e o próprio dashboard.
--
--  Para editar uma mensagem depois: Supabase Dashboard → Table Editor →
--  mensagens → ajustar "conteudo" (ou rodar um UPDATE). O seed abaixo usa
--  ON CONFLICT DO NOTHING justamente para nunca sobrescrever edições.
-- =============================================================================

-- 1) Tabela.
create table if not exists public.mensagens (
    id          bigint generated always as identity primary key,
    categoria   text        not null,   -- 'Comunicação' | 'Orçamentos'
    titulo      text        not null,
    conteudo    text        not null,   -- texto puro com formatação WhatsApp
    ordem       integer     not null default 0,
    ativo       boolean     not null default true,
    created_at  timestamptz not null default now()
);

-- 2) Segurança: RLS sem policies = somente service_role (via /api/mensagens).
alter table public.mensagens enable row level security;

-- 3) Índices: unicidade para o seed idempotente + ordem de exibição.
create unique index if not exists uq_mensagens_categoria_titulo
    on public.mensagens (categoria, titulo);
create index if not exists idx_mensagens_ordem
    on public.mensagens (ordem);

comment on table public.mensagens is
    'Scripts de mensagens WhatsApp (boas-vindas, oferta, orçamentos) exibidos em /mensagens';

-- 4) Seed — conteúdo verbatim, na ordem em que aparece na página.
--    DO NOTHING garante que re-rodar nunca sobrescreve edições manuais.
insert into public.mensagens (categoria, titulo, conteudo, ordem, ativo) values
-- ── Comunicação ──────────────────────────────────────────────────────────────
(
    'Comunicação',
    'Boas-vindas — pós-inscrição no formulário',
    $msg$✅ *PRÉ-INSCRIÇÃO CONFIRMADA!*
Agora falta pouco! Serão apenas *50 vagas* e nesta *sexta-feira, dia 04 de setembro*, entrarei em contato para te passar o valor da *MEGA OFERTA*, o menor preço da história de Sorriso para você tirar sua CNH.
⚠️ *Importante*: falta só mais um passo. Salve este contato no seu WhatsApp agora mesmo para garantir que você receba minha mensagem na sexta.
✏️ Para finalizar, confirme rapidinho:
Seu nome completo: Raimundo ferreira de Araújo
Categoria da CNH desejada: Moto [A]$msg$,
    1,
    true
),
(
    'Comunicação',
    'Abertura do carrinho — dia da oferta',
    $msg${primeiro-nome} está liberado a *MEGA OFERTA*, o *menor preço da história de Sorriso* para tirar a sua {produto} com a Autoescola Habilitar + CNH Brasil.
para {produto} tínhamos 10 vagas, e já tivemos as duas primeiras vendas.
essa condição é válida _somente hoje e amanhã_, até acabarem as *8 vagas restantes* — e esse valor *não vai se repetir*.
as condições completas eu já te mando agora 👇$msg$,
    2,
    true
),
-- ── Orçamentos: primeira habilitação (Carro e Moto) ──────────────────────────
(
    'Orçamentos',
    'Primeira habilitação Carro e Moto — Plano Básico',
    $msg$🔰 PLANO BÁSICO
✔️Acesso ao sistema
✔️Taxa Administrativa
✔️ 02 aulas de moto
✔️ 02 aulas de carro
✔️ Veículo para a prova e acompanhamento do Instrutor

Formas de pagamento: à vista, cartão, boleto

À vista: de R$ 1.499,99 por apenas 1.297
Cartão: até 10x cartão
Boleto: Entrada + boletos
(Taxas, exames e biometria não estão inclusos no pacote)
👉🏼Exame toxicológico Obrigatório$msg$,
    10,
    true
),
(
    'Orçamentos',
    'Primeira habilitação Carro e Moto — Plano Ouro',
    $msg$🔰 PLANO OURO
✔️Acesso ao sistema
✔️Taxa Administrativa
✔️ 05 aulas de moto
✔️ 05 aulas de carro
✔️Veículo para a prova e acompanhamento do Instrutor

Formas de Pagamento: à vista, cartão, boleto

À vista: R$ 1.849,99 por apenas 1.647
Cartão: até 10x cartão
Boleto: Entrada + boletos

(Taxas, exames e biometria não estão inclusos no pacote)
👉🏼*Exame toxicológico Obrigatório$msg$,
    11,
    true
),
(
    'Orçamentos',
    'Primeira habilitação Carro e Moto — Plano Diamante',
    $msg$🔰 PLANO DIAMANTE
✔️Acesso ao sistema
✔️Taxa Administrativa
✔️ 10 aulas de moto
✔️ 10 aulas de carro
✔️Veículo para a prova e acompanhamento do Instrutor

Formas de pagamento: à vista, cartão, boleto

À vista: de R$ 2.299,99 por apenas R$ 2.097
Cartão: até 10x cartão
Boleto: Entrada + boletos

(Taxas, exames e biometria não estão inclusos no pacote)
👉🏼*Exame toxicológico Obrigatório$msg$,
    12,
    true
),
-- ── Orçamentos: somente uma categoria (Carro ou Moto) ────────────────────────
(
    'Orçamentos',
    'Somente uma categoria (Carro ou Moto) — Plano Bronze',
    $msg$🥉 PLANO BRONZE
✔️ Acesso ao sistema
✔️ Taxa Administrativa
✔️2 Aulas práticas
✔️ Veículo para a prova e acompanhamento do Instrutor

Formas de pagamento: à vista, cartão, boleto

À vista: de 997,00 por apenas 897,00
Cartão: até 10x cartão
Boleto: Entrada + boletos

(Taxas, exames e biometria não estão inclusos no pacote)$msg$,
    13,
    true
),
(
    'Orçamentos',
    'Somente uma categoria (Carro ou Moto) — Plano Prata',
    $msg$🥈 PLANO PRATA
✔️ Acesso ao sistema
✔️ Taxa Administrativa
✔️5 Aulas práticas
✔️Aluguel do Veículo para a prova e acompanhamento do Instrutor

Formas de pagamento: à vista, cartão, boleto

À vista: de 1.397,00 POR APENAS 1.2970,00
Cartão: até 10x cartão
Boleto: Entrada + boletos

(Taxas, exames e biometria não estão inclusos no pacote)$msg$,
    14,
    true
),
(
    'Orçamentos',
    'Somente uma categoria (Carro ou Moto) — Plano Ouro',
    $msg$🥇 PLANO OURO
✔️Acesso ao sistema
✔️Taxa Administrativa
✔️10 Aulas práticas
✔️Aluguel do Veículo para a prova e acompanhamento do Instrutor

Formas de pagamento: à vista, cartão, boleto

À vista: de 1.797,00 por apenas 1.697,00
Cartão: até 10x cartão
Boleto: Entrada + boletos

(Taxas, exames e biometria não estão inclusos no pacote)$msg$,
    15,
    true
),
-- ── Orçamentos: adição (Carro ou Moto) ───────────────────────────────────────
(
    'Orçamentos',
    'Adição (Carro ou Moto) — Plano Bronze',
    $msg$🥉 PLANO BRONZE
✔️ Acesso ao sistema
✔️ Taxa Administrativa
✔️2 Aulas práticas
✔️ Veículo para a prova e acompanhamento do Instrutor

Formas de pagamento: à vista, cartão, boleto

À vista: de 997,00 por apenas 897,00
Cartão: até 10x cartão
Boleto: Entrada + boletos

(Taxas, exames e biometria não estão inclusos no pacote)$msg$,
    16,
    true
),
(
    'Orçamentos',
    'Adição (Carro ou Moto) — Plano Prata',
    $msg$🥈 PLANO PRATA
✔️ Acesso ao sistema
✔️ Taxa Administrativa
✔️5 Aulas práticas
✔️Aluguel do Veículo para a prova e acompanhamento do Instrutor

Formas de pagamento: à vista, cartão, boleto

À vista: de 1.397,00 por apenas 1.2970,00
Cartão: até 10x cartão
Boleto: Entrada + boletos

(Taxas, exames e biometria não estão inclusos no pacote)$msg$,
    17,
    true
),
(
    'Orçamentos',
    'Adição (Carro ou Moto) — Plano Ouro',
    $msg$🥇 PLANO OURO
✔️Acesso ao sistema
✔️Taxa Administrativa
✔️10 Aulas práticas
✔️Aluguel do Veículo para a prova e acompanhamento do Instrutor

Formas de pagamento: à vista, cartão, boleto

À vista: de 1.797 por apenas 1.697
Cartão: até 10x cartão
Boleto: Entrada + boletos

(Taxas, exames e biometria não estão inclusos no pacote)$msg$,
    18,
    true
)
on conflict (categoria, titulo) do nothing;

-- 5) Verificação (rodar no SQL Editor):
--    select categoria, ordem, titulo, ativo from public.mensagens order by ordem;
--    → 11 linhas (2 Comunicação + 9 Orçamentos).
