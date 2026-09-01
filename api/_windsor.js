// =============================================================================
//  _windsor.js — Núcleo da sincronização Windsor.ai → Supabase
// =============================================================================
//  Compartilhado por:
//    • scripts/windsor-sync.mjs  (CLI: backfill local / selftest / dry-run)
//    • api/windsor-sync.js       (Vercel function chamada pelo cron diário)
//    • vite.config.js            (middleware dev — paridade com produção)
//
//  Fluxo: Connectors API (connectors.windsor.ai/facebook) → normalização →
//  replace por período na tabela public.marketing_performance (DELETE do
//  intervalo + INSERT). Idempotente: rodar de novo não duplica linhas.
//
//  A tabela não tem chave primária (foi pré-criada para a destination task do
//  Windsor, que faz upsert por "columns to match"); por isso o replace é por
//  intervalo de datas, não por upsert de linha individual.
//
//  Segredos (service_role, WINDSOR_API_KEY) ficam em process.env — nunca no
//  bundle do navegador e nunca em log/output.
// =============================================================================

// 33 colunas — nomes idênticos ao catálogo de campos do conector Facebook Ads
// (https://windsor.ai/data-field/facebook/) e ao DDL em supabase/sql/.
export const WINDSOR_FIELDS = [
    'date',
    'datasource',
    'source',
    'account_id',
    'account_name',
    'account_currency',
    'campaign',
    'campaign_id',
    'adset_name',
    'adset_id',
    'ad_name',
    'ad_id',
    'creative_id',
    'objective',
    'clicks',
    'unique_clicks',
    'impressions',
    'reach',
    'frequency',
    'spend',
    'cpc',
    'cpm',
    'actions_link_click',
    'actions_landing_page_view',
    'actions_lead',
    'actions_leadgen_grouped',
    'actions_offsite_conversion_fb_pixel_lead',
    'actions_complete_registration',
    'actions_offsite_conversion_fb_pixel_complete_registration',
    'actions_onsite_conversion_total_messaging_connection',
    'actions_onsite_conversion_messaging_conversation_started_7d',
    'cost_per_action_type_lead',
    'cost_per_action_type_complete_registration',
];

const DIMENSION_FIELDS = new Set(WINDSOR_FIELDS.slice(0, 14));
const CONNECTOR_URL = 'https://connectors.windsor.ai/facebook';
const SUPABASE_TABLE = 'marketing_performance';

export function windsorConfigFromEnv() {
    return {
        apiKey: process.env.WINDSOR_API_KEY || '',
        supabaseUrl:
            process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
        serviceRoleKey:
            process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.service_role ||
            '',
    };
}

function isoDay(offsetDays = 0) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}

/**
 * Resolve a janela de datas a sincronizar.
 * @param {{days?: number, from?: string, to?: string}} opts
 */
export function resolveWindow(opts = {}) {
    if (opts.from || opts.to) {
        if (!opts.from || !opts.to) {
            throw new Error('Informe --from e --to juntos (YYYY-MM-DD)');
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.from) || !/^\d{4}-\d{2}-\d{2}$/.test(opts.to)) {
            throw new Error('Datas devem estar no formato YYYY-MM-DD');
        }
        if (opts.from > opts.to) throw new Error('--from deve ser <= --to');
        return { from: opts.from, to: opts.to };
    }
    const days = Math.max(1, Number(opts.days) || 3);
    // Até ontem: o dia corrente no Meta ainda muda ao longo do dia.
    return { from: isoDay(-days), to: isoDay(-1) };
}

function toNumber(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/** Linha crua do Windsor → linha no formato da tabela. */
export function normalizeRow(raw) {
    const row = {};
    for (const field of WINDSOR_FIELDS) {
        const value = raw[field];
        if (field === 'date') {
            const day = value ? String(value).slice(0, 10) : null;
            row.date = /^\d{4}-\d{2}-\d{2}$/.test(day || '') ? day : null;
        } else if (DIMENSION_FIELDS.has(field)) {
            row[field] =
                value === null || value === undefined
                    ? null
                    : String(value);
        } else {
            row[field] = toNumber(value);
        }
    }
    return row;
}

/** Chave lógica da linha (grain anúncio × dia). */
function rowKey(row) {
    return [
        row.date,
        row.datasource,
        row.account_id,
        row.adset_id,
        row.ad_id,
        row.creative_id,
    ].join('|');
}

function extractRows(payload) {
    let data = payload && payload.data;
    // Alguns conectores embrulham uma vez a mais: {"data":{"data":[...]}}
    if (data && !Array.isArray(data) && Array.isArray(data.data)) {
        data = data.data;
    }
    return Array.isArray(data) ? data : null;
}

/**
 * Busca um período no Connectors API. Se a API rejeitar campos desconhecidos
 * pela conta, retira os campos ofensivos e tenta de novo (as colunas ficam
 * null na tabela — melhor que perder a sincronização inteira).
 */
export async function fetchWindsorWindow({ apiKey, from, to, timeoutMs = 120000 }) {
    let fields = [...WINDSOR_FIELDS];
    let lastError = null;

    for (let attempt = 0; attempt < 4; attempt++) {
        const url =
            `${CONNECTOR_URL}?api_key=${encodeURIComponent(apiKey)}` +
            `&fields=${encodeURIComponent(fields.join(','))}` +
            `&date_from=${from}&date_to=${to}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let res;
        try {
            res = await fetch(url, { signal: controller.signal });
        } catch (err) {
            clearTimeout(timer);
            const detail = err.name === 'AbortError' ? 'timeout' : err.message;
            throw new Error(`Connectors API inacessível (${detail})`);
        }
        clearTimeout(timer);

        const text = await res.text();
        let payload = null;
        try {
            payload = JSON.parse(text);
        } catch {
            payload = null;
        }

        if (res.ok) {
            const rows = extractRows(payload);
            if (!rows) {
                throw new Error(
                    `Resposta inesperada da Connectors API (HTTP ${res.status})`
                );
            }
            return rows.map(normalizeRow);
        }

        // Erro — tenta identificar campos inválidos para uma retry limpa.
        const msg =
            (payload && (payload.error || payload.message)) ||
            text.slice(0, 300) ||
            `HTTP ${res.status}`;
        lastError = typeof msg === 'string' ? msg : JSON.stringify(msg);

        const invalid = [];
        if (typeof lastError === 'string') {
            for (const field of fields) {
                if (lastError.includes(field)) invalid.push(field);
            }
        }
        if (res.status === 400 && invalid.length && fields.length > invalid.length) {
            fields = fields.filter((f) => !invalid.includes(f));
            continue;
        }

        const err = new Error(lastError);
        err.status = res.status;
        if (res.status === 403 || /api key/i.test(lastError)) {
            err.invalidKey = true;
        }
        throw err;
    }
    throw lastError instanceof Error
        ? lastError
        : new Error(String(lastError));
}

// --- Supabase (REST/PostgREST, sem dependências) ------------------------------

function supabaseHeaders(serviceRoleKey, extra = {}) {
    return {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        ...extra,
    };
}

function requireSupabase(config) {
    if (!config.supabaseUrl || !config.serviceRoleKey) {
        throw new Error(
            'Credenciais do Supabase ausentes (PUBLIC_SUPABASE_URL / service_role)'
        );
    }
    if (!/supabase\.co\/?$/.test(config.supabaseUrl.replace(/^https?:\/\//, ''))) {
        // aceita project ref direto também
        if (!/^[a-z0-9]{20,}$/.test(config.supabaseUrl)) {
            throw new Error('PUBLIC_SUPABASE_URL em formato inesperado');
        }
    }
}

/** Deleta o intervalo [from, to] e insere as linhas normalizadas. */
export async function replaceRangeInSupabase({
    config,
    rows,
    from,
    to,
    dryRun = false,
    batchSize = 500,
}) {
    requireSupabase(config);
    const base = `${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/${SUPABASE_TABLE}`;

    const valid = rows.filter((r) => r.date && r.date >= from && r.date <= to);

    // Dedup por grain — mantém a última ocorrência (mais recente na resposta).
    const byKey = new Map();
    for (const row of valid) byKey.set(rowKey(row), row);
    const deduped = [...byKey.values()];

    if (dryRun) {
        return { deleted: 0, inserted: 0, wouldDelete: true, rows: deduped.length };
    }

    // DELETE do período (conta via content-range com Prefer: count=exact).
    const rangeFilter = `date=gte.${from}&date=lte.${to}`;
    const delRes = await fetch(
        `${base}?${rangeFilter}`,
        {
            method: 'DELETE',
            headers: supabaseHeaders(config.serviceRoleKey, {
                Prefer: 'count=exact',
            }),
        }
    );
    if (!delRes.ok) {
        const body = await delRes.text();
        throw new Error(
            `Falha ao limpar período no Supabase (HTTP ${delRes.status}): ${body.slice(0, 200)}`
        );
    }
    const contentRange = delRes.headers.get('content-range') || '';
    const deleted = Number((contentRange.match(/\/(\d+)/) || [])[1] || 0);

    let inserted = 0;
    for (let i = 0; i < deduped.length; i += batchSize) {
        const batch = deduped.slice(i, i + batchSize);
        const insRes = await fetch(base, {
            method: 'POST',
            headers: supabaseHeaders(config.serviceRoleKey, {
                Prefer: 'return=minimal',
            }),
            body: JSON.stringify(batch),
        });
        if (!insRes.ok) {
            const body = await insRes.text();
            throw new Error(
                `Falha ao inserir no Supabase (HTTP ${insRes.status}): ${body.slice(0, 300)}`
            );
        }
        inserted += batch.length;
    }

    return { deleted, inserted, rows: deduped.length };
}

function summarizeRows(rows) {
    const sum = (f) => rows.reduce((acc, r) => acc + (Number(r[f]) || 0), 0);
    const days = new Set(rows.map((r) => r.date));
    const campaigns = new Set(rows.map((r) => r.campaign_id).filter(Boolean));
    const ads = new Set(rows.map((r) => r.ad_id).filter(Boolean));
    return {
        rows: rows.length,
        days: days.size,
        campaigns: campaigns.size,
        ads: ads.size,
        spend: Number(sum('spend').toFixed(2)),
        impressions: Math.round(sum('impressions')),
        clicks: Math.round(sum('clicks')),
    };
}

/**
 * Pipeline completo: janela → fetch Windsor → replace no Supabase.
 * Retorna resumo para log/resposta de API.
 */
export async function syncMarketingPerformance(opts = {}) {
    const config = { ...windsorConfigFromEnv(), ...(opts.config || {}) };
    if (!config.apiKey) {
        const err = new Error('WINDSOR_API_KEY não configurada');
        err.config = true;
        throw err;
    }

    const { from, to } = resolveWindow(opts);
    const rows = await fetchWindsorWindow({
        apiKey: config.apiKey,
        from,
        to,
        timeoutMs: opts.timeoutMs,
    });

    const summary = summarizeRows(rows);
    const write = await replaceRangeInSupabase({
        config,
        rows,
        from,
        to,
        dryRun: opts.dryRun,
    });

    return {
        window: { from, to },
        fetched: summary,
        written: write,
        at: new Date().toISOString(),
    };
}

/**
 * Valida o caminho de gravação no Supabase SEM depender do Windsor:
 * insere uma linha sintética em data futura isolada, lê de volta e apaga.
 */
export async function selftestSupabase(configOverride = {}) {
    const config = { ...windsorConfigFromEnv(), ...configOverride };
    requireSupabase(config);
    const base = `${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/${SUPABASE_TABLE}`;

    const probe = {
        date: '2099-12-31',
        datasource: '_selftest',
        source: '_selftest',
        campaign: '_selftest',
        spend: 0,
    };
    const filter = 'date=eq.2099-12-31&datasource=eq._selftest';

    await fetch(`${base}?${filter}`, {
        method: 'DELETE',
        headers: supabaseHeaders(config.serviceRoleKey),
    });

    const ins = await fetch(base, {
        method: 'POST',
        headers: supabaseHeaders(config.serviceRoleKey, { Prefer: 'return=minimal' }),
        body: JSON.stringify(probe),
    });
    if (!ins.ok) throw new Error(`insert falhou (HTTP ${ins.status}): ${(await ins.text()).slice(0, 200)}`);

    const sel = await fetch(`${base}?${filter}&select=date,datasource,spend`, {
        headers: supabaseHeaders(config.serviceRoleKey),
    });
    if (!sel.ok) throw new Error(`select falhou (HTTP ${sel.status})`);
    const found = await sel.json();
    if (!Array.isArray(found) || found.length !== 1) {
        throw new Error(`read-back inesperado: ${JSON.stringify(found).slice(0, 200)}`);
    }

    const del = await fetch(`${base}?${filter}`, {
        method: 'DELETE',
        headers: supabaseHeaders(config.serviceRoleKey, { Prefer: 'count=exact' }),
    });
    if (!del.ok) throw new Error(`delete falhou (HTTP ${del.status})`);

    return { insert: true, readBack: true, cleanup: true };
}
