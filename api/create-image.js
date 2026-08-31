// =============================================================================
//  POST /api/create-image — Geração de imagem (GLM-Image) via Z.ai
// =============================================================================
//  Body: { prompt: string, size?: string, quality?: "standard" | "hd" }
//
//  Estratégia de endpoints (docs.z.ai):
//    • quality "hd"     → POST /paas/v4/async/images/generations (async; o
//      endpoint assíncrono só aceita "hd"). Devolve { id } para polling.
//    • quality "standard" → POST /paas/v4/images/generations (síncrono,
//      ~5-10s; devolve a URL direto, sem polling).
//  O cliente normaliza os dois formatos (mode: "async" | "sync").
//
//  Proteção: requer header x-studio-token === env ZAI_STUDIO_TOKEN.
// =============================================================================

import { isAuthorized, parseBody, sendError, zaiRequest } from './_zai.js';

const IMAGE_SIZES = new Set([
    '1280x1280', // quadrado
    '1568x1056', // paisagem 3:2
    '1056x1568', // retrato 2:3
    '1472x1088', // paisagem 4:3
    '1088x1472', // retrato 3:4
    '1728x960',  // paisagem 16:9
    '960x1728',  // retrato 9:16
]);

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') return sendError(res, 405, 'Método não permitido');
    if (!isAuthorized(req)) return sendError(res, 401, 'Token de acesso inválido');

    try {
        const { prompt, size = '1280x1280', quality = 'hd' } = parseBody(req);

        if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
            return sendError(res, 400, 'Prompt é obrigatório');
        }
        if (!IMAGE_SIZES.has(size)) {
            return sendError(res, 400, 'Tamanho inválido — use um dos presets aceitos pela API');
        }
        if (!['standard', 'hd'].includes(quality)) {
            return sendError(res, 400, 'Qualidade inválida (use "standard" ou "hd")');
        }

        if (quality === 'standard') {
            const result = await zaiRequest('/paas/v4/images/generations', {
                method: 'POST',
                body: { model: 'glm-image', prompt: prompt.trim(), size, quality },
            });
            const url = result?.data?.[0]?.url;
            if (!url) return sendError(res, 502, 'Z.ai não retornou a URL da imagem');
            return res.status(200).json({ mode: 'sync', status: 'SUCCESS', url });
        }

        const result = await zaiRequest('/paas/v4/async/images/generations', {
            method: 'POST',
            body: { model: 'glm-image', prompt: prompt.trim(), size, quality },
        });
        if (!result?.id) return sendError(res, 502, 'Z.ai não retornou o id da tarefa');
        return res.status(200).json({ mode: 'async', id: result.id, status: result.task_status, model: result.model });
    } catch (err) {
        return sendError(res, err.statusCode || 500, err.message, err.zaiCode !== undefined ? { zaiCode: err.zaiCode } : {});
    }
}
