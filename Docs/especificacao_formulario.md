# Especificação do Formulário de Captura

Este documento descreve as características técnicas, visuais e de conteúdo do formulário de captura de leads da Landing Page.

## 1. Características Gerais

*   **Tipo de Exibição:** Embedado (Fixo na página).
*   **Localização:** Hero Section (Primeira dobra), lado direito (desktop) ou abaixo da chamada principal (mobile).
*   **Tecnologia:** React (Componente `AutoescolaJottaLanding`).
*   **Estilo:** Card branco com sombra, borda superior vermelha (`border-t-4 border-red-600`).

## 2. Copy (Texto)

*   **Título:** "Grupo VIP de Ofertas"
*   **Subtítulo:** "Preencha para garantir seu desconto exclusivo"
*   **Botão (Estado Normal):** "🔥 QUERO MINHA VAGA"
*   **Botão (Carregando):** "Enviando..." (com ícone de spinner)
*   **Mensagem de Sucesso:**
    *   **Título:** "Cadastro realizado!"
    *   **Texto:** "Você entrou no Grupo VIP. Aguarde nosso contato!"

## 3. Campos e Formatos

O formulário possui 4 campos obrigatórios.

### 3.1. Nome Completo
*   **Label:** `Nome Completo`
*   **Placeholder:** `Qual o seu nome?`
*   **Tipo:** `text`
*   **Validação:** Obrigatório. Deve conter texto.

### 3.2. WhatsApp
*   **Label:** `WhatsApp`
*   **Placeholder:** `(67) 99999-9999`
*   **Tipo:** `tel`
*   **Máscara:** `(XX) XXXXX-XXXX` ou `(XX) XXXX-XXXX` (aplica formatação automática enquanto digita).
*   **Validação:** Obrigatório. Deve conter entre 10 e 11 dígitos numéricos.

### 3.3. E-mail
*   **Label:** `E-mail`
*   **Placeholder:** `seu@email.com`
*   **Tipo:** `email`
*   **Validação:** Obrigatório. Formato de e-mail válido (regex).

### 3.4. Categoria Desejada
*   **Label:** `Categoria Desejada`
*   **Tipo:** `select` (Dropdown)
*   **Validação:** Obrigatório.
*   **Opções (Valores exatos):**
    1.  `Moto [A]` (Visual: Categoria A (Moto))
    2.  `Carro [B]` (Visual: Categoria B (Carro))
    3.  `Carro e Moto [AB]` (Visual: Categoria AB (Carro e Moto))
    4.  `Adição Moto [A]` (Visual: Adição A (Moto))
    5.  `Adição Carro [B]` (Visual: Adição B (Carro))
    6.  `Ônibus [D]` (Visual: Mudança de Categoria D (Ônibus))
    7.  `Carreta [E]` (Visual: Mudança de Categoria E (Carreta))

## 4. Comportamento e Integrações

*   **Ao Submeter:**
    1.  Valida todos os campos.
    2.  Envia dados para **Google Sheets** (via Webhook).
    3.  Envia dados para **Novo Envio** (via Webhook).
    4.  Exibe mensagem de sucesso.
    5.  Redireciona para `grupo-vip.html` após 1.5 segundos.

*   **Payload (Dados enviados):**
    ```json
    {
      "nome_completo": "Valor do input",
      "whatsapp": "Valor formatado",
      "email": "Valor do input",
      "categoria_desejada": "Valor selecionado"
    }
    ```
