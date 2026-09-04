// =============================================================================
//  /api/produtos — CRUD dos produtos/orçamentos da página /imagens
// =============================================================================
//  Tabela "produtos" (criada em supabase/sql/2026-09-03-produtos-imagens.sql;
//  "nome" separado em produto + plano em 2026-09-03-produtos-produto-plano.sql):
//  produto, plano, orcamento (resumo dos valores), copy (mensagem WhatsApp com
//  formatação nativa), imagem_url/imagem_path (bucket "imagens", pasta
//  produtos/), ordem, ativo.
//
//    GET    → todas as linhas ordenadas por ordem, id (inclusive inativas)
//    POST   {produto, plano?, orcamento?, copy?, ordem?, ativo?, imagem_data_url}
//           → sobe a imagem para o Storage e cria a linha (201)
//    PATCH  ?id= {...campos, imagem_data_url?} → atualiza (troca a imagem
//           se vier imagem_data_url, apagando o objeto antigo)
//    DELETE ?id= → apaga a linha + o objeto do Storage
//
//  A imagem chega como dataURL base64 comprimido no navegador (canvas →
//  JPEG) — o upload no Storage usa a service_role, que nunca vai ao client.
//  Escritas abertas (decisão do Alex em 2026-09-03). Implementação
//  compartilhada no factory api/_imagens.js.
// =============================================================================

import { createImagensHandler } from './_imagens.js';

export default createImagensHandler({
    tabela: 'produtos',
    pasta: 'produtos',
    nomeObrigatorio: true,
    campoTitulo: 'produto',
    sanitize(body) {
        const row = {};
        if (body.produto !== undefined) row.produto = String(body.produto).trim();
        if (body.plano !== undefined) row.plano = String(body.plano).trim();
        if (body.orcamento !== undefined) row.orcamento = String(body.orcamento ?? '');
        if (body.copy !== undefined) row.copy = String(body.copy ?? '');
        if (body.ordem !== undefined) row.ordem = Math.trunc(Number(body.ordem)) || 0;
        if (body.ativo !== undefined) row.ativo = Boolean(body.ativo);
        return row;
    },
});
