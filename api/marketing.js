// =============================================================================
//  /api/marketing — Painel de mídia do /lead (integração Windsor.ai)
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
import { syncMarketingPerformance } from './_windsor.js';

const SUPABASE_URL =
    process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role;

// Throttle do ?sync=1 (por instância da função): repuxa o dia corrente do
// Windsor no máximo 1× a cada 10 min — o botão de refresh do /meta-ads usa,
// para que "hoje" apareça parcial durante o dia sem martelar a API.
let lastSyncAt = 0;

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método não permitido' });
    }
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        return res.status(500).json({ error: 'Credenciais do Supabase não configuradas' });
    }

    if (req.query && req.query.sync === '1' && Date.now() - lastSyncAt > 10 * 60 * 1000) {
        lastSyncAt = Date.now();
        try {
            // Janela leve (ontem + hoje) — falha aqui não bloqueia a leitura.
            await syncMarketingPerformance({ days: 1, timeoutMs: 15000 });
        } catch {
            // Windsor lento/offline — serve os dados que já estão no banco.
        }
    }

    try {
        const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });

        // PostgREST entrega no máx. 1000 linhas por resposta (db-max-rows),
        // então pagina até esgotar (capa de segurança: 20k linhas ≈ 8+ anos
        // de histórico anúncio × dia desta operação).
        const PAGE = 1000;
        let rows = [];
        for (let offset = 0; offset < 20000; offset += PAGE) {
            const { data, error } = await supabase
                .from('marketing_performance')
                .select('*')
                .order('date', { ascending: false })
                .range(offset, offset + PAGE - 1);
            if (error) throw error;
            rows = rows.concat(data || []);
            if (!data || data.length < PAGE) break;
        }

        return res.status(200).json({
            rows,
            updatedAt: new Date().toISOString(),
        });
    } catch (err) {
        return res.status(502).json({
            error: 'Falha ao consultar o Supabase',
            detail: err.message,
        });
    }
}
