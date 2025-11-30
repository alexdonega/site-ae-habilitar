# Integração com Google Sheets

Para enviar os dados do formulário diretamente para a sua planilha, precisamos criar um pequeno script dentro do Google Sheets. Isso é necessário porque o site roda no navegador do cliente e precisa de uma "ponte" segura para escrever na planilha.

## Passo 1: Abrir o Editor de Script

1. Abra a sua planilha: [Link da Planilha](https://docs.google.com/spreadsheets/d/1T3WzQzcZMrpJQEMErJLTFcSbbU5s7hsYq08iuNOEJhE/edit?gid=0#gid=0)
2. No menu superior, clique em **Extensões** > **Apps Script**.

## Passo 2: Colar o Código

Apague qualquer código que estiver no arquivo `Código.gs` (ou `Code.gs`) e cole o seguinte:

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  
  // Adiciona a linha com os dados recebidos
  // Ordem: nome_completo, whatsapp, email, categoria_desejada, data_hora
  sheet.appendRow([
    data.nome_completo,
    data.whatsapp,
    data.email,
    data.categoria_desejada,
    new Date() // Carimbo de data/hora automático
  ]);
  
  return ContentService.createTextOutput(JSON.stringify({ 'result': 'success' }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## Passo 3: Implantar como Aplicativo Web

1. No canto superior direito, clique no botão azul **Implantar** (Deploy) > **Nova implantação** (New deployment).
2. Na janela que abrir, clique na engrenagem (ao lado de "Selecionar tipo") e escolha **App da Web** (Web app).
3. Preencha as configurações:
    *   **Descrição**: Integração Site
    *   **Executar como**: *Eu* (seu email)
    *   **Quem pode acessar**: **Qualquer pessoa** (Anyone) -> **IMPORTANTE: Isso é essencial para o site funcionar.**
4. Clique em **Implantar** (Deploy).
5. O Google pode pedir permissão para acessar sua planilha. Clique em **Autorizar acesso**, escolha sua conta, clique em **Avançado** e depois em **Acessar (nome do projeto) (não seguro)** (é seguro, é o seu próprio código).

## Passo 4: Copiar a URL

1. Após a implantação, você receberá uma **URL do App da Web** (Web App URL).
2. Copie essa URL (ela começa com `https://script.google.com/macros/s/...`).
3. **Me envie essa URL aqui no chat.**

Assim que você me enviar a URL, eu conecto o formulário do site para enviar os dados para lá! 🚀
