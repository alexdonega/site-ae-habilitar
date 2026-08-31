// =============================================================================
//  Helpers compartilhados pelas funções /api (integração Z.ai — AE Studio)
// =============================================================================
//  Este arquivo NÃO é um endpoint: arquivos com prefixo "_" no diretório api/
//  são ignorados pelo builder da Vercel, então ele só existe para ser importado
//  pelas funções reais (create-image.js, create-video.js, task-status.js).
//
//  Segurança: a ZAI_API_KEY vive apenas em process.env (server-side). Ela nunca
//  recebe prefixo VITE_/PUBLIC_ e por isso nunca vai para o bundle do cliente.
// =============================================================================

import { timingSafeEqual } from 'crypto';

export const ZAI_BASE = 'https://api.z.ai/api';

// Compara o header x-studio-token com o env ZAI_STUDIO_TOKEN em tempo constante
// para não vazar informação via timing. Sem token configurado, nega tudo.
export function isAuthorized(req) {
    const expected = process.env.ZAI_STUDIO_TOKEN;
    const provided = req.headers['x-studio-token'];
    if (!expected || !provided || typeof provided !== 'string') return false;
    const a = Buffer.from(String(expected));
    const b = Buffer.from(String(provided));
    return a.length === b.length && timingSafeEqual(a, b);
}

export function sendError(res, statusCode, message, extra = {}) {
    return res.status(statusCode).json({ error: message, ...extra });
}

// O runtime da Vercel normalmente já entrega req.body parseado como objeto,
// mas com vercel dev / content-type estranho pode chegar string/Buffer.
export function parseBody(req) {
    const body = req.body;
    if (!body) return {};
    if (typeof body === 'string' || Buffer.isBuffer(body)) {
        try {
            return JSON.parse(body.toString());
        } catch {
            return {};
        }
    }
    return body;
}

// Wrapper do fetch para a API da Z.ai: injeta o Bearer, trata erro HTTP e
// devolve o JSON já parseado. Erros viram exceção com statusCode/zaiCode.
export async function zaiRequest(path, { method = 'GET', body } = {}) {
    if (!process.env.ZAI_API_KEY) {
        const err = new Error('ZAI_API_KEY não configurada no ambiente');
        err.statusCode = 500;
        throw err;
    }

    let response;
    try {
        response = await fetch(`${ZAI_BASE}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${process.env.ZAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    } catch {
        const err = new Error('Falha de comunicação com a API da Z.ai');
        err.statusCode = 502;
        throw err;
    }

    const text = await response.text();
    let data;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { message: text };
    }

    if (!response.ok) {
        const err = new Error(data.message || data.error?.message || `Z.ai respondeu ${response.status}`);
        err.statusCode = response.status;
        err.zaiCode = data.code;
        throw err;
    }
    return data;
}
