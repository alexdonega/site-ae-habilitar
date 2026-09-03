-- =============================================================================
--  Tabelas "produtos" e "fotos_perfil" + bucket "imagens" — página /imagens
-- =============================================================================
--  Projeto: site-alex-donega (ref dtugwspbkkqxkeoajunf) — o mesmo do app.
--  Como rodar: Supabase Dashboard → SQL Editor → colar → Run.
--  Idempotente: pode rodar mais de uma vez, a partir de qualquer estado.
--
--  Cria:
--   • public.produtos    — produtos/orçamentos da Autoescola Habilitar com a
--     copy de WhatsApp e a imagem do orçamento (flyer) no Supabase Storage.
--     Exibidos/gerenciados na página /imagens via /api/produtos.
--   • public.fotos_perfil — fotos de perfil do WhatsApp (seção da /imagens)
--     via /api/fotos-perfil.
--   • Bucket público "imagens" no Storage: pastas produtos/ e perfil/.
--     A linha guarda imagem_url (URL pública do objeto) e imagem_path
--     (caminho no bucket, usado para apagar o objeto quando a imagem é
--     trocada ou a linha excluída).
--
--  As imagens NÃO são semeadas aqui (moram na máquina do Alex): rode depois
--  `node scripts/seed-imagens.mjs`, que sobe os arquivos das pastas
--  Downloads/produtos-orcamentos e Downloads/foto perfil para o bucket e
--  cria as linhas — idempotente pela unicidade de imagem_path abaixo.
--
--  Segurança: RLS habilitado SEM policies — nem anon nem authenticated leem;
--  apenas service_role (endpoints /api/produtos e /api/fotos-perfil) e o
--  próprio dashboard. O bucket é público: quem tem a URL vê a imagem
--  (material de marketing, ok) — mas só a service_role escreve objetos.
-- =============================================================================

-- 1) Tabelas.
create table if not exists public.produtos (
    id          bigint generated always as identity primary key,
    nome        text        not null,            -- ex: "Primeira habilitação Carro e Moto — Plano Básico"
    orcamento   text        not null default '', -- resumo dos valores: "R$ 1.297 à vista ou 10x no cartão"
    "copy"      text        not null default '', -- mensagem WhatsApp que acompanha a imagem (formatação nativa)
    imagem_url  text        not null default '', -- URL pública no bucket "imagens"
    imagem_path text        not null default '', -- caminho do objeto no bucket (p/ trocar/excluir)
    ordem       integer     not null default 0,
    ativo       boolean     not null default true,
    created_at  timestamptz not null default now()
);

create table if not exists public.fotos_perfil (
    id          bigint generated always as identity primary key,
    nome        text        not null default '', -- rótulo opcional: "Perfil atual", "Variação 1"...
    imagem_url  text        not null default '',
    imagem_path text        not null default '',
    ordem       integer     not null default 0,
    ativo       boolean     not null default true,
    created_at  timestamptz not null default now()
);

-- 2) Segurança: RLS sem policies = somente service_role (via /api/*).
alter table public.produtos enable row level security;
alter table public.fotos_perfil enable row level security;

-- 3) Índices: unicidade de imagem_path (torna o seed idempotente) + ordem.
create unique index if not exists uq_produtos_imagem_path
    on public.produtos (imagem_path)
    where imagem_path <> '';
create unique index if not exists uq_fotos_perfil_imagem_path
    on public.fotos_perfil (imagem_path)
    where imagem_path <> '';
create index if not exists idx_produtos_ordem on public.produtos (ordem);
create index if not exists idx_fotos_perfil_ordem on public.fotos_perfil (ordem);

comment on table public.produtos is
    'Produtos/orçamentos com copy de WhatsApp e imagem do flyer no Storage (bucket imagens/) — página /imagens';
comment on table public.fotos_perfil is
    'Fotos de perfil do WhatsApp — seção da página /imagens (bucket imagens/perfil/)';

-- 4) Bucket público "imagens" (5MB, só JPEG/PNG/WebP). Se já existir, mantém.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'imagens',
    'imagens',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- 5) Verificação (rodar no SQL Editor):
--    select id, ordem, ativo, nome from public.produtos order by ordem;
--    select id, ordem, ativo, nome from public.fotos_perfil order by ordem;
--    → vazio até rodar `node scripts/seed-imagens.mjs` (popula via Storage).
