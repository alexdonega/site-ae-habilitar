# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
