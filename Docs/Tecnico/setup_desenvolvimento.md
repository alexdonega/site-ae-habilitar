# Configuração do Ambiente de Desenvolvimento

## Pré-requisitos
- Editor de Código (VS Code recomendado).
- Navegador Moderno (Chrome/Edge/Firefox).
- Extensão "Live Server" (opcional, mas recomendada para VS Code).

## Estrutura do Projeto
```
/
├── assets/                 # Imagens e recursos estáticos
├── Docs/                   # Documentação do projeto
├── index.html              # Landing Page Principal
├── grupo-vip.html          # Página de Obrigado/VIP
├── politica_privacidade.html
└── termos_uso.html
```

## Como Rodar Localmente
1. Clone o repositório ou baixe os arquivos.
2. Abra a pasta do projeto no VS Code.
3. Clique com botão direito em `index.html` e selecione "Open with Live Server".
4. O site abrirá em `http://127.0.0.1:5500/index.html`.

## Tecnologias Usadas
- **HTML5/CSS3**: Estrutura e estilo base.
- **Tailwind CSS (CDN)**: Estilização utilitária.
- **React & ReactDOM (CDN)**: Lógica de componentes e estado.
- **Babel (CDN)**: Transpilação de JSX no navegador.

> **Nota**: Este projeto usa React via CDN para simplicidade e facilidade de edição sem build steps complexos (Node.js/Webpack não são estritamente necessários para rodar, apenas um servidor estático).
