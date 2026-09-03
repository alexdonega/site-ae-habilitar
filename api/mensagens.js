// =============================================================================
//  /api/mensagens — CRUD dos scripts de WhatsApp da página /mensagens
// =============================================================================
//  Tabela "mensagens" (criada em supabase/sql/2026-09-03-mensagens.sql):
//  categoria, titulo, conteudo (mensagem em texto PURO com formatação nativa
//  do WhatsApp — *negrito*, _itálico_, ~riscado~, ```monoespaçado```), ordem,
//  ativo, abertura (opcional — texto enviado ANTES do conteudo quando o
//  atendimento sai em 2 mensagens, ex.: a MEGA OFERTA antes do orçamento;
//  exige supabase/sql/2026-09-03-mensagens-abertura.sql).
//
//    GET    → todas as linhas ordenadas por ordem, id (inclusive inativas —
//             /mensagens é página de gestão; /dashboard filtra ativo no client)
//    POST   {categoria, titulo, conteudo, abertura?, ordem?, ativo?} → cria (201)
//    PATCH  ?id= {...campos} → atualiza
//    DELETE ?id= → apaga a linha
//
//  Escritas abertas (mesma decisão do /imagens em 2026-09-03): a página não
//  exige token e a service_role nunca vai ao client — só aqui no servidor.
// =============================================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
    process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role;

// Colunas válidas para insert/update (tudo que não estiver aqui é ignorado).
function sanitize(body) {
    const row = {};
    if (body.categoria !== undefined) row.categoria = String(body.categoria ?? '').trim();
    if (body.titulo !== undefined) row.titulo = String(body.titulo ?? '').trim();
    if (body.conteudo !== undefined) row.conteudo = String(body.conteudo ?? '');
    if (body.ordem !== undefined) row.ordem = Math.trunc(Number(body.ordem)) || 0;
    if (body.ativo !== undefined) row.ativo = Boolean(body.ativo);
    // abertura: vazia/null remove (o envio volta a ser de 1 mensagem).
    if (body.abertura !== undefined) {
        const v = body.abertura;
        row.abertura = v === null || String(v ?? '').trim() === '' ? null : String(v);
    }
    return row;
}

// PGRST204 citando "abertura" = a coluna ainda não existe no banco (DDL de
// supabase/sql/2026-09-03-mensagens-abertura.sql pendente no SQL Editor).
const aberturaPendente = (err) =>
    /abertura/i.test(String(err?.message || '')) &&
    (err?.code === 'PGRST204' || /schema cache|column/i.test(String(err?.message || '')));

// Insert/update tolerante à coluna pendente: abertura vazia → regrava sem o
// campo (nada muda para quem nunca usou); abertura preenchida → erro claro
// pedindo o SQL, em vez de salvar em silêncio sem ela.
async function gravar(executar, row) {
    let { data, error } = await executar(row);
    if (error && 'abertura' in row && aberturaPendente(error)) {
        if (row.abertura != null) {
            const err = new Error(
                'Coluna "abertura" pendente — rode supabase/sql/2026-09-03-mensagens-abertura.sql ' +
                'no SQL Editor do Supabase para poder salvar a abertura.',
            );
            err.status = 409;
            throw err;
        }
        const { abertura, ...semAbertura } = row;
        ({ data, error } = await executar(semAbertura));
    }
    if (error) throw error;
    return data;
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
        return res.status(405).json({ error: 'Método não permitido' });
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
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

    try {
        const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });

        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('mensagens')
                .select('*')
                .order('ordem', { ascending: true })
                .order('id', { ascending: true });
            if (error) throw error;
            return res.status(200).json({
                rows: data || [],
                updatedAt: new Date().toISOString(),
            });
        }

        if (req.method === 'POST') {
            const row = sanitize(body);
            if (!row.titulo) return res.status(400).json({ error: '"titulo" é obrigatório' });
            if (!row.conteudo.trim()) {
                return res.status(400).json({ error: '"conteudo" não pode ficar vazio' });
            }
            if (!row.categoria) row.categoria = 'Comunicação';
            const data = await gravar(
                (r) => supabase.from('mensagens').insert(r).select().single(),
                row,
            );
            return res.status(201).json({ row: data });
        }

        if (req.method === 'PATCH') {
            if (!Number.isInteger(id) || id <= 0) {
                return res.status(400).json({ error: '?id= é obrigatório' });
            }
            const row = sanitize(body);
            if ('titulo' in row && !row.titulo) {
                return res.status(400).json({ error: '"titulo" não pode ficar vazio' });
            }
            if ('conteudo' in row && !row.conteudo.trim()) {
                return res.status(400).json({ error: '"conteudo" não pode ficar vazio' });
            }
            if ('categoria' in row && !row.categoria) row.categoria = 'Comunicação';
            if (Object.keys(row).length === 0) {
                return res.status(400).json({ error: 'Nenhum campo para atualizar' });
            }
            const data = await gravar(
                (r) => supabase.from('mensagens').update(r).eq('id', id).select().single(),
                row,
            );
            return res.status(200).json({ row: data });
        }

        // DELETE
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: '?id= é obrigatório' });
        }
        const { error } = await supabase.from('mensagens').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
    } catch (err) {
        return res.status(err.status || 502).json({
            error: 'Falha na tabela "mensagens"',
            detail: err.message,
        });
    }
}
