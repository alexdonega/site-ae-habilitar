// =============================================================================
//  /api/marketing — Painel de mídia do /dash (integração Windsor.ai)
// =============================================================================
//  GET → linhas da tabela "marketing_performance" (criada e abastecida
//        diariamente pelo Windsor.ai como destino), da data mais recente
//        para a mais antiga: date, datasource, account_name, source,
//        campaign, clicks, spend.
//
//  Usa a service_role key EXCLUSIVAMENTE aqui no servidor: a tabela tem RLS
//  habilitado sem policies (ver supabase/sql/), então a anon key não lê os
//  dados de investimento — este endpoint é a única fonte do painel de mídia.
//  Runbook: Docs/Tecnico/integracao_windsor.md
// =============================================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
    process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role;

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método não permitido' });
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: 'Credenciais do Supabase não configuradas' });
    }

    try {
        const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data, error } = await supabase
            .from('marketing_performance')
            .select('*')
            .order('date', { ascending: false })
            .limit(5000);

        if (error) throw error;

        return res.status(200).json({
            rows: data,
            updatedAt: new Date().toISOString(),
        });
    } catch (err) {
        return res.status(502).json({
            error: 'Falha ao consultar o Supabase',
            detail: err.message,
        });
    }
}
