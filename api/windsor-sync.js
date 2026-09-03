// =============================================================================
//  /api/windsor-sync — sincronização diária Windsor.ai → Supabase
// =============================================================================
//  GET  (cron da Vercel — envia "Authorization: Bearer $CRON_SECRET" quando
//       CRON_SECRET está definido no projeto) e POST (manual, com
//       ?secret=<WINDSOR_SYNC_SECRET> ou o mesmo Bearer).
//
//  Refresca a janela configurada (default 3 dias — Meta ainda revisa os
//  últimos ~3 dias de dados) com replace idempotente por período na tabela
//  marketing_performance. Backfills grandes ficam para o CLI local:
//    node scripts/windsor-sync.mjs --from=... --to=...
//
//  Nunca imprime segredos. Lógica em api/_windsor.js.
// =============================================================================

import { syncMarketingPerformance } from './_windsor.js';

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    // --- autenticação: Bearer CRON_SECRET (cron) ou ?secret= (manual) -------
    const expected =
        process.env.WINDSOR_SYNC_SECRET || process.env.CRON_SECRET || '';
    if (!expected) {
        return res.status(500).json({
            error:
                'Sync não protegido: defina WINDSOR_SYNC_SECRET (ou CRON_SECRET) no ambiente',
        });
    }
    const provided =
        (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
        (req.query && req.query.secret) ||
        '';
    if (provided !== expected) {
        return res.status(401).json({ error: 'Não autorizado' });
    }

    // Janela: days (cron, 1–7) OU from/to explícitos (backfill manual via
    // produção, sem precisar do service_role local). Limite de 92 dias por
    // chamada para caber no maxDuration de 30s da função.
    let window;
    const qFrom = String((req.query && req.query.from) || '');
    const qTo = String((req.query && req.query.to) || '');
    if (qFrom || qTo) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(qFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(qTo)) {
            return res.status(400).json({ error: 'from/to devem ser YYYY-MM-DD' });
        }
        if (qFrom > qTo) {
            return res.status(400).json({ error: 'from deve ser <= to' });
        }
        const spanDays = (Date.parse(qTo) - Date.parse(qFrom)) / 86400000;
        if (spanDays > 92) {
            return res.status(400).json({ error: 'Janela máxima de 92 dias por chamada' });
        }
        window = { from: qFrom, to: qTo };
    } else {
        window = { days: Math.min(Math.max(Number(req.query && req.query.days) || 3, 1), 7) };
    }

    try {
        const result = await syncMarketingPerformance({ ...window, timeoutMs: 25000 });
        return res.status(200).json({ ok: true, ...result });
    } catch (err) {
        const status = err.invalidKey ? 401 : err.config ? 500 : 502;
        return res.status(status).json({
            ok: false,
            error: err.message,
        });
    }
}
