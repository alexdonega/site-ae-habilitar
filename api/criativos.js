// =============================================================================
//  /api/criativos — Biblioteca de criativos para o gestor de tráfego
// =============================================================================
//  GET                                      → lista todos (leitura pública,
//                                            como /api/marketing).
//  POST   { action: 'upload-url', filename } → signed upload URL: o cliente
//                                            envia o arquivo DIRETO ao
//                                            Storage (limite Vercel ~4,5MB).
//  POST   { arquivo_path, titulo, tipo, … }  → registra o criativo (a mídia
//                                            já subiu via signed URL).
//  PATCH  ?id=… { status, observacoes, … }   → atualiza campos.
//  DELETE ?id=…                               → remove row + objeto do Storage.
//
//  Decisão do Alex em 2026-09-03: página aberta, sem token — leitura E
//  escrita liberadas, mesmo padrão de /api/produtos e /api/fotos-perfil
//  (o /imagens). A service_role nunca sai do servidor (RLS bloqueia anon).
//  Runbook: Docs/Tecnico/biblioteca_criativos.md
// =============================================================================

import {
    criativosConfigFromEnv,
    requireCriativosConfig,
    listCriativos,
    createUploadUrl,
    insertCriativo,
    updateCriativo,
    deleteCriativo,
} from './_criativos.js';

// O runtime da Vercel entrega req.body parseado e req.query pronto; no dev
// server (adaptador do vite.config.js) chega string/Buffer e a query precisa
// vir da URL — daí os dois helpers abaixo.
function parseBody(req) {
    const body = req.body;
    if (!body) return {};
    if (typeof body === 'string') {
        try {
            return JSON.parse(body);
        } catch {
            return {};
        }
    }
    if (Buffer.isBuffer(body)) {
        try {
            return JSON.parse(body.toString());
        } catch {
            return {};
        }
    }
    return body;
}

function getQuery(req) {
    if (req.query && typeof req.query === 'object') return req.query;
    const qs = (req.url || '').split('?')[1] || '';
    return Object.fromEntries(new URLSearchParams(qs));
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    const config = criativosConfigFromEnv();
    const configErr = requireCriativosConfig(config);
    if (configErr) {
        return res.status(500).json({ error: configErr.message });
    }

    try {
        if (req.method === 'GET') {
            const rows = await listCriativos({ config });
            return res.status(200).json({
                rows,
                updatedAt: new Date().toISOString(),
            });
        }

        if (req.method === 'POST') {
            const body = parseBody(req);
            if (body.action === 'upload-url') {
                const info = await createUploadUrl({ config, filename: body.filename });
                return res.status(200).json(info);
            }
            const criativo = await insertCriativo({ config, input: body });
            return res.status(201).json({ criativo });
        }

        if (req.method === 'PATCH') {
            const id = getQuery(req).id;
            if (!id) {
                return res.status(400).json({ error: 'Parâmetro ?id= obrigatório' });
            }
            const criativo = await updateCriativo({
                config,
                id,
                input: parseBody(req),
            });
            return res.status(200).json({ criativo });
        }

        if (req.method === 'DELETE') {
            const id = getQuery(req).id;
            if (!id) {
                return res.status(400).json({ error: 'Parâmetro ?id= obrigatório' });
            }
            const result = await deleteCriativo({ config, id });
            return res.status(200).json(result);
        }

        return res.status(405).json({ error: 'Método não permitido' });
    } catch (err) {
        if (err.badInput) return res.status(400).json({ error: err.message });
        if (err.conflict) return res.status(409).json({ error: err.message });
        if (err.notFound) return res.status(404).json({ error: err.message });
        return res.status(502).json({
            error: 'Falha no Supabase',
            detail: err.message,
        });
    }
}
