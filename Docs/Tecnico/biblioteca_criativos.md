# Biblioteca de Criativos (`/criativos`)

Biblioteca de criativos (imagem/vídeo) para o **gestor de tráfego** da Autoescola
Habilitar: o Alex produz e sobe a mídia, o gestor acessa a página pública,
visualiza, dá play nos vídeos, copia a copy e baixa os arquivos para usar nas
campanhas. Não é um swipe file de referência — é o estoque da operação.

| Peça | Onde |
|---|---|
| Página | `src/Criativos.jsx` (rota `/criativos` em `src/main.jsx`) |
| Editor dedicado | `src/CriativosEditar.jsx` (rotas `/criativos/:id` e `/criativos/novo`) |
| API | `api/criativos.js` (núcleo em `api/_criativos.js`) |
| Tabela | `public.criativos` (Supabase) |
| Mídia | bucket público `criativos` do Supabase Storage |
| DDL | `supabase/sql/2026-09-04-criativos.sql` (SQL Editor → colar → Run) |
| Carga inicial | `scripts/criativos-upload.mjs` |

Criar/editar usa uma **página dedicada** (mesmo padrão do `/imagens/produto/:id`):
mídia grande à esquerda — vídeo com player nativo — e campos/copy à direita. A
troca de mídia no editor substitui o objeto no Storage (o antigo é removido) e
atualiza `arquivo_path`/`arquivo_url`.

## Modelo de dados

A tabela `criativos` espelha os nomes de referência da `marketing_performance`
(`campaign`, `adset_name`, `ad_name`, `creative_id`) e guarda a copy usada no
tráfego pago. Fonte da copy: **Windsor.ai** (conector Facebook Ads), campos
`body` (texto principal) e `title` (headline exibida) — ver
[`integracao_windsor.md`](integracao_windsor.md).

- `tipo`: `imagem` | `video` — define o player no card.
- `status`: `novo` → `aprovado` → `em_uso` → `arquivado` (ciclo de vida no card).
- `arquivo_nome` **único**: dedup da carga e do upload (reenviar o mesmo arquivo
  retorna 409).
- `arquivo_path`/`arquivo_url`: caminho no bucket e URL pública
  (`/storage/v1/object/public/criativos/<aaaa-mm>/<slug>`).

RLS habilitado **sem** policies (mesmo padrão de `marketing_performance`):
apenas a service_role lê/escreve, sempre server-side.

## Acesso

Página aberta, leitura **e** escrita sem token — decisão do Alex em
2026-09-03, mesmo padrão de `/imagens` (`/api/produtos` e `/api/fotos-perfil`
também aceitam escrita sem auth). A proteção real é a service_role, que nunca
sai do servidor (RLS sem policies bloqueia a anon key).

## Upload (por que signed upload URL)

A função serverless da Vercel limita o corpo da requisição a ~4,5MB — vídeos
não passam. O fluxo contorna:

1. `POST /api/criativos {action:'upload-url', filename}` → o servidor gera o
   caminho (`<aaaa-mm>/<slug>`, o cliente não escolhe) e uma **signed upload
   URL** (validade 1h) via service_role.
2. O navegador faz `PUT` direto no Storage do Supabase com o arquivo
   (XMLHttpRequest, barra de progresso) — nunca passa pela Vercel.
3. `POST /api/criativos` com `arquivo_path` + metadados → insere a row com a
   URL pública.

Limite de arquivo do bucket: 200MB declarado no DDL — o plano da conta decide
o teto real (free: ~50MB/arquivo; `ads.mp4` com 63MB exige Pro ou compressão).

## API `/api/criativos`

| Método | Chamada | Faz |
|---|---|---|
| GET | `/api/criativos` | Lista tudo (`criado_em desc`). |
| POST | `{action:'upload-url', filename}` | Signed upload URL + path + publicUrl. |
| POST | `{arquivo_path, titulo, tipo, …}` | Registra o criativo (409 se `arquivo_nome` repetido). |
| PATCH | `?id=…` | Atualiza campos editáveis (status, copy, referências…). |
| DELETE | `?id=…` | Remove a row **e** o objeto do Storage. |

Campos editáveis: `titulo, tipo, formato, arquivo_nome, arquivo_path, headline,
texto_principal, descricao, campaign, adset_name, ad_name, creative_id, status,
observacoes` (whitelist em `EDITABLE_FIELDS`).

## Copy do anúncio no Windsor (desde 2026-09-03)

Campos validados na Connectors API com dados reais da conta:
`headline`, `body`, `title`, `description`, `image_url`, `thumbnail_url`
(`body` = texto principal, `title` = headline exibida; nível criativo, não
multiplicam linhas). Entraram em `WINDSOR_FIELDS` (`api/_windsor.js`) e como
colunas de `marketing_performance` — o cron diário grava a copy por anúncio e a
aba Anúncios do `/meta-ads` mostra a coluna "Copy".

Após rodar o DDL, backfill do histórico para preencher as colunas:

```bash
node scripts/windsor-sync.mjs --from=2026-06-01 --to=2026-09-03
# (janela máx. 92 dias por chamada — repetir por período)
```

## Carga inicial e novos arquivos em lote

```bash
node scripts/criativos-upload.mjs --dry-run   # mostra o plano (arquivo → anúncio → copy)
node scripts/criativos-upload.mjs             # sobe e registra (idempotente por arquivo_nome)
node scripts/criativos-upload.mjs --dir="C:\caminho\outra-pasta"
```

O script busca a copy **na hora** no Windsor pelo `ad_name` de referência
(mapeamento `MAPPING` no topo do arquivo) — ajustar lá quando houver novos
conjuntos. Arquivos sem mapeamento entram sem copy (preencher via página).

No dia a dia, subir criativos pela própria página (Admin → "Subir criativo")
é o caminho padrão.

## Verificação rápida

```sql
select count(*) from public.criativos;
select titulo, tipo, status, headline from public.criativos order by criado_em desc limit 10;
select id, name, public, file_size_limit from storage.buckets where id = 'criativos';
select ad_name, headline, left(body, 60) as texto from public.v_meta_ads_anuncio order by spend desc limit 10;
```
