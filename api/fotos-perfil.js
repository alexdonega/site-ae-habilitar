// =============================================================================
//  /api/fotos-perfil — CRUD das fotos de perfil WhatsApp da página /imagens
// =============================================================================
//  Tabela "fotos_perfil" (criada em supabase/sql/2026-09-03-produtos-imagens.sql):
//  nome (rótulo opcional), imagem_url/imagem_path (bucket "imagens", pasta
//  perfil/), ordem, ativo.
//
//    GET    → todas as linhas ordenadas por ordem, id (inclusive inativas)
//    POST   {nome?, ordem?, ativo?, imagem_data_url} → sobe e cria (201)
//    PATCH  ?id= {...campos, imagem_data_url?} → atualiza (troca a imagem)
//    DELETE ?id= → apaga a linha + o objeto do Storage
//
//  Mesmos padrões do /api/produtos: dataURL base64 comprimido no navegador,
//  upload via service_role, escritas abertas (decisão 2026-09-03).
//  Implementação compartilhada no factory api/_imagens.js.
// =============================================================================

import { createImagensHandler } from './_imagens.js';

export default createImagensHandler({
    tabela: 'fotos_perfil',
    pasta: 'perfil',
    nomeObrigatorio: false,
    sanitize(body) {
        const row = {};
        if (body.nome !== undefined) row.nome = String(body.nome ?? '').trim();
        if (body.ordem !== undefined) row.ordem = Math.trunc(Number(body.ordem)) || 0;
        if (body.ativo !== undefined) row.ativo = Boolean(body.ativo);
        return row;
    },
});
