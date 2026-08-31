// =============================================================================
//  POST /api/create-video — Geração de vídeo (CogVideoX-3) via Z.ai
// =============================================================================
//  Body: {
//    prompt?: string (≤512 chars, obrigatório se não houver imagens),
//    images?: string[] (0-2 data-URLs base64 JPEG; 1 = primeiro quadro,
//             2 = primeiro/último quadro),
//    quality?: "speed" | "quality"  (2 imagens força "speed" — regra da API),
//    size?: string, fps?: 30 | 60, duration?: 5 | 10, with_audio?: boolean
//  }
//
//  Sempre assíncrono: devolve { id } para polling em /api/task-status.
//  O limite de body da Vercel é 4.5MB; por isso o total de base64 é limitado
//  a ~3.5MB aqui e o Studio comprime as imagens no navegador antes de enviar.
//
//  Proteção: requer header x-studio-token === env ZAI_STUDIO_TOKEN.
// =============================================================================

import { isAuthorized, parseBody, sendError, zaiRequest } from './_zai.js';

const VIDEO_SIZES = new Set([
    '1280x720',
    '720x1280',
    '1024x1024',
    '1920x1080',
    '1080x1920',
    '2048x1080',
    '3840x2160',
]);

const MAX_TOTAL_BASE64 = 3.5 * 1024 * 1024;
const MAX_PROMPT_LENGTH = 512;

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') return sendError(res, 405, 'Método não permitido');
    if (!isAuthorized(req)) return sendError(res, 401, 'Token de acesso inválido');

    try {
        const {
            prompt = '',
            images = [],
            quality = 'speed',
            size,
            fps = 30,
            duration = 5,
            with_audio = false,
        } = parseBody(req);

        const cleanPrompt = typeof prompt === 'string' ? prompt.trim() : '';

        if (!Array.isArray(images)) {
            return sendError(res, 400, 'Campo "images" deve ser uma lista');
        }
        if (images.length > 2) {
            return sendError(res, 400, 'Máximo de 2 imagens (primeiro/último quadro)');
        }
        if (images.some((img) => typeof img !== 'string' || !img.startsWith('data:image/'))) {
            return sendError(res, 400, 'Imagens devem ser data-URLs base64 (JPEG/PNG)');
        }
        const totalBase64 = images.reduce((sum, img) => sum + img.length, 0);
        if (totalBase64 > MAX_TOTAL_BASE64) {
            return sendError(res, 413, 'Imagens muito grandes — envie no máximo ~3.5MB no total');
        }
        if (!cleanPrompt && images.length === 0) {
            return sendError(res, 400, 'Informe um prompt ou ao menos uma imagem');
        }
        if (cleanPrompt.length > MAX_PROMPT_LENGTH) {
            return sendError(res, 400, `Prompt deve ter no máximo ${MAX_PROMPT_LENGTH} caracteres`);
        }
        if (!['speed', 'quality'].includes(quality)) {
            return sendError(res, 400, 'Qualidade inválida (use "speed" ou "quality")');
        }
        if (![5, 10].includes(duration)) return sendError(res, 400, 'Duração inválida (5 ou 10 segundos)');
        if (![30, 60].includes(fps)) return sendError(res, 400, 'FPS inválido (30 ou 60)');
        if (size !== undefined && !VIDEO_SIZES.has(size)) {
            return sendError(res, 400, 'Formato inválido');
        }

        // Regra da API: modo primeiro/último quadro (2 imagens) só aceita speed.
        const effectiveQuality = images.length === 2 ? 'speed' : quality;

        const body = {
            model: 'cogvideox-3',
            quality: effectiveQuality,
            with_audio: Boolean(with_audio),
            duration,
            fps,
        };
        if (cleanPrompt) body.prompt = cleanPrompt;
        if (images.length > 0) body.image_url = images;
        if (size) body.size = size;

        const result = await zaiRequest('/paas/v4/videos/generations', { method: 'POST', body });
        if (!result?.id) return sendError(res, 502, 'Z.ai não retornou o id da tarefa');
        return res.status(200).json({ id: result.id, status: result.task_status, model: result.model });
    } catch (err) {
        return sendError(res, err.statusCode || 500, err.message, err.zaiCode !== undefined ? { zaiCode: err.zaiCode } : {});
    }
}
