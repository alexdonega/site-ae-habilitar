# Autoescola Jotta - Landing Page

Este repositório contém o código-fonte da Landing Page da **Autoescola Jotta**, desenvolvida para a campanha de captação de leads "A CNH Mais Barata da História de Campo Grande".

## 🚀 Sobre o Projeto

O projeto é uma Landing Page de alta conversão, focada em capturar leads interessados em obter a primeira habilitação ou mudança de categoria com condições promocionais.

### Tecnologias Utilizadas

*   **HTML5 & CSS3**
*   **React.js** (via CDN, sem build step complexo)
*   **Tailwind CSS** (via CDN para estilização rápida)
*   **Babel Standalone** (para compilação JSX no navegador)

## 📂 Estrutura de Arquivos

*   `index.html`: Arquivo principal contendo toda a estrutura, lógica React e estilos.
*   `Docs/`: Documentação do projeto.
    *   `especificacao_formulario.md`: Detalhes técnicos do formulário de captura.
    *   `integracoes.md`: Informações sobre Webhooks, Pixel do Facebook e outras integrações.
*   `assets/`: Imagens e recursos estáticos.

## 🔗 Integrações

O formulário da página está integrado com:
1.  **Google Sheets**: Para armazenamento dos leads em planilha.
2.  **Novo Envio**: Webhook para automação de marketing.
3.  **Facebook Pixel**: Rastreamento de `PageView` e `CompleteRegistration`.

## 🛠️ Como Executar Localmente

Como o projeto utiliza bibliotecas via CDN, não é necessário instalar dependências via `npm` ou `yarn`.

1.  Clone o repositório.
2.  Abra o arquivo `index.html` diretamente em seu navegador ou use uma extensão como "Live Server" no VS Code.

## 📦 Deploy

O projeto está configurado para deploy automático na **Vercel** a cada push na branch `master`.

---
© 2025 Autoescola Jotta. Todos os direitos reservados.
