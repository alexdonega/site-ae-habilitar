// =============================================================================
//  /api/leads — Dashboard em tempo real (/dash)
// =============================================================================
//  GET   → todos os leads da tabela "leads", do mais recente para o mais
//          antigo. A página /dash faz polling a cada 10s (e ao voltar para a
//          aba) para se manter atualizada.
//  PATCH → marca/desmarca a coluna "contato_realizado" de um lead
//          (body: { id: number, contato_realizado: boolean }).
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

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'GET' && req.method !== 'PATCH') {
        return res.status(405).json({ error: 'Método não permitido' });
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: 'Credenciais do Supabase não configuradas' });
    }

    try {
        const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });

        if (req.method === 'PATCH') {
            const { id, contato_realizado } = req.body || {};
            if (!Number.isInteger(id) || typeof contato_realizado !== 'boolean') {
                return res.status(400).json({ error: 'Envie { id: number, contato_realizado: boolean }' });
            }

            const { data, error } = await supabase
                .from('leads')
                .update({ contato_realizado })
                .eq('id', id)
                .select('id, contato_realizado')
                .single();

            if (error) throw error;
            return res.status(200).json({ lead: data });
        }

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
