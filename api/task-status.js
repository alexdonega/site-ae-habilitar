// =============================================================================
//  GET /api/task-status?id=<task-id> — Consulta de tarefa assíncrona (Z.ai)
// =============================================================================
//  Espelha GET /paas/v4/async-result/{id}, que serve tanto para imagens
//  (async) quanto para vídeos. Resposta normalizada:
//    { id, model, status: "PROCESSING" | "SUCCESS" | "FAIL",
//      urls: string[], coverUrl?: string }
//
//  Chamada sem id (ou com id malformado) devolve 400 — o Studio usa esse
//  comportamento para validar o token sem consumir nada na Z.ai.
//
//  Proteção: requer header x-studio-token === env ZAI_STUDIO_TOKEN.
// =============================================================================

import { isAuthorized, sendError, zaiRequest } from './_zai.js';

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'GET') return sendError(res, 405, 'Método não permitido');
    if (!isAuthorized(req)) return sendError(res, 401, 'Token de acesso inválido');

    // Ids de tarefa da Z.ai são numéricos; o gateway deles devolve um 405 HTML
    // confuso para path segments não-numéricos, por isso a restrição.
    const id = req.query?.id;
    if (!id || typeof id !== 'string' || !/^[0-9]+$/.test(id)) {
        return sendError(res, 400, 'Parâmetro "id" ausente ou inválido');
    }

    try {
        const result = await zaiRequest(`/paas/v4/async-result/${id}`);
        const results = Array.isArray(result.video_result) ? result.video_result : result.image_result;
        const urls = (results || []).map((item) => item?.url).filter(Boolean);

        return res.status(200).json({
            id,
            model: result.model,
            status: result.task_status,
            urls,
            coverUrl: Array.isArray(result.video_result) ? result.video_result?.[0]?.cover_image_url : undefined,
        });
    } catch (err) {
        return sendError(res, err.statusCode || 500, err.message, err.zaiCode !== undefined ? { zaiCode: err.zaiCode } : {});
    }
}
