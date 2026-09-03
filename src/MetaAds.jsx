import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    DollarSign,
    CircleDollarSign,
    Users,
    Target,
    MousePointerClick,
    Percent,
    Eye,
    BarChart3,
    Search,
    RefreshCw,
    Inbox,
    X,
    AlertCircle,
    CalendarDays,
    Info,
    ExternalLink,
} from 'lucide-react';
import usePageTitle from './lib/usePageTitle';

// =============================================================================
//  /meta-ads — Dashboard de mídia paga (Meta Ads via Windsor.ai → Supabase).
//
//  Lê a tabela "marketing_performance" (fato anúncio × dia, gravada pelo
//  Windsor) através de /api/marketing (serverless, service_role — o RLS
//  bloqueia a leitura direta pelo browser) e cruza com os leads do CRM
//  (/api/leads, tabela "leads") para calcular CPL. Granularidades: campanha,
//  conjunto e anúncio. Runbook: Docs/Tecnico/integracao_windsor.md
// =============================================================================

// --- Utilitários -------------------------------------------------------------

const dateOnly = (value) => String(value || '').slice(0, 10);

const fmtBRL = (value) =>
    Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtInt = (value) => Math.round(Number(value || 0)).toLocaleString('pt-BR');

const fmtPct = (value) =>
    Number(value || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }) + '%';

const fmtNum = (value, decimals = 2) =>
    Number(value || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });

// Chave de casamento entre a campanha (Windsor) e o utm_campaign dos leads.
// Os anúncios desta operação usam o ID da campanha como utm_campaign (ex.:
// 120248846128830407), então casamos por campaign_id OU pelo nome normalizado.
const campaignKey = (name) => String(name || '').trim().toLowerCase();
// Chave agressiva (só alfanuméricos) para casar slugs com nomes de campanha:
// "[Conversao][Meteorico Set-26]" ↔ "conversao-meteorico-set-26".
const slugKey = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const dayKeyLocal = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDays = (dateStr, days) => {
    const d = new Date(`${dateStr}T12:00:00`);
    d.setDate(d.getDate() + days);
    return dayKeyLocal(d);
};

// --- Componentes internos ----------------------------------------------------

// Aceita número (formata pt-BR) ou string já formatada (ex.: "R$ 1.234,50").
const MetricCard = ({ title, value, hint, icon: Icon, accent }) => (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex justify-between items-start mb-2">
            <span className="text-gray-400 text-sm">{title}</span>
            <Icon className={`w-6 h-6 ${accent}`} />
        </div>
        <div className="text-3xl font-bold text-white truncate" title={typeof value === 'string' ? value : undefined}>
            {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
        </div>
        {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
);

const Chip = ({ label, value }) => (
    <div className="flex items-baseline gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
        <span className="text-gray-400">{label}</span>
        <span className="font-semibold text-gray-200">{value}</span>
    </div>
);

const PERIOD_PRESETS = [
    { id: 'all', label: 'Tudo' },
    { id: 'today', label: 'Hoje' },
    { id: '7', label: '7 dias' },
    { id: '14', label: '14 dias' },
    { id: '30', label: '30 dias' },
];

// Atalhos para o Gerenciador de Anúncios da Meta (abrem em nova aba),
// já filtrados pela campanha ativa da Autoescola Habilitar.
const META_ADS_LINKS = [
    {
        label: 'Campanha',
        url: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=372479995297951&business_id=130028894831471&global_scope_id=130028894831471&columns=name%2Cdelivery%2Crecommendations_guidance%2Cresults%2Ccost_per_result%2Cbudget%2Cspend%2Cimpressions%2Creach%2Cactions%3Aonsite_conversion.total_messaging_connection%2Cactions%3Aonsite_conversion.messaging_first_reply%2Cactions%3Aomni_purchase%2Cschedule%2Cend_time%2Cattribution_setting%2Cbid%2Clast_significant_edit%2Cquality_score_organic%2Cquality_score_ectr%2Cquality_score_ecvr%2Ccampaign_name%2Ccost_per_action_type%3Aomni_purchase&attribution_windows=default&date=2023-12-18_2026-09-02%2Cmaximum&comparison_date=&insights_date=2023-12-18_2026-09-02%2Cmaximum&insights_comparison_date=&filter_set=CAMPAIGN_GROUP_SELECTED-STRING_SET%1EIN%1E[%22120248846128830407%22]&selected_campaign_ids=120248846128830407',
    },
    {
        label: 'Conjunto',
        url: 'https://adsmanager.facebook.com/adsmanager/manage/adsets?act=372479995297951&business_id=130028894831471&global_scope_id=130028894831471&columns=name%2Cdelivery%2Crecommendations_guidance%2Cresults%2Ccost_per_result%2Cbudget%2Cspend%2Cimpressions%2Creach%2Cactions%3Aonsite_conversion.total_messaging_connection%2Cactions%3Aonsite_conversion.messaging_first_reply%2Cactions%3Aomni_purchase%2Cschedule%2Cend_time%2Cattribution_setting%2Cbid%2Clast_significant_edit%2Cquality_score_organic%2Cquality_score_ectr%2Cquality_score_ecvr%2Ccampaign_name%2Ccost_per_action_type%3Aomni_purchase&attribution_windows=default&date=2023-12-18_2026-09-02%2Cmaximum&insights_date=2023-12-18_2026-09-02%2Cmaximum&filter_set=CAMPAIGN_GROUP_SELECTED-STRING_SET%1EIN%1E[%22120248846128830407%22]&selected_campaign_ids=120248846128830407',
    },
    {
        label: 'Anúncio',
        url: 'https://adsmanager.facebook.com/adsmanager/manage/ads?act=372479995297951&business_id=130028894831471&global_scope_id=130028894831471&columns=name%2Cdelivery%2Crecommendations_guidance%2Cresults%2Ccost_per_result%2Cbudget%2Cspend%2Cimpressions%2Creach%2Cactions%3Aonsite_conversion.total_messaging_connection%2Cactions%3Aonsite_conversion.messaging_first_reply%2Cactions%3Aomni_purchase%2Cschedule%2Cend_time%2Cattribution_setting%2Cbid%2Clast_significant_edit%2Cquality_score_organic%2Cquality_score_ectr%2Cquality_score_ecvr%2Ccampaign_name%2Ccost_per_action_type%3Aomni_purchase&attribution_windows=default&date=2023-12-18_2026-09-02%2Cmaximum&insights_date=2023-12-18_2026-09-02%2Cmaximum&filter_set=CAMPAIGN_GROUP_SELECTED-STRING_SET%1EIN%1E[%22120248846128830407%22]&selected_campaign_ids=120248846128830407&selected_adset_ids=120248846626200407%2C120248846618430407%2C120248846513220407%2C120248846501130407%2C120248846378430407%2C120248846331900407%2C120248846128840407',
    },
];

// --- Página ------------------------------------------------------------------

function MetaAdsPage() {
    usePageTitle('Meta Ads');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const [leads, setLeads] = useState([]);
    const [leadsError, setLeadsError] = useState(null);

    const [preset, setPreset] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [tab, setTab] = useState('campanha');

    const flashTimer = useRef(null);

    // Dado de mídia muda 1×/dia: carrega no mount, ao voltar para a aba e no
    // refresh manual (sem polling curto). O refresh manual repuxa o dia
    // corrente do Windsor (?sync=1 — o endpoint faz throttle de 10 min).
    const load = useCallback(async (withSync = false) => {
        setSyncing(true);
        try {
            const [mediaResp, leadsResp] = await Promise.all([
                fetch(`/api/marketing${withSync ? '?sync=1' : ''}`, { headers: { Accept: 'application/json' } }),
                fetch('/api/leads', { headers: { Accept: 'application/json' } }),
            ]);
            if (!mediaResp.ok) throw new Error(`HTTP ${mediaResp.status}`);
            const mediaJson = await mediaResp.json();
            setRows(Array.isArray(mediaJson.rows) ? mediaJson.rows : []);
            setError(null);
            setLastUpdated(new Date());
            try {
                const leadsJson = await leadsResp.json();
                setLeads(Array.isArray(leadsJson.leads) ? leadsJson.leads : []);
                setLeadsError(null);
            } catch {
                setLeadsError('Leads do CRM indisponíveis — CPL médio parcial.');
            }
        } catch {
            setError('Sem dados de mídia — a tabela marketing_performance ainda não existe ou o Windsor ainda não sincronizou.');
        } finally {
            setSyncing(false);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const onVisible = () => {
            if (!document.hidden) load();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            if (flashTimer.current) clearTimeout(flashTimer.current);
        };
    }, [load]);

    const applyPreset = (id) => {
        setPreset(id);
        const today = dayKeyLocal(new Date());
        if (id === 'all') {
            setDateFrom('');
            setDateTo('');
        } else if (id === 'today') {
            setDateFrom(today);
            setDateTo(today);
        } else {
            setDateFrom(addDays(today, -(Number(id) - 1)));
            setDateTo(today);
        }
    };

    // --- Dados dentro do período selecionado ---

    const rowsInPeriod = useMemo(() => {
        if (!dateFrom && !dateTo) return rows;
        return rows.filter((row) => {
            const d = dateOnly(row.date);
            if (!d) return false;
            if (dateFrom && d < dateFrom) return false;
            if (dateTo && d > dateTo) return false;
            return true;
        });
    }, [rows, dateFrom, dateTo]);

    const leadsInPeriod = useMemo(() => {
        if (!dateFrom && !dateTo) return leads;
        return leads.filter((lead) => {
            const d = dateOnly(lead.created_at);
            if (!d) return false;
            if (dateFrom && d < dateFrom) return false;
            if (dateTo && d > dateTo) return false;
            return true;
        });
    }, [leads, dateFrom, dateTo]);

    const sum = (list, field) =>
        list.reduce((acc, row) => acc + (Number(row[field]) || 0), 0);

    // --- KPIs do período ---

    const totals = useMemo(() => {
        const spend = sum(rowsInPeriod, 'spend');
        const impressions = sum(rowsInPeriod, 'impressions');
        const reach = sum(rowsInPeriod, 'reach');
        const clicks = sum(rowsInPeriod, 'clicks');
        const messaging = sum(rowsInPeriod, 'actions_onsite_conversion_total_messaging_connection');
        const firstReply = sum(rowsInPeriod, 'actions_onsite_conversion_messaging_first_reply');
        const leadsCount = leadsInPeriod.length;
        return {
            spend,
            impressions,
            reach,
            clicks,
            leadsCount,
            messaging,
            firstReply,
            linkClicks: sum(rowsInPeriod, 'inline_link_clicks'),
            engagement: sum(rowsInPeriod, 'actions_post_engagement'),
            ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
            cpc: clicks > 0 ? spend / clicks : null,
            cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
            cpl: leadsCount > 0 && spend > 0 ? spend / leadsCount : null,
            frequency: reach > 0 ? impressions / reach : null,
            landingViews: sum(rowsInPeriod, 'actions_landing_page_view'),
            leadsMeta: sum(rowsInPeriod, 'actions_lead'),
            registrations: sum(rowsInPeriod, 'actions_complete_registration'),
            costPerConversation: messaging > 0 ? spend / messaging : null,
            costPerReply: firstReply > 0 ? spend / firstReply : null,
        };
    }, [rowsInPeriod, leadsInPeriod]);

    // --- Séries diárias (investimento × leads) ---

    const daily = useMemo(() => {
        const byDay = new Map();
        rowsInPeriod.forEach((row) => {
            const d = dateOnly(row.date);
            if (!d) return;
            const entry = byDay.get(d) || { date: d, spend: 0, clicks: 0 };
            entry.spend += Number(row.spend) || 0;
            entry.clicks += Number(row.clicks) || 0;
            byDay.set(d, entry);
        });
        const leadsByDay = new Map();
        leadsInPeriod.forEach((lead) => {
            const d = dateOnly(lead.created_at);
            if (d) leadsByDay.set(d, (leadsByDay.get(d) || 0) + 1);
        });
        const days = [...new Set([...byDay.keys(), ...leadsByDay.keys()])].sort();
        const buckets = days.map((d) => ({
            date: d,
            spend: byDay.get(d)?.spend || 0,
            leads: leadsByDay.get(d) || 0,
        }));
        return {
            buckets,
            maxSpend: Math.max(1, ...buckets.map((b) => b.spend)),
            maxLeads: Math.max(1, ...buckets.map((b) => b.leads)),
        };
    }, [rowsInPeriod, leadsInPeriod]);

    // --- Agregações por nível (campanha / conjunto / anúncio) ---

    const aggregateBy = useCallback(
        (keyField, labelFields) => {
            const map = new Map();
            rowsInPeriod.forEach((row) => {
                const key = row[keyField];
                if (!key) return; // nível ausente (task do Windsor sem o campo)
                const entry = map.get(key) || {
                    key,
                    labels: labelFields.map((f) => row[f] || '—'),
                    // Copy do anúncio (nível anúncio; Windsor title/body) —
                    // primeiro valor não vazio do grupo.
                    copyTitle: '',
                    copyBody: '',
                    spend: 0,
                    impressions: 0,
                    reach: 0,
                    clicks: 0,
                    linkClicks: 0,
                    messaging: 0,
                    firstReply: 0,
                    leadsMeta: 0,
                    registrations: 0,
                };
                if (!entry.copyTitle && row.title) entry.copyTitle = row.title;
                if (!entry.copyBody && row.body) entry.copyBody = row.body;
                entry.spend += Number(row.spend) || 0;
                entry.impressions += Number(row.impressions) || 0;
                entry.reach += Number(row.reach) || 0;
                entry.clicks += Number(row.clicks) || 0;
                entry.linkClicks += Number(row.inline_link_clicks) || 0;
                entry.messaging += Number(row.actions_onsite_conversion_total_messaging_connection) || 0;
                entry.firstReply += Number(row.actions_onsite_conversion_messaging_first_reply) || 0;
                entry.leadsMeta += Number(row.actions_lead) || 0;
                entry.registrations += Number(row.actions_complete_registration) || 0;
                map.set(key, entry);
            });
            return [...map.values()].sort((a, b) => b.spend - a.spend);
        },
        [rowsInPeriod],
    );

    const leadsByCampaign = useMemo(() => {
        const map = new Map();
        leadsInPeriod.forEach((lead) => {
            const raw = String(lead.utm_campaign || '');
            if (!raw.trim()) return;
            // Registra sob as duas chaves: casamento por texto exato
            // (campaignKey) e por slug (slugKey) — a campanha consulta as que
            // souber (id, nome, slug) e pega o primeiro valor não vazio.
            for (const k of new Set([campaignKey(raw), slugKey(raw)])) {
                map.set(k, (map.get(k) || 0) + 1);
            }
        });
        return map;
    }, [leadsInPeriod]);

    const campaigns = useMemo(
        () =>
            aggregateBy('campaign_id', ['campaign']).map((entry) => ({
                ...entry,
                // Casa por campaign_id (utm_campaign dos anúncios), pelo nome
                // exato ou pelo slug do nome.
                leadsCrm:
                    leadsByCampaign.get(campaignKey(entry.key)) ||
                    leadsByCampaign.get(campaignKey(entry.labels[0])) ||
                    leadsByCampaign.get(slugKey(entry.labels[0])) ||
                    0,
            })),
        [aggregateBy, leadsByCampaign],
    );
    const adsets = useMemo(() => aggregateBy('adset_id', ['adset_name', 'campaign']), [aggregateBy]);
    const ads = useMemo(() => aggregateBy('ad_id', ['ad_name', 'adset_name', 'campaign']), [aggregateBy]);

    const matchedCampaignLeads = campaigns.reduce((acc, c) => acc + c.leadsCrm, 0);

    // Colunas da tabela por nível.
    const tabs = [
        { id: 'campanha', label: 'Campanhas', data: campaigns, empty: 'Nenhuma campanha no período.' },
        {
            id: 'conjunto',
            label: 'Conjuntos',
            data: adsets,
            empty: 'Sem dados de conjunto — a task do Windsor precisa incluir os campos adset_id/adset_name.',
        },
        {
            id: 'anuncio',
            label: 'Anúncios',
            data: ads,
            empty: 'Sem dados de anúncio — a task do Windsor precisa incluir os campos ad_id/ad_name.',
        },
    ];
    const activeTab = tabs.find((t) => t.id === tab) || tabs[0];
    const hasLevelData = activeTab.data.length > 0;

    const renderDailyBar = (bucket, value, max, formatValue, highlightToday) => {
        const height = value > 0 ? Math.max(6, (value / max) * 100) : 2;
        const [y, m, d] = bucket.date.split('-');
        const label = `${d}/${m}`;
        return (
            <div
                key={bucket.date}
                className="flex-1 h-full flex flex-col items-center justify-end gap-1 group min-w-[6px]"
                title={`${d}/${m}/${y}: ${formatValue(value)} · ${bucket.leads} lead${bucket.leads === 1 ? '' : 's'}`}
            >
                <div
                    className={`w-full rounded-t transition-colors ${
                        highlightToday
                            ? 'bg-habilitar-orange'
                            : 'bg-habilitar-orange/40 group-hover:bg-habilitar-orange/80'
                    }`}
                    style={{ height: `${height}%` }}
                />
                <span className={`text-[10px] ${highlightToday ? 'text-gray-300 font-semibold' : 'text-gray-500'}`}>
                    {label}
                </span>
            </div>
        );
    };

    const todayKey = dayKeyLocal(new Date());
    const rangeLabel = daily.buckets.length > 0
        ? `${daily.buckets[0].date.split('-').reverse().join('/')} – ${daily.buckets[daily.buckets.length - 1].date.split('-').reverse().join('/')}`
        : '';

    // Funil do período: mídia → site → WhatsApp → formulário (valores absolutos).
    const funnel = [
        { label: 'Impressões', value: totals.impressions },
        { label: 'Alcance (pessoas)', value: totals.reach },
        { label: 'Cliques (todos)', value: totals.clicks },
        { label: 'Cliques em link', value: totals.linkClicks },
        { label: 'Views da página', value: totals.landingViews },
        { label: 'Conversas WhatsApp', value: totals.messaging },
        { label: 'Respostas no WhatsApp', value: totals.firstReply },
        { label: 'Leads (formulário)', value: totals.leadsCount },
    ];
    const funnelMax = Math.max(1, ...funnel.map((s) => s.value));

    return (
        <div className="min-h-screen bg-gray-900 text-white font-sans">
            {/* Header */}
            <header className="border-b border-gray-800 bg-gray-900/95 backdrop-blur sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center gap-3">
                    <img
                        src="/assets/images/logo-autoescola-habilitar.webp"
                        alt="Autoescola Habilitar"
                        className="h-10"
                    />
                    <div>
                        <h1 className="text-lg font-bold leading-tight">Mídia · Meta Ads</h1>
                        <p className="text-xs text-gray-400">
                            Windsor.ai → Supabase · atualizado {lastUpdated ? lastUpdated.toLocaleTimeString('pt-BR') : '…'}
                        </p>
                    </div>

                    <div className="ml-auto flex items-center gap-3">
                        {error ? (
                            <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-full px-3 py-1">
                                <AlertCircle className="w-3.5 h-3.5" />
                                Sem dados
                            </span>
                        ) : (
                            <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded-full px-3 py-1">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                                </span>
                                {rows.length > 0 ? `${fmtInt(rows.length)} linhas` : 'Ao vivo'}
                            </span>
                        )}
                        <a
                            href="/criativos"
                            title="Biblioteca de criativos para o gestor de tráfego"
                            className="hidden sm:flex items-center h-9 px-3 rounded-lg border border-gray-600 bg-gray-700 text-xs text-gray-300 hover:text-white hover:border-gray-500 transition"
                        >
                            Criativos
                        </a>
                        <button
                            type="button"
                            onClick={() => load(true)}
                            title="Atualizar agora (repuxa o dia de hoje do Windsor)"
                            className="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition"
                        >
                            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
                {error && !loading && rows.length === 0 ? (
                    <div className="bg-yellow-500/10 border border-yellow-500/40 text-yellow-300 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <span>
                            {error} Configure a destination task no Windsor (table name{' '}
                            <code className="text-yellow-200">marketing_performance</code>) — ver{' '}
                            <code className="text-yellow-200">Docs/Tecnico/integracao_windsor.md</code>.
                        </span>
                    </div>
                ) : null}
                {leadsError && (
                    <div className="bg-yellow-500/10 border border-yellow-500/40 text-yellow-300 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        {leadsError}
                    </div>
                )}

                {/* Período */}
                <section className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {PERIOD_PRESETS.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => applyPreset(p.id)}
                                className={`h-10 px-3 rounded-lg border text-sm transition ${
                                    preset === p.id && !((dateFrom || dateTo) && preset === 'all')
                                        ? 'border-habilitar-orange bg-habilitar-orange/10 text-white'
                                        : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 h-10 px-3 rounded-lg border border-gray-600 bg-gray-700 text-sm">
                        <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
                        <input
                            type="date"
                            value={dateFrom}
                            max={dateTo || undefined}
                            onChange={(e) => {
                                setDateFrom(e.target.value);
                                setPreset('custom');
                            }}
                            onClick={(e) => {
                                try { e.currentTarget.showPicker(); } catch { /* navegador sem suporte */ }
                            }}
                            aria-label="Data inicial"
                            title="Data inicial"
                            className="bg-transparent text-white placeholder-gray-500 [color-scheme:dark] focus:outline-none cursor-pointer"
                        />
                        <span className="text-gray-500">—</span>
                        <input
                            type="date"
                            value={dateTo}
                            min={dateFrom || undefined}
                            onChange={(e) => {
                                setDateTo(e.target.value);
                                setPreset('custom');
                            }}
                            onClick={(e) => {
                                try { e.currentTarget.showPicker(); } catch { /* navegador sem suporte */ }
                            }}
                            aria-label="Data final"
                            title="Data final"
                            className="bg-transparent text-white placeholder-gray-500 [color-scheme:dark] focus:outline-none cursor-pointer"
                        />
                    </div>
                    {preset === 'custom' && (
                        <button
                            type="button"
                            onClick={() => applyPreset('all')}
                            className="flex items-center gap-1.5 h-10 px-3 rounded-lg border border-gray-600 text-sm text-gray-300 hover:text-white hover:border-gray-500 transition"
                        >
                            <X className="w-4 h-4" />
                            Limpar período
                        </button>
                    )}
                    <div className="ml-auto flex items-center gap-1.5">
                        <span className="text-xs text-gray-500 shrink-0">{rangeLabel}</span>
                        <span className="text-xs text-gray-400 shrink-0">Meta Ads:</span>
                        {META_ADS_LINKS.map(({ label, url }) => (
                            <a
                                key={label}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                title={`Abrir ${label} no Meta Ads`}
                                className="flex items-center gap-1.5 h-10 px-3 rounded-lg border border-blue-500/40 bg-blue-600/10 text-blue-300 text-sm hover:bg-blue-600/25 hover:text-blue-200 transition shrink-0"
                            >
                                <ExternalLink className="w-4 h-4" />
                                {label}
                            </a>
                        ))}
                    </div>
                </section>

                {/* KPIs principais */}
                <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard title="Investimento" value={fmtBRL(totals.spend)} icon={DollarSign} accent="text-yellow-400" />
                    <MetricCard title="Leads (CRM)" value={totals.leadsCount} hint="tabela leads · formulário" icon={Users} accent="text-blue-400" />
                    <MetricCard title="CPL médio" value={totals.cpl != null ? fmtBRL(totals.cpl) : '—'} hint="investimento ÷ leads do período" icon={Target} accent="text-green-400" />
                    <MetricCard title="Cliques" value={fmtInt(totals.clicks)} icon={MousePointerClick} accent="text-purple-400" />
                    <MetricCard title="CTR" value={totals.ctr != null ? fmtPct(totals.ctr) : '—'} hint="cliques ÷ impressões" icon={Percent} accent="text-pink-400" />
                    <MetricCard title="CPC" value={totals.cpc != null ? fmtBRL(totals.cpc) : '—'} icon={CircleDollarSign} accent="text-orange-400" />
                    <MetricCard title="CPM" value={totals.cpm != null ? fmtBRL(totals.cpm) : '—'} icon={Eye} accent="text-cyan-400" />
                    <MetricCard title="Impressões" value={fmtInt(totals.impressions)} icon={BarChart3} accent="text-red-400" />
                </section>

                {/* Métricas complementares */}
                <section className="flex flex-wrap gap-2">
                    <Chip label="Alcance" value={fmtInt(totals.reach)} />
                    <Chip label="Frequência" value={totals.frequency != null ? fmtNum(totals.frequency) : '—'} />
                    <Chip label="Cliques em link" value={fmtInt(totals.linkClicks)} />
                    <Chip label="Engajamento" value={fmtInt(totals.engagement)} />
                    <Chip label="Views de página" value={fmtInt(totals.landingViews)} />
                    <Chip label="Leads (Meta)" value={fmtInt(totals.leadsMeta)} />
                    <Chip label="Cadastros (pixel)" value={fmtInt(totals.registrations)} />
                    <Chip
                        label="Custo/conversa"
                        value={totals.costPerConversation != null ? fmtBRL(totals.costPerConversation) : '—'}
                    />
                    <Chip
                        label="Custo/resposta"
                        value={totals.costPerReply != null ? fmtBRL(totals.costPerReply) : '—'}
                    />
                </section>

                {/* Funil do período: mídia → site → WhatsApp → formulário */}
                <section className="bg-gray-800 rounded-xl border border-gray-700 p-5">
                    <h2 className="text-sm font-semibold text-gray-300 mb-1">
                        Funil do período
                        {rangeLabel && <span className="text-gray-500 font-normal">{' · '}{rangeLabel}</span>}
                    </h2>
                    <p className="text-xs text-gray-500 mb-4">
                        Percentual = conversão em relação à etapa anterior · leads (formulário) vêm do CRM
                    </p>
                    <div className="space-y-2.5">
                        {funnel.map((step, i) => {
                            const prev = i > 0 ? funnel[i - 1].value : null;
                            const pct = prev > 0 ? (step.value / prev) * 100 : null;
                            const width = Math.max(2, Math.pow(step.value / funnelMax, 0.35) * 100);
                            return (
                                <div key={step.label} className="flex items-center gap-3">
                                    <span className="w-44 shrink-0 text-xs text-gray-400 text-right truncate" title={step.label}>
                                        {step.label}
                                    </span>
                                    <div className="flex-1 h-8 rounded-md bg-gray-900/60 border border-gray-700 overflow-hidden">
                                        <div
                                            className={`h-full rounded-md flex items-center px-3 transition-all ${
                                                i === funnel.length - 1
                                                    ? 'bg-green-500/80'
                                                    : 'bg-habilitar-orange/60'
                                            }`}
                                            style={{ width: `${width}%` }}
                                        >
                                            <span className="text-xs font-semibold text-gray-100 whitespace-nowrap">
                                                {fmtInt(step.value)}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="w-16 shrink-0 text-xs text-gray-500 text-right">
                                        {pct != null ? fmtPct(pct) : '—'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* Gráficos por dia */}
                <section className="grid lg:grid-cols-5 gap-4">
                    <div className="lg:col-span-3 bg-gray-800 rounded-xl border border-gray-700 p-5">
                        <h2 className="text-sm font-semibold text-gray-300 mb-4">
                            Investimento por dia {rangeLabel && <span className="text-gray-500 font-normal">{' · '}{rangeLabel}</span>}
                        </h2>
                        {loading && rows.length === 0 ? (
                            <div className="h-44 rounded bg-gray-700/50 animate-pulse" />
                        ) : daily.buckets.length === 0 ? (
                            <p className="text-sm text-gray-500">Sem dados de mídia no período.</p>
                        ) : (
                            <div className="flex items-end gap-1.5 h-44">
                                {daily.buckets.map((b) =>
                                    renderDailyBar(b, b.spend, daily.maxSpend, (v) => fmtBRL(v), b.date === todayKey),
                                )}
                            </div>
                        )}
                    </div>

                    <div className="lg:col-span-2 bg-gray-800 rounded-xl border border-gray-700 p-5">
                        <h2 className="text-sm font-semibold text-gray-300 mb-4">Leads por dia (CRM)</h2>
                        {loading && rows.length === 0 ? (
                            <div className="h-44 rounded bg-gray-700/50 animate-pulse" />
                        ) : daily.buckets.length === 0 ? (
                            <p className="text-sm text-gray-500">Sem leads no período.</p>
                        ) : (
                            <div className="flex items-end gap-1.5 h-44">
                                {daily.buckets.map((b) =>
                                    renderDailyBar(b, b.leads, daily.maxLeads, (v) => `${v} lead${v === 1 ? '' : 's'}`, b.date === todayKey),
                                )}
                            </div>
                        )}
                    </div>
                </section>

                {/* Tabelas por nível */}
                <section className="bg-gray-800 rounded-xl border border-gray-700">
                    <div className="p-4 border-b border-gray-700 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                            {tabs.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setTab(t.id)}
                                    className={`h-9 px-3 rounded-lg text-sm font-medium transition ${
                                        tab === t.id
                                            ? 'bg-habilitar-orange/20 text-white border border-habilitar-orange/50'
                                            : 'text-gray-400 hover:text-white border border-transparent'
                                    }`}
                                >
                                    {t.label}
                                    {t.data.length > 0 && (
                                        <span className="ml-1.5 text-xs text-gray-500 bg-gray-700 rounded-full px-1.5 py-0.5">
                                            {t.data.length}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                        {tab === 'campanha' && campaigns.length > 0 && matchedCampaignLeads === 0 && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                                <Info className="w-3.5 h-3.5" />
                                Nenhuma campanha casa com o utm_campaign dos leads — o CPL por campanha fica
                                indisponível (o CPL médio acima sempre vale).
                            </span>
                        )}
                    </div>

                    {loading && rows.length === 0 ? (
                        <div className="p-4 space-y-2">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="h-10 rounded bg-gray-700 animate-pulse" />
                            ))}
                        </div>
                    ) : !hasLevelData ? (
                        <div className="py-14 text-center">
                            <Inbox className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                            <p className="text-gray-400 text-sm">{activeTab.empty}</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-700">
                                        <th className="px-4 py-3 font-medium">{tab === 'campanha' ? 'Campanha' : tab === 'conjunto' ? 'Conjunto' : 'Anúncio'}</th>
                                        {tab !== 'campanha' && <th className="px-4 py-3 font-medium">{tab === 'conjunto' ? 'Campanha' : 'Conjunto'}</th>}
                                        {tab === 'anuncio' && <th className="px-4 py-3 font-medium">Copy</th>}
                                        <th className="px-4 py-3 font-medium text-right">Invest.</th>
                                        <th className="px-4 py-3 font-medium text-right">Impr.</th>
                                        <th className="px-4 py-3 font-medium text-right">Alcance</th>
                                        <th className="px-4 py-3 font-medium text-right">Cliques</th>
                                        <th className="px-4 py-3 font-medium text-right">CTR</th>
                                        <th className="px-4 py-3 font-medium text-right">CPC</th>
                                        <th className="px-4 py-3 font-medium text-right">CPM</th>
                                        <th className="px-4 py-3 font-medium text-right">Conversas</th>
                                        <th className="px-4 py-3 font-medium text-right">Custo/conversa</th>
                                        <th className="px-4 py-3 font-medium text-right">Leads CRM</th>
                                        <th className="px-4 py-3 font-medium text-right">CPL</th>
                                        <th className="px-4 py-3 font-medium text-right">Leads Meta</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeTab.data.map((entry) => {
                                        const ctr = entry.impressions > 0 ? (entry.clicks / entry.impressions) * 100 : null;
                                        const cpc = entry.clicks > 0 ? entry.spend / entry.clicks : null;
                                        const cpm = entry.impressions > 0 ? (entry.spend / entry.impressions) * 1000 : null;
                                        const cpl = entry.leadsCrm > 0 ? entry.spend / entry.leadsCrm : null;
                                        const costPerConversation = entry.messaging > 0 ? entry.spend / entry.messaging : null;
                                        const [primary, secondary] = entry.labels;
                                        return (
                                            <tr key={entry.key} className="border-b border-gray-800 hover:bg-gray-700/40 transition-colors">
                                                <td className="px-4 py-3 font-medium text-white max-w-[300px] truncate" title={primary}>
                                                    {primary}
                                                </td>
                                                {tab !== 'campanha' && (
                                                    <td className="px-4 py-3 text-gray-300 max-w-[220px] truncate" title={secondary}>
                                                        {secondary}
                                                    </td>
                                                )}
                                                {tab === 'anuncio' && (
                                                    <td
                                                        className="px-4 py-3 text-gray-300 max-w-[260px] truncate"
                                                        title={entry.copyBody ? `${entry.copyTitle || ''}\n\n${entry.copyBody}`.trim() : entry.copyTitle || ''}
                                                    >
                                                        {entry.copyTitle || (entry.copyBody ? entry.copyBody.slice(0, 80) : '—')}
                                                    </td>
                                                )}
                                                <td className="px-4 py-3 text-right text-gray-100 whitespace-nowrap font-semibold">{fmtBRL(entry.spend)}</td>
                                                <td className="px-4 py-3 text-right text-gray-300 whitespace-nowrap">{fmtInt(entry.impressions)}</td>
                                                <td className="px-4 py-3 text-right text-gray-300 whitespace-nowrap">{fmtInt(entry.reach)}</td>
                                                <td className="px-4 py-3 text-right text-gray-300 whitespace-nowrap">{fmtInt(entry.clicks)}</td>
                                                <td className="px-4 py-3 text-right text-gray-300 whitespace-nowrap">{ctr != null ? fmtPct(ctr) : '—'}</td>
                                                <td className="px-4 py-3 text-right text-gray-300 whitespace-nowrap">{cpc != null ? fmtBRL(cpc) : '—'}</td>
                                                <td className="px-4 py-3 text-right text-gray-300 whitespace-nowrap">{cpm != null ? fmtBRL(cpm) : '—'}</td>
                                                <td className="px-4 py-3 text-right text-gray-300 whitespace-nowrap">{fmtInt(entry.messaging)}</td>
                                                <td className="px-4 py-3 text-right text-gray-300 whitespace-nowrap">
                                                    {costPerConversation != null ? fmtBRL(costPerConversation) : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-right text-gray-300 whitespace-nowrap">
                                                    {tab === 'campanha' && entry.leadsCrm > 0 ? fmtInt(entry.leadsCrm) : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-habilitar-orange-light">
                                                    {cpl != null ? fmtBRL(cpl) : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-right text-gray-300 whitespace-nowrap">{fmtInt(entry.leadsMeta)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <p className="text-xs text-gray-600 text-center pb-4">
                    Fonte: Windsor.ai (conector Facebook Ads) → Supabase · tabela marketing_performance · CTR/CPC/CPM/CPL
                    calculados sobre o período selecionado. Leads CRM = tabela leads (formulário do site) · casados com a
                    campanha por campaign_id ou nome (utm_campaign). Conversas/respostas WhatsApp = eventos atribuídos pela Meta.
                </p>
            </main>
        </div>
    );
}

export default MetaAdsPage;
