# Changelog

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
