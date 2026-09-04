// =============================================================================
//  api/_imagens — factory dos endpoints de CRUD com imagem no Storage
// =============================================================================
//  Compartilhado por /api/produtos e /api/fotos-perfil (não vira rota — o
//  prefixo "_" é ignorado pela Vercel). Cada endpoint é um CRUD completo na
//  tabela informada, em que a imagem chega como dataURL base64 comprimido no
//  navegador (canvas → JPEG) e é gravada no bucket público
//  "imagens" do Supabase Storage:
//    produtos → pasta "produtos/"   (imagem do orçamento)
//    perfil   → pasta "perfil/"     (foto de perfil do WhatsApp)
//  A linha guarda imagem_url (URL pública) e imagem_path (caminho no bucket,
//  usado para apagar o objeto quando a imagem é trocada ou a linha excluída).
//
//  Escritas abertas (decisão do Alex em 2026-09-03): a página /imagens não
//  exige token, mesma exposição das dashboards /lead e /meta-ads.
// =============================================================================

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'imagens';
const MAX_BYTES = 4 * 1024 * 1024; // folga sob o body de 4.5MB da Vercel

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/;
const EXT_BY_MIME = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
const EXT_BY_EXT = { jpeg: 'jpeg', jpg: 'jpeg', png: 'png', webp: 'webp' };

// Erro de validação de entrada (responde 400, não 502).
class UserError extends Error {}

function slugify(texto) {
    const slug = String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return (slug || 'imagem').slice(0, 60);
}

function creds() {
    return {
        url: process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
        key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role,
    };
}

async function subirImagem(supabase, pasta, nomeBase, dataUrl) {
    const m = DATA_URL_RE.exec(String(dataUrl || ''));
    if (!m) {
        throw new UserError('Imagem inválida — envie JPEG, PNG ou WebP como dataURL base64.');
    }
    const [, mime, b64] = m;
    const bytes = Buffer.from(b64, 'base64');
    if (bytes.length > MAX_BYTES) {
        throw new UserError(
            `Imagem de ${(bytes.length / 1048576).toFixed(1)}MB — comprima para menos de 4MB.`,
        );
    }
    const path =
        `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}` +
        `-${slugify(nomeBase)}.${EXT_BY_MIME[mime]}`;
    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw new Error(`Storage recusou o upload: ${error.message}`);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path };
}

// Best-effort: falha ao apagar o objeto antigo não derruba a operação
// (objeto órfão no bucket público é inofensivo).
async function removerImagem(supabase, path) {
    if (!path) return;
    try {
        await supabase.storage.from(BUCKET).remove([path]);
    } catch {
        /* ignora */
    }
}

// createImagensHandler({ tabela, pasta, sanitize, nomeObrigatorio, campoTitulo })
// → handler Vercel (req, res). sanitize(body) devolve o objeto de colunas
// válidas para insert/update (o endpoint filtra tudo que não estiver lá).
// campoTitulo (default 'nome') é a coluna que titula o objeto no Storage
// ("produtos" usa 'produto' desde 2026-09-03; "fotos_perfil" usa 'nome').
export function createImagensHandler({ tabela, pasta, sanitize, nomeObrigatorio, campoTitulo = 'nome' }) {
    return async function handler(req, res) {
        res.setHeader('Cache-Control', 'no-store');

        if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
            return res.status(405).json({ error: 'Método não permitido' });
        }
        const { url: supabaseUrl, key } = creds();
        if (!supabaseUrl || !key) {
            return res.status(500).json({ error: 'Credenciais do Supabase não configuradas' });
        }

        const query = new URL(req.url || '/', 'http://localhost').searchParams;
        const id = Number(query.get('id'));

        let body = {};
        if (req.method === 'POST' || req.method === 'PATCH') {
            try {
                body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
            } catch {
                return res.status(400).json({ error: 'JSON inválido no body' });
            }
        }

        const supabase = createClient(supabaseUrl, key, {
            auth: { persistSession: false, autoRefreshToken: false },
        });

        try {
            // GET — todas as linhas (inclusive inativas: /imagens é página de gestão)
            if (req.method === 'GET') {
                const { data, error } = await supabase
                    .from(tabela)
                    .select('*')
                    .order('ordem', { ascending: true })
                    .order('id', { ascending: true });
                if (error) throw error;
                return res.status(200).json({
                    rows: data || [],
                    updatedAt: new Date().toISOString(),
                });
            }

            // POST — cria linha nova (imagem obrigatória; sobe antes do insert)
            if (req.method === 'POST') {
                // action:'upload-url' → o navegador envia o arquivo DIRETO ao
                // Storage via signed URL com barra de progresso (mesmo fluxo
                // do /criativos; bypassa o limite de corpo da Vercel) e depois
                // cria a linha passando imagem_path. O caminho é gerado AQUI
                // para o cliente não escolher caminhos arbitrários.
                if (body.action === 'upload-url') {
                    const filename = typeof body.filename === 'string' ? body.filename : '';
                    const ext = EXT_BY_EXT[(filename.split('.').pop() || '').toLowerCase()];
                    if (!filename || filename.length > 260 || !ext) {
                        return res.status(400).json({ error: 'filename inválido (use .jpeg/.jpg/.png/.webp)' });
                    }
                    const base = filename.slice(0, filename.lastIndexOf('.'));
                    const path =
                        `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}` +
                        `-${slugify(base)}.${ext}`;
                    const { data, error } = await supabase.storage
                        .from(BUCKET)
                        .createSignedUploadUrl(path, { expiresIn: 3600 });
                    if (error) throw new Error(`Storage não assinou a URL: ${error.message}`);
                    return res.status(200).json({ bucket: BUCKET, path, signedUrl: data.signedUrl });
                }

                const row = sanitize(body);
                if (nomeObrigatorio && !String(row[campoTitulo] || '').trim()) {
                    return res.status(400).json({ error: `"${campoTitulo}" é obrigatório` });
                }

                let img = null;
                if (typeof body.imagem_path === 'string' && body.imagem_path.startsWith(`${pasta}/`)) {
                    // Upload direto já feito pelo navegador — só resolve a URL pública.
                    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(body.imagem_path);
                    img = { url: pub.publicUrl, path: body.imagem_path };
                } else if (body.imagem_data_url) {
                    img = await subirImagem(
                        supabase,
                        pasta,
                        row[campoTitulo] || 'imagem',
                        body.imagem_data_url,
                    );
                } else {
                    return res.status(400).json({
                        error: '"imagem_path" (upload direto) ou "imagem_data_url" é obrigatório',
                    });
                }
                row.imagem_url = img.url;
                row.imagem_path = img.path;
                const { data, error } = await supabase
                    .from(tabela)
                    .insert(row)
                    .select()
                    .single();
                if (error) {
                    // Objeto que ESTE endpoint subiu: limpa. O do upload direto
                    // fica (o cliente pode tentar criar a linha de novo).
                    if (!body.imagem_path) await removerImagem(supabase, img.path);
                    throw error;
                }
                return res.status(201).json({ row: data });
            }

            // PATCH — atualiza campos (?id=); imagem_data_url troca a imagem
            if (req.method === 'PATCH') {
                if (!Number.isInteger(id) || id <= 0) {
                    return res.status(400).json({ error: '?id= é obrigatório' });
                }
                const row = sanitize(body);
                if (campoTitulo in row && !String(row[campoTitulo]).trim()) {
                    return res.status(400).json({ error: `"${campoTitulo}" não pode ficar vazio` });
                }
                let novaPath = null;
                let limpavelPath = null; // objeto que ESTE endpoint subiu (falha → remove)
                if (typeof body.imagem_path === 'string' && body.imagem_path.startsWith(`${pasta}/`)) {
                    // Upload direto já feito pelo navegador.
                    novaPath = body.imagem_path;
                    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(novaPath);
                    row.imagem_url = pub.publicUrl;
                    row.imagem_path = novaPath;
                } else if (body.imagem_data_url) {
                    const img = await subirImagem(
                        supabase,
                        pasta,
                        row[campoTitulo] || 'imagem',
                        body.imagem_data_url,
                    );
                    row.imagem_url = img.url;
                    row.imagem_path = img.path;
                    novaPath = img.path;
                    limpavelPath = img.path;
                }
                if (Object.keys(row).length === 0) {
                    if (limpavelPath) await removerImagem(supabase, limpavelPath);
                    return res.status(400).json({ error: 'Nenhum campo para atualizar' });
                }
                const { data: antiga } = await supabase
                    .from(tabela)
                    .select('imagem_path')
                    .eq('id', id)
                    .maybeSingle();
                if (!antiga) {
                    if (limpavelPath) await removerImagem(supabase, limpavelPath);
                    return res.status(404).json({ error: 'Linha não encontrada' });
                }
                const { data, error } = await supabase
                    .from(tabela)
                    .update(row)
                    .eq('id', id)
                    .select()
                    .single();
                if (error) throw error;
                if (novaPath && antiga.imagem_path && novaPath !== antiga.imagem_path) {
                    await removerImagem(supabase, antiga.imagem_path);
                }
                return res.status(200).json({ row: data });
            }

            // DELETE — apaga a linha e o objeto do Storage
            const { data: antiga, error: errSel } = await supabase
                .from(tabela)
                .select('imagem_path')
                .eq('id', id)
                .maybeSingle();
            if (errSel) throw errSel;
            if (!antiga) return res.status(404).json({ error: 'Linha não encontrada' });
            const { error } = await supabase.from(tabela).delete().eq('id', id);
            if (error) throw error;
            await removerImagem(supabase, antiga.imagem_path);
            return res.status(200).json({ ok: true });
        } catch (err) {
            if (err instanceof UserError) {
                return res.status(400).json({ error: err.message });
            }
            return res.status(502).json({
                error: `Falha na tabela "${tabela}"`,
                detail: err.message,
            });
        }
    };
}
