# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.15.1] - 2026-09-03
### Alterado
- Botão **"Adicionar mensagem"** do editor de mensagens (`/mensagens/:id`) passou a aparecer em **qualquer mensagem**, não só nas de categoria Orçamentos — toda mensagem pode ter as duas caixas (1ª mensagem/abertura + a principal). Rótulos genéricos fora dos orçamentos: a 2ª caixa mostra "a principal" em vez de "o orçamento"; nos orçamentos as 9 linhas já saem de fábrica com a abertura MEGA OFERTA anexada.

## [1.15.0] - 2026-09-03
### Adicionado
- **Abertura nos orçamentos do `/mensagens`** — o atendimento de orçamento sai em 2 mensagens: primeiro a abertura (a MEGA OFERTA "Abertura do carrinho" — "as condições completas eu já te mando agora 👇"), logo depois o orçamento em si. No editor (`/mensagens/:id`) das mensagens de categoria Orçamentos, botão **"Adicionar mensagem"** abre o campo da abertura **pré-preenchido com a "Abertura do carrinho" da biblioteca** (quando existe), com "Copiar abertura" próprio e botão de remover; o mockup do celular passa a mostrar as **duas bolhas na ordem de envio**, atualizando ao vivo como sempre.
- Modal de preview do `/mensagens` (olho na tabela): mostra as duas bolhas quando há abertura e ganha **"Copiar abertura"** além do "Copiar orçamento" (cada mensagem copiada à parte — no WhatsApp cada uma vai num envio próprio). A tabela marca essas mensagens com o chip **"+ abertura"** (tooltip explica o envio em 2 mensagens) e passa a listar as variáveis das duas mensagens.
- Coluna `abertura` na tabela `mensagens` (texto puro com formatação WhatsApp, `NULL` = envio de 1 mensagem só) — DDL idempotente em `supabase/sql/2026-09-03-mensagens-abertura.sql` (a rodar no SQL Editor). `/api/mensagens` aceita `abertura` no POST/PATCH (vazia/null remove); com a coluna pendente, salvar sem abertura segue normal e salvar com abertura devolve erro claro pedindo o SQL.

## [1.14.0] - 2026-09-03
### Adicionado
- Filtros no `/mensagens`: chips de categoria (com contagem por categoria e "Todas") + busca textual por título/mensagem/categoria, com contador "N de M" quando há filtro ativo e estado vazio próprio ("nenhuma mensagem com esses filtros").
- Colunas **Criado** e **Atualizado** na tabela do `/mensagens` (`dd/mm/aa hh:mm`, tooltip com data completa). "Criado" usa o `created_at` existente; "Atualizado" exige a coluna nova `updated_at` + trigger (DDL idempotente em `supabase/sql/2026-09-03-mensagens-updated-at.sql` — até rodar, a coluna mostra "—" e nada mais muda).

## [1.13.0] - 2026-09-03
### Adicionado
- `/mensagens` em **formato tabela** (mesmo padrão do `/imagens`): título (com aviso das variáveis `{...}`), categoria em chip, prévia da mensagem que expande/recolhe com um clique, ordem, status Ativo/Inativo (inativas esmaecidas) e ações — o botão de olho abre um **modal com o mockup de celular do WhatsApp** daquela mensagem (com alternador "Como ela recebe" ↔ "Como você envia" e "Copiar mensagem"), o lápis vai para o editor. Botão "Nova mensagem" no header.
- **Editor dedicado de mensagem** (`src/MensagensEditar.jsx`, rotas `/mensagens/:id` e `/mensagens/novo`, mesmo padrão do editor do `/imagens`): campos título/categoria (com sugestão das existências)/ordem/ativo, textarea da mensagem com "Copiar mensagem", exclusão com confirmação — e o **mockup do WhatsApp fixo ao lado, atualizando ao vivo enquanto você digita** (negrito/itálico/variáveis renderizados no ato, com o mesmo alternador de perspectiva).
- `/api/mensagens` agora é um **CRUD completo**: `GET` (todas as linhas, inclusive inativas — antes filtrava `ativo`), `POST`, `PATCH ?id=` e `DELETE ?id=`, com validação de `titulo`/`conteudo`; middleware dev no `vite.config.js` trocado pelo wrapper genérico `devApiImagens` chamando o próprio handler.
### Alterado
- Card "Mensagens ativas" do `/dashboard` passou a filtrar `ativo` no client (o `/api/mensagens` agora devolve também as inativas, que a gestão do `/mensagens` precisa exibir).

## [1.12.0] - 2026-09-03
### Adicionado
- Página `/dashboard` (`src/Dashboard.jsx`): visão geral da operação com **índice de todas as páginas** no topo (cards agrupados em Operação & Mídia, Produção, Site & Captura e Administração — cada card abre a página em **nova aba**) e as **principais métricas gerais de tudo** agregadas no navegador a partir dos endpoints públicos já existentes: Leads (total, hoje, 7/30 dias, gráfico dos últimos 14 dias e top 5 categorias, via `/api/leads`), Mídia (investimento, cliques, CPL médio blended e dias com mídia **na janela desde o 1º lead**, via `/api/marketing`; o histórico total aparece no subtítulo) e Conteúdo (mensagens ativas, criativos totais e por status, produtos e fotos de perfil ativos, via `/api/mensagens`, `/api/criativos`, `/api/produtos` e `/api/fotos-perfil`). Cada seção degrada sozinha — endpoint fora do ar mostra "—" com aviso e o resto da página segue de pé; mesmo critério de dia UTC do `/lead`.
- **Favicon do site com a logo da Autoescola**: `public/favicon.ico` (16/32/48/64 px) e `public/apple-touch-icon.png` (180×180, fundo branco) gerados do selo circular de `logo-autoescola-habilitar.webp` com máscara circular (cantos transparentes), declarados no `index.html`.
- **Título da aba por página** via hook `src/lib/usePageTitle.js`: `Dashboard · Autoescola Habilitar`, `Lead · …`, `Imagens · …`, `Meta Ads · …`, `Mensagens · …`, `Criativos · …`, `AE Studio · …` e `Mega Oferta · …` (a landing `/` mantém o título de campanha do `index.html`, restaurado ao sair das demais páginas).

### Alterado
- Rota `/dash` renomeada para **`/lead`** (a dashboard de leads em tempo real); `/dash` agora redireciona para `/lead`, então links e bookmarks antigos continuam funcionando. Comentários/docs que citavam `/dash` agora apontam para `/lead`.

### Removido
- Página `/webinar` (`src/Webinar.jsx`): a Mega Oferta é revelada pela página de obrigado (`/mega-oferta`), então a rota, o componente e o card no índice do `/dashboard` saíram do ar.
- CRM legado (`/crm`, `/crm/:id` e o bookmark `/lead/:id` — `src/Leads.jsx` + `src/LeadDetail.jsx`): painel antigo de leads do Google Sheets, substituído pela dashboard `/lead` (Supabase). Levou junto a página `/login` (`src/Login.jsx`) e o fluxo `ae_habilitar_auth` do localStorage, que só protegiam esse CRM — nenhuma página restante exige login. O grupo "Administração" do índice no `/dashboard` saiu junto.

## [1.11.0] - 2026-09-03
### Adicionado
- Página `/criativos` (`src/Criativos.jsx`): biblioteca de criativos (imagem/vídeo) para o gestor de tráfego em **formato tabela** (mesmo padrão do `/imagens`) — thumbnail da mídia (clique abre **player de vídeo em overlay** com play nativo/streaming direto do Storage, ou lightbox para imagem), coluna de copy expansível (clique alterna prévia `line-clamp-4`/texto cheio — headline em destaque + texto principal + descrição), referência de campanha/conjunto/anúncio, status (novo/aprovado/em_uso/arquivado, troca inline por select) e ações **Copiar copy** (formatada pronta pro Gerenciador de Anúncios, com feedback "Copiado!") e **Editar** (baixar e excluir ficam na página de edição). Filtros por tipo/status e busca textual. Página aberta, **sem token** — decisão do Alex em 2026-09-03, mesmo padrão do `/imagens`.
- **Editor de página dedicada** `/criativos/:id` e `/criativos/novo` (`src/CriativosEditar.jsx`, mesmo padrão do `ImagensEditar`): mídia grande à esquerda — vídeo com player nativo, dá play direto na edição — e campos à direita com a copy completa, botão "Copiar copy", headline, **Tipo e Formato (proporção: 16:9, 9:16, 4:5, 1:1…) em combobox com busca**, status, observações e referências de campanha/conjunto/anúncio/creative. Upload com barra de progresso (signed upload URL direto ao Storage, bypass do limite ~4,5MB da Vercel), "Trocar mídia" substitui o objeto no Storage (o antigo é removido), "Baixar mídia" e Excluir com confirmação no modal. Esc fecha o player/lightbox da tabela e os overlays.
- Tabela `criativos` + **bucket público `criativos`** no Supabase Storage — DDL idempotente em `supabase/sql/2026-09-04-criativos.sql`: campos de copy (`headline`/`texto_principal`/`descricao`), referência ao tráfego pago espelhando `marketing_performance` (`campaign`/`adset_name`/`ad_name`/`creative_id`), `status` (novo/aprovado/em_uso/arquivado), `arquivo_nome` único (dedup), trigger de `atualizado_em`, RLS sem policies.
- Função serverless `/api/criativos` (`api/criativos.js` + núcleo `api/_criativos.js`): `GET` lista, `POST {action:'upload-url'}` gera a signed upload URL, `POST` registra metadados, `PATCH ?id=` e `DELETE ?id=` (remove objeto do Storage + row) — leitura e escrita sem token (padrão `/imagens`; a service_role nunca sai do servidor). Middleware dev no `vite.config.js` via `devApiImagens` com o próprio handler.
- **Copy dos anúncios no Windsor** (validada na Connectors API com dados reais): campos `headline`, `body` (texto principal), `title` (headline exibida), `description`, `image_url`, `thumbnail_url` entram no `WINDSOR_FIELDS` e como colunas novas de `marketing_performance` — o sync diário passa a gravar a copy por anúncio; aba Anúncios do `/meta-ads` ganha coluna "Copy" (título + tooltip com o texto completo). Backfill do período recomendado após rodar o SQL.
- CLI `scripts/criativos-upload.mjs`: carga inicial dos 20 criativos de `Downloads/criativos-ads` (2 vídeos + 18 imagens) — busca a copy na hora no Windsor pelo `ad_name` de referência (vídeos "O Menor Preço" horizontal/vertical, famílias Fachada 1-4, Mulher 1-7 e variações novas 4por5/Magnific com a copy CNH Brasil em vigor), `--dry-run` mostra o plano completo antes de gravar; idempotente por `arquivo_nome`.

## [1.10.0] - 2026-09-03
### Adicionado
- Página `/imagens` (`src/Imagens.jsx`): biblioteca de material de WhatsApp em duas seções. **Produtos & Orçamentos** — cada produto mostra a imagem do orçamento (flyer), chip com o resumo dos valores (ex: "À vista R$ 1.297 ou 10x no cartão"), prévia da copy e botão "Copiar copy" (texto puro com formatação WhatsApp, cola perfeito no app); **Foto perfil WhatsApp** — grid de fotos com preview circular como aparecem no app, copiar link e abrir em tamanho real. CRUD completo nas duas seções (criar/editar/ativar/desativar/excluir com confirmação), upload de imagem comprimida no navegador (canvas → JPEG dataURL, mesmo padrão do Studio), ordenação por `ordem` e inativos esmaecidos. Decisão do Alex: página aberta, sem token.
- Tabelas `produtos` (produto, plano, orcamento, copy, imagem_url/imagem_path, ordem, ativo) e `fotos_perfil` + **bucket público `imagens`** no Supabase Storage (pastas `produtos/` e `perfil/`, 5MB, só JPEG/PNG/WebP) — DDL idempotente em `supabase/sql/2026-09-03-produtos-imagens.sql` (RLS sem policies; índice único parcial em `imagem_path` que torna o seed idempotente). O campo único `nome` foi separado em `produto` + `plano` no mesmo dia (`supabase/sql/2026-09-03-produtos-produto-plano.sql`: backfill dividindo pelo separador " — Plano " e drop da coluna); a tabela `/imagens` ganhou a coluna Plano (chip) e o editor de produto campos separados de Produto e Plano.
- Funções serverless `GET/POST/PATCH/DELETE /api/produtos` e `/api/fotos-perfil`: CRUD compartilhado no factory `api/_imagens.js` — a imagem chega como dataURL base64 comprimido e o servidor grava/apaga o objeto no Storage com a service_role (trocar imagem remove o objeto antigo; excluir a linha remove o objeto). Middlewares `devApiImagens` no `vite.config.js` chamam os próprios handlers com um shim de req/res no `npm run dev`.
- CLI `scripts/seed-imagens.mjs`: sobe as 9 imagens de orçamento de `Downloads/produtos-orcamentos` e as 5 fotos de perfil de `Downloads/foto perfil` para o bucket e cria as linhas — mapeamento arquivo↔plano verificado olhando cada flyer (Básico/Ouro/Diamante 1ª habilitação carro+moto, Bronze/Prata/Ouro somente uma categoria, Bronze/Prata/Ouro adição), com copy verbatim dos scripts de orçamento já versionados no seed de `mensagens.sql` (dois erros de digitação do original corrigidos: "1.2970,00" → "1.297,00"). Idempotente por `imagem_path`; edições pela página nunca são sobrescritas.

## [1.9.0] - 2026-09-03
### Adicionado
- Biblioteca de scripts de WhatsApp em `/mensagens` (`src/Mensagens.jsx`): cada mensagem da tabela `mensagens` aparece num mockup de celular que replica a conversa do WhatsApp (header verde com a logo, papel de parede bege com doodles, pílula "Hoje", bolha com rabinho, hora e tiques azuis) — renderizando a formatação nativa (`*negrito*`, `_itálico_`, `~riscado~`, ```` ```mono``` ````) com as regras do app (marcador sem par vira literal). Alternador "Como ela recebe" (bolha branca, esquerda) ↔ "Como você envia" (bolha verde, direita, tiques) e botão "Copiar" que devolve o texto puro, pronto para colar no WhatsApp. Variáveis `{primeiro-nome}`/`{produto}` aparecem preenchidas com exemplo no preview, mas o "Copiar" mantém os placeholders.
- Tabela `mensagens` no Supabase (DDL idempotente + seed das 11 mensagens — 2 de Comunicação e 9 de Orçamentos — em `supabase/sql/2026-09-03-mensagens.sql`, com `ON CONFLICT DO NOTHING` para nunca sobrescrever edições; RLS sem policies, leitura só via service_role).
- Função serverless `GET /api/mensagens` (`api/mensagens.js`): linhas ativas ordenadas por `ordem` via `service_role`, mesmo padrão do `/api/marketing`; middleware `devApiMensagens` no `vite.config.js` replica o endpoint no `npm run dev`.

## [1.8.0] - 2026-09-02
### Adicionado
- 7 colunas do funil WhatsApp/engajamento no sync do Windsor (validadas na Connectors API com dados reais da conta): `actions_onsite_conversion_messaging_first_reply` (respostas no WhatsApp), `cost_per_action_type_onsite_conversion_total_messaging_connection` (custo por conversa), `cost_per_action_type_onsite_conversion_messaging_first_reply`, `cost_per_action_type_onsite_conversion_messaging_conversation_started_7d`, `actions_post_engagement`, `inline_link_clicks` (cliques em link — o `clicks` do Meta inclui cliques gerais) e `cost_per_inline_link_click`. DDL idempotente em `supabase/sql/2026-09-02-windsor-campos-funil.sql` (a rodar no SQL Editor), com views `v_meta_ads_diario`/`v_meta_ads_campanha` recriadas incluindo o funil.
- Insert do sync tolerante a schema pendente: introspecta as colunas da tabela via OpenAPI do PostgREST e filtra as que ainda não existem (em vez de falhar o INSERT com PGRST204); colunas pendentes voltam em `written.skippedColumns`.
- `/api/windsor-sync` aceita `?from=YYYY-MM-DD&to=YYYY-MM-DD` (máx. 92 dias por chamada) — backfill de períodos arbitrários direto pela produção, sem precisar do service_role local.
- Dia corrente no dashboard: a janela de sync passou a incluir hoje (parcial — a Meta revisa; replace idempotente converge) e o botão de refresh do `/meta-ads` repuxa o Windsor via `?sync=1` no `/api/marketing`, com throttle de 10 min por instância (paridade no dev server do Vite).
- `/meta-ads`: painel "Funil do período" (Impressões → Alcance → Cliques → Cliques em link → Views da página → Conversas WhatsApp → Respostas no WhatsApp → Leads formulário, com conversão por etapa), chips novos (cliques em link, engajamento, custo/conversa, custo/resposta) e colunas Conversas + Custo/conversa nas tabelas por nível.
- Casamento campanha ↔ leads agora também por `campaign_id`: os anúncios usam o ID da campanha como `utm_campaign` (ex.: `120248846128830407`), que o casamento só-por-nome nunca encontraria; a view `v_cpl_campanha` ganhou o mesmo join alternativo.

### Corrigido
- `WINDSOR_API_KEY` estava truncada no `.env` (3 caracteres a menos) e NÃO existia na Vercel — o cron falhava com 500. Chave completa validada e criada em production; `CRON_SECRET` rotacionado (novo valor registrado no `.env` local como `WINDSOR_SYNC_SECRET`). Primeiro sync real executado (14 linhas) + backfill do histórico completo desde fev/2024.
- Campos do Windsor com mais de 63 caracteres quebravam o INSERT: o Postgres trunca identificadores silenciosamente, o ALTER TABLE criava colunas com nome cortado e o sync (que envia o nome cheio) falhava com PGRST204 — e pior, o DELETE do replace já tinha rodado, deixando a janela vazia. Os dois campos longos de custo por conversa agora gravam em colunas encurtadas (`cost_per_messaging_connection` e `cost_per_messaging_started_7d`, via `COLUMN_ALIASES`), o SQL derruba as colunas truncadas e o replace passou a validar o INSERT com uma linha-canário ANTES do DELETE.
- `/api/marketing` retornava no máx. 1000 linhas (limite `db-max-rows` do PostgREST ignora o `limit(5000)` do supabase-js): agora pagina por 1000 até esgotar a tabela.

## [1.7.0] - 2026-09-01
### Adicionado
- Sincronização própria Windsor.ai → Supabase via Connectors API (`api/_windsor.js`): busca as 33 colunas em `connectors.windsor.ai/facebook` e grava na `marketing_performance` com replace por período (DELETE do intervalo + INSERT, dedup por grain anúncio × dia) — idempotente, sem duplicar. A destination task "Supabase" do painel do Windsor reportava sucesso mas nunca gravou linhas (0 rows em todos os schemas); o sync via API passa a ser o escritor oficial.
- CLI `scripts/windsor-sync.mjs`: `--selftest` (valida o caminho de gravação no Supabase sem tocar no Windsor — já verificado OK), `--days=N`, `--from/--to` (backfill de períodos arbitrários) e `--dry-run`; carrega o `.env` sozinho.
- Função serverless `GET/POST /api/windsor-sync` (`api/windsor-sync.js`) + cron `10 7 * * *` no `vercel.json`: refresca a janela de 3 dias diariamente na produção; protegida por `CRON_SECRET`/`WINDSOR_SYNC_SECRET` (401 sem segredo, 500 se não configurada).
- Middleware `devApiWindsorSync` no `vite.config.js` replica o sync no `npm run dev` (localhost, sem segredo).
- Variável de ambiente nova `WINDSOR_API_KEY` (Vercel + `.env` local). ⚠️ Pendente: a chave copiada até agora é rejeitada pela API (`Please check the API key used`) — ver Problemas conhecidos do runbook.

## [1.6.0] - 2026-09-01
### Adicionado
- Dashboard completa de mídia em `/meta-ads` (`src/MetaAds.jsx`): 8 KPIs (Investimento, Leads CRM, CPL médio, Cliques, CTR, CPC, CPM, Impressões), chips complementares (alcance, frequência, views de página, leads Meta, cadastros no pixel, conversas WhatsApp), gráficos de investimento e leads por dia e tabelas por Campanha/Conjunto/Anúncio com CTR/CPC/CPM/CPL. Presets de período (Tudo/Hoje/7/14/30 dias) + intervalo custom. Reusa `/api/marketing` e `/api/leads`.
- Tabela `marketing_performance` expandida para o schema completo de 33 colunas (fato anúncio × dia: dimensões de conta/campanha/conjunto/anúncio + métricas impressions/reach/clicks/CTR-base/spend/cpc/cpm/actions_*/cost_per_*) — DDL executado no SQL Editor do Supabase e versionado em `supabase/sql/2026-09-01-windsor-marketing-performance.sql` (idempotente, com RLS sem policies, índices em date/campaign_id e views `v_meta_ads_diario`, `v_meta_ads_campanha`, `v_meta_ads_conjunto`, `v_meta_ads_anuncio`, `v_cpl_campanha`).
- Runbook do Windsor atualizado com a lista das 33 colunas a selecionar na destination task e a nova chave de upsert `date,datasource,account_id,ad_id` (granularidade anúncio × dia).

## [1.5.0] - 2026-09-01
### Adicionado
- Integração Windsor.ai → Supabase: o Windsor passa a gravar a performance diária de mídia (date, datasource, account_name, source, campaign, clicks, spend) na tabela `marketing_performance` do projeto `site-alex-donega` (mesmo do app), como destination task `marketing-performance-diario` (sync diário 07:00 UTC, upsert pela chave composta dia+fonte+conta+campanha). A tabela é criada pelo próprio Windsor no primeiro sync. Runbook em `Docs/Tecnico/integracao_windsor.md`.
- Função serverless `GET /api/marketing` (`api/marketing.js`): linhas de `marketing_performance` via `service_role`, mesmo padrão do `/api/leads`; middleware `devApiMarketing` no `vite.config.js` replica o endpoint no `npm run dev`.
- Painel de mídia no `/dash` (`src/Dash.jsx`): cards Investimento / Cliques / Leads / CPL médio (investimento ÷ leads do período) e tabela por campanha com CPL via casamento `campaign` ↔ `utm_campaign`; respeita o filtro de período, carrega no mount/refresh (fora do polling de 10s) e degrada com aviso enquanto a tabela não existe.
- `supabase/sql/2026-09-01-windsor-marketing-performance.sql` (primeiro SQL versionado do repo): RLS sem policies na tabela (anon key não lê investimento), índice em `date` e view `v_cpl_campanha` com CPL por dia/campanha (`security_invoker`) — rodar no SQL Editor após o primeiro sync.

## [1.3.0] - 2026-09-01
### Adicionado
- Dashboard pública de leads em tempo real em `/dash` (`src/Dash.jsx`), lendo a tabela `leads` do Supabase: KPIs (total, hoje, últimos 7 e 30 dias), gráfico de leads/dia (14 dias), ranking por categoria e tabela completa (ID, nome, WhatsApp com link `wa.me`, produto — exibindo apenas o trecho entre parênteses, ex. `Moto [A]` —, referrer, IG, UTM medium, criado em).
- Função serverless `GET /api/leads` (`api/leads.js`): retorna todos os leads via `service_role` (o RLS bloqueia a leitura com a anon key). A página faz polling a cada 10s e ao voltar para a aba, com aviso flutuante quando chega lead novo.
- Filtros de tabela com combobox pesquisável (Produto, Referrer, IG, UTM Medium) + busca global por nome/WhatsApp/ID.
- Coluna "IG" mostra `ig` quando a coluna existir; hoje exibe o `utm_source` (valor `ig`).
- Variável `SUPABASE_SERVICE_ROLE_KEY` (Secret) configurada na Vercel para o ambiente de Production.
- `vite.config.js`: middleware de desenvolvimento que replica o `GET /api/leads` no `npm run dev` (consulta o Supabase com a service_role do `.env`, apenas no processo do dev server) — o `/dash` no localhost agora carrega dados reais e em tempo real, sem precisar do `vercel dev`.

## [1.4.0] - 2026-09-01
### Adicionado
- Atalhos "Meta Ads" na barra de filtros do `/dash`: botões Campanha, Conjunto e Anúncio que abrem o Gerenciador de Anúncios da Meta em nova aba, já filtrados pela campanha ativa.
- Filtro por período (data de início e fim) na tabela de leads do `/dash`.
- Coluna "Contato" com checkbox na tabela: marca se o contato foi feito e persiste na coluna `contato_realizado` do Supabase via `PATCH /api/leads` (atualização otimista na interface; reverte e exibe aviso se o save falhar, ex.: coluna ainda inexistente).
- Filtro "Contato" com checkboxes (Sim/Não) na barra de filtros da tabela — um marcado filtra, os dois equivalem a todos.
- Middleware de dev (`vite.config.js`) também responde ao `PATCH /api/leads`, mantendo o localhost idêntico à produção.

### Alterado
- Layout do `/dash`: filtro de período e atalhos Meta Ads passaram a ficar em uma barra acima dos cartões de métricas (com botão "Limpar período"); coluna "Contato" movida para depois de "Produto".
- Clicar em qualquer ponto do campo de data (início ou fim) agora abre o calendário (`showPicker()`).
- O filtro de período passou a refletir em TODA a dashboard: KPIs, gráfico por dia, ranking por categoria e tabela.
- Gráfico "Leads por dia" passa a começar na data do primeiro lead (ex.: 01/09), respeitando o período filtrado (máx. 31 barras); o título mostra o intervalo exibido.
- Gráfico "Leads por dia" com janela fixa de 7 dias a partir do início do período (ex.: 01/09–07/09), exibindo dias futuros vazios.
- Tabela com scroll infinito: renderiza 20 linhas por vez e carrega mais conforme o scroll (IntersectionObserver), com botão "Mostrar mais" e contador como fallback — preparada para centenas de leads.

## [1.2.0] - 2026-08-31
### Adicionado
- Página de webinar em `/webinar`: landing com selo "Mega Oferta ao Vivo — dias 04 e 05 de setembro", countdown real até a virada do dia 04/09/2026 (evento o dia todo, sem horário fixo) e CTA de WhatsApp com mensagem pré-preenchida.
- Selo amarelo pulsante no hero da home com a data do evento ("🔴 Mega Oferta Ao Vivo — Dias 04 e 05 de Setembro"), primeiro elemento da primeira seção.
- AE Studio em `/studio`: geração de imagens (GLM-Image) e vídeos (CogVideoX-3) via API da Z.ai, através de funções serverless em `api/` (`create-image`, `create-video`, `task-status`). Protegido por senha compartilhada (`ZAI_STUDIO_TOKEN`, header `x-studio-token`); a chave `ZAI_API_KEY` vive apenas no servidor. Requer configurar as duas variáveis na Vercel. Documentação em `Docs/Tecnico/integracao_zai.md`.
- `vercel.json`: configuração de `functions` para `api/*.js` (maxDuration 30s).

### Alterado
- Formulário de pré-matrícula: removidas as opções de mudança de categoria (C-Caminhão, D-Ônibus, E-Carreta).
- Título do hero sempre renderiza em exatamente 3 linhas (`whitespace-nowrap` + font-size fluido com `clamp`).
- Botão flutuante de WhatsApp: mensagem pré-preenchida alterada para "Quero tirar dúvidas sobre a CNH do Brasil".
- (1.1.x sequência) Rota `/grupo-vip` renomeada para `/mega-oferta` com redirect da antiga; Google Tag Manager `GTM-TB3VSC3M` no `index.html`.

## [1.1.1] - 2026-08-31
### Adicionado
- Google Tag Manager (container `GTM-TB3VSC3M`) injetado no `index.html`: script no `<head>` e iframe `<noscript>` no `<body>`, cobrindo todas as rotas da SPA. Pixel do Facebook permanece inalterado.

## [1.1.0] - 2026-08-31
### Adicionado
- Integração com Supabase (projeto `dtugwspbkkqxkeoajunf`, compartilhado com o site alexdonega-website): o formulário de pré-matrícula agora insere leads na tabela `leads` com metadados completos — `page_url`, `page_path`, `page_title`, `referrer`, `utm_source/medium/campaign/term/content`, `user_agent`, `language`, `screen_*` e `viewport_*` (mesmo padrão de captura do alexdonega-website).
- Novo cliente Supabase central (`src/lib/supabase.js`) e helper de captura (`src/lib/leadCapture.js`).
- `vite.config.js` configurado com `envPrefix: ['VITE_', 'PUBLIC_']` para consumir as variáveis `PUBLIC_SUPABASE_URL` e `PUBLIC_SUPABASE_ANON_KEY` do `.env`.
- `.env.example` atualizado (prefixos e finalidade do Supabase).
- Dependência `@supabase/supabase-js` adicionada.

### Alterado
- `src/App.jsx`: a captura do Supabase é disparada antes do `navigate('/grupo-vip')` (os metadados da página com UTMs são lidos no momento da chamada); Google Sheets, webhook Novo Envio e Pixel do Facebook permanecem inalterados.

## [1.0.1] - 2025-11-30
### Adicionado
- Implementado o Pixel do Facebook (ID `1154742620035043`) para rastreamento de `PageView` e `CompleteRegistration`.
- Atualizado comportamento do formulário para redirecionamento imediato após sucesso.
- Atualizada página `grupo-vip.html`:
    - Adicionado Pixel do Facebook com evento `CompleteRegistration`.
    - Implementado redirecionamento automático para o WhatsApp após 7 segundos.
- Criado documento de especificação do formulário (`Docs/especificacao_formulario.md`).
- Criado documento de integrações (`Docs/integracoes.md`).

## [1.0.0] - 2025-11-30
### Adicionado
- Estrutura inicial do projeto.
- Integração com Google Sheets e Novo Envio.
- Página de aterrissagem (`index.html`) com formulário de captura.
- Página de agradecimento (`grupo-vip.html`).
- Arquivo `README.md`.
