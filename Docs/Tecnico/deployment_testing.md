# Guia de Deployment e Testes

## Processo de Deployment

### 1. Preparação
- Verifique se todos os arquivos estão salvos e sem erros de sintaxe.
- Confirme se as credenciais do Facebook Pixel e Google Sheets estão corretas em `index.html` e `grupo-vip.html`.

### 2. Deploy Manual (Netlify/Vercel/FTP)
- **Netlify/Vercel**: Arraste a pasta do projeto para o dashboard ou conecte ao repositório Git.
- **FTP**: Faça upload de todos os arquivos da raiz (`index.html`, `grupo-vip.html`, `assets/`, etc.) para a pasta `public_html` do servidor.

### 3. Pós-Deploy
- Limpe o cache do navegador ou teste em aba anônima.
- Verifique se o Pixel Helper detecta os eventos corretamente.

---

## Plano de Testes

### 1. Teste de Renderização (White Screen)
- **Ação**: Carregar `index.html`.
- **Esperado**: Página carrega completamente, sem tela branca. Console do navegador sem erros vermelhos.

### 2. Teste de Formulário
- **Ação**: Preencher Nome, WhatsApp, Email e Categoria. Clicar em "QUERO MINHA VAGA".
- **Esperado**:
    - Botão mostra estado de "Enviando...".
    - Dados são enviados para Google Sheets e Webhook (verificar logs/planilha).
    - Redirecionamento automático para `grupo-vip.html`.
    - Evento `CompleteRegistration` dispara no Pixel.

### 3. Teste de Redirecionamento VIP
- **Ação**: Estar na página `grupo-vip.html`.
- **Esperado**:
    - Após 7 segundos, redireciona para o link do WhatsApp.
    - Botão "ENTRAR NO GRUPO VIP" funciona manualmente.
    - Evento `Lead` dispara ao clicar no botão.

### 4. Teste de Responsividade
- **Ação**: Abrir em Mobile (iPhone/Android) e Desktop.
- **Esperado**: Layout se adapta, sem quebras horizontais ou textos sobrepostos.
