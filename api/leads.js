// =============================================================================
//  /api/leads — Dashboard em tempo real (/lead; antiga /dash)
// =============================================================================
//  GET    → todos os leads da tabela "leads", do mais recente para o mais
//           antigo. A página /lead faz polling a cada 10s (e ao voltar para
//           a aba) para se manter atualizada.
//  PATCH  ?id= {status} → atualiza a etapa de atendimento do lead (coluna
//           "status", criada em supabase/sql/2026-09-04-leads-status.sql;
//           null/'' limpa). É o select inline da coluna Status do /lead.
//
//  Usa a service_role key EXCLUSIVAMENTE aqui no servidor: o RLS da tabela
//  bloqueia a leitura com a anon key (o browser não consegue listar leads
//  direto), então este endpoint é a única fonte de dados da dashboard.
// =============================================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
    process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role;

// Valores válidos da coluna Status (mesma lista em src/Dash.jsx e no comment
// da coluna no Supabase).
const STATUS_VALIDOS = ['Pagou', 'Passou documento', 'Vai passar dados', 'Vai na Autoescola'];

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (!['GET', 'PATCH'].includes(req.method)) {
        return res.status(405).json({ error: 'Método não permitido' });
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: 'Credenciais do Supabase não configuradas' });
    }

    const query = new URL(req.url || '/', 'http://localhost').searchParams;

    let body = {};
    if (req.method === 'PATCH') {
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

        if (req.method === 'PATCH') {
            const id = Number(query.get('id'));
            if (!Number.isInteger(id) || id <= 0) {
                return res.status(400).json({ error: '?id= é obrigatório' });
            }
            const status =
                body.status === null || body.status === undefined || body.status === ''
                    ? null
                    : String(body.status);
            if (status !== null && !STATUS_VALIDOS.includes(status)) {
                return res.status(400).json({
                    error: `Status inválido — use um destes: ${STATUS_VALIDOS.join(', ')}`,
                });
            }
            const { data, error } = await supabase
                .from('leads')
                .update({ status })
                .eq('id', id)
                .select();
            if (error) {
                // PGRST204 citando "status" = a coluna ainda não existe no
                // banco (DDL pendente no SQL Editor).
                if (
                    /status/i.test(String(error.message || '')) &&
                    (error.code === 'PGRST204' || /schema cache|column/i.test(String(error.message || '')))
                ) {
                    return res.status(409).json({
                        error: 'Coluna "status" pendente no Supabase',
                        detail: 'Rode supabase/sql/2026-09-04-leads-status.sql no SQL Editor do Supabase para usar a coluna Status.',
                    });
                }
                throw error;
            }
            const lead = data && data[0];
            if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
            return res.status(200).json({ lead });
        }

        // GET
        const { data, error } = await supabase
            .from('leads')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5000);

        if (error) throw error;

        return res.status(200).json({
            leads: data,
            updatedAt: new Date().toISOString(),
        });
    } catch (err) {
        return res.status(502).json({
            error: 'Falha ao consultar o Supabase',
            detail: err.message,
        });
    }
}
