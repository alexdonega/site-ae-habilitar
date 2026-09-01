import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    Users,
    CalendarDays,
    TrendingUp,
    BarChart3,
    Search,
    RefreshCw,
    Inbox,
    ChevronDown,
    X,
    MessageCircle,
    AlertCircle,
    Filter,
    ExternalLink,
} from 'lucide-react';

// =============================================================================
//  /dash — Dashboard pública de leads em tempo real (fonte: Supabase, tabela
//  "leads"). Os dados vêm do endpoint /api/leads (serverless, service_role),
//  porque o RLS da tabela bloqueia a leitura direta pelo browser. A página
//  faz polling a cada 10s e também ao voltar para a aba — novo lead aparece
//  sozinho, com aviso flutuante.
// =============================================================================

// --- Utilitários -------------------------------------------------------------

// "Pré-Matrícula CNH — Autoescola Habilitar (Moto [A])" -> "Moto [A]"
const parseProduto = (produto) => {
    if (!produto) return '—';
    const match = String(produto).match(/\(([^)]*)\)/);
    return match ? match[1].trim() : produto;
};

// "https://instagram.com/" -> "instagram.com"
const refHost = (referrer) => {
    if (!referrer) return '—';
    try {
        return new URL(referrer).hostname.replace(/^www\./, '');
    } catch {
        return referrer;
    }
};

// Coluna IG: hoje o valor vive em utm_source ("ig"); se a coluna ig for
// criada na tabela, ela passa a valer automaticamente.
const igValue = (lead) => lead.ig || lead.utm_source || '—';

const waLink = (whatsapp) => {
    const digits = String(whatsapp || '').replace(/\D/g, '');
    if (!digits) return null;
    return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}`;
};

const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const dayKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// --- Componentes internos ----------------------------------------------------

const MetricCard = ({ title, value, icon: Icon, accent }) => (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex justify-between items-start mb-2">
            <span className="text-gray-400 text-sm">{title}</span>
            <Icon className={`w-6 h-6 ${accent}`} />
        </div>
        <div className="text-3xl font-bold text-white">{value.toLocaleString('pt-BR')}</div>
    </div>
);

// Combobox com busca: botão abre popup com campo de pesquisa + opções únicas
// (com contagem) extraídas dos próprios dados.
function Combobox({ label, value, onChange, options }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onDocClick = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const filteredOptions = query.trim()
        ? options.filter(([v]) => v.toLowerCase().includes(query.trim().toLowerCase()))
        : options;

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => {
                    setOpen((o) => !o);
                    setQuery('');
                }}
                className={`flex items-center justify-between gap-2 h-10 px-3 rounded-lg border text-sm min-w-[160px] transition ${
                    value
                        ? 'border-habilitar-orange bg-habilitar-orange/10 text-white'
                        : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                }`}
            >
                <span className="truncate">
                    {value ? (
                        <>
                            <span className="text-gray-400">{label}: </span>
                            {value}
                        </>
                    ) : (
                        <span className="text-gray-400">{label}: todos</span>
                    )}
                </span>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute z-30 mt-1 w-64 max-w-[80vw] rounded-lg border border-gray-600 bg-gray-800 shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-gray-700">
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                autoFocus
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder={`Buscar em ${label.toLowerCase()}...`}
                                className="w-full h-9 pl-8 pr-3 rounded-md bg-gray-700 border border-gray-600 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-habilitar-orange"
                            />
                        </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto py-1">
                        <button
                            type="button"
                            onClick={() => {
                                onChange('');
                                setOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm ${
                                !value ? 'bg-habilitar-orange/20 text-white' : 'text-gray-300 hover:bg-gray-700'
                            }`}
                        >
                            Todos
                        </button>
                        {filteredOptions.map(([optionValue, count]) => (
                            <button
                                key={optionValue}
                                type="button"
                                onClick={() => {
                                    onChange(optionValue);
                                    setOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 ${
                                    value === optionValue
                                        ? 'bg-habilitar-orange/20 text-white'
                                        : 'text-gray-300 hover:bg-gray-700'
                                }`}
                            >
                                <span className="truncate">{optionValue}</span>
                                <span className="text-xs text-gray-400 bg-gray-700 rounded-full px-2 py-0.5 shrink-0">
                                    {count}
                                </span>
                            </button>
                        ))}
                        {filteredOptions.length === 0 && (
                            <p className="px-3 py-4 text-sm text-gray-500 text-center">Nada encontrado</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

const PAGE_SIZE = 100;

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

function DashPage() {
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [newCount, setNewCount] = useState(0);

    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState({ produto: '', referrer: '', ig: '', utm_medium: '' });
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [contatoFiltro, setContatoFiltro] = useState({ sim: false, nao: false });
    const [saveError, setSaveError] = useState(null);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    const prevTotal = useRef(0);
    const flashTimer = useRef(null);

    const load = useCallback(async () => {
        setSyncing(true);
        try {
            const resp = await fetch('/api/leads', { headers: { Accept: 'application/json' } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const json = await resp.json();
            const data = Array.isArray(json.leads) ? json.leads : [];
            setLeads(data);
            setLastUpdated(new Date());
            setError(null);

            const total = data.length;
            if (prevTotal.current && total > prevTotal.current) {
                setNewCount((n) => n + (total - prevTotal.current));
                if (flashTimer.current) clearTimeout(flashTimer.current);
                flashTimer.current = setTimeout(() => setNewCount(0), 6000);
            }
            prevTotal.current = total;
        } catch {
            setError('Não foi possível carregar os leads. Nova tentativa em instantes...');
        } finally {
            setSyncing(false);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const interval = setInterval(load, 10000);
        const onVisible = () => {
            if (!document.hidden) load();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
            if (flashTimer.current) clearTimeout(flashTimer.current);
        };
    }, [load]);

    const setFilter = (key, value) => {
        setFilters((f) => ({ ...f, [key]: value }));
        setVisibleCount(PAGE_SIZE);
    };

    // Marca/desmarca o contato do lead: atualiza na hora (otimista) e persiste
    // na coluna "contato_realizado" do Supabase via PATCH /api/leads. Se o
    // save falhar, reverte e avisa.
    const toggleContato = useCallback(async (lead) => {
        const next = !lead.contato_realizado;
        setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, contato_realizado: next } : l)));
        try {
            const resp = await fetch('/api/leads', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: lead.id, contato_realizado: next }),
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            setSaveError(null);
        } catch {
            setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, contato_realizado: !next } : l)));
            setSaveError(
                `Não foi possível salvar o contato de #${lead.id} (verifique se a coluna "contato_realizado" existe no Supabase). Tente novamente.`,
            );
        }
    }, []);

    useEffect(() => {
        if (!saveError) return undefined;
        const t = setTimeout(() => setSaveError(null), 8000);
        return () => clearTimeout(t);
    }, [saveError]);

    const hasActiveFilters = Boolean(
        search.trim()
            || dateFrom
            || dateTo
            || contatoFiltro.sim
            || contatoFiltro.nao
            || filters.produto
            || filters.referrer
            || filters.ig
            || filters.utm_medium,
    );
    const clearFilters = () => {
        setSearch('');
        setFilters({ produto: '', referrer: '', ig: '', utm_medium: '' });
        setDateFrom('');
        setDateTo('');
        setContatoFiltro({ sim: false, nao: false });
        setVisibleCount(PAGE_SIZE);
    };

    // --- Métricas (sobre o dataset completo) ---

    const metrics = useMemo(() => {
        const now = new Date();
        const startOf = (daysAgo) => {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            if (daysAgo) d.setDate(d.getDate() - daysAgo);
            return d;
        };
        const today = startOf(0);
        const week = startOf(6);
        const month = startOf(29);
        let countToday = 0;
        let countWeek = 0;
        let countMonth = 0;
        leads.forEach((lead) => {
            const created = new Date(lead.created_at);
            if (created >= today) countToday += 1;
            if (created >= week) countWeek += 1;
            if (created >= month) countMonth += 1;
        });
        return { total: leads.length, today: countToday, week: countWeek, month: countMonth };
    }, [leads]);

    const daily = useMemo(() => {
        const counts = new Map();
        const buckets = [];
        const now = new Date();
        for (let i = 13; i >= 0; i -= 1) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
            const key = dayKey(d);
            counts.set(key, 0);
            buckets.push({ key, date: d, count: 0 });
        }
        leads.forEach((lead) => {
            const key = dayKey(new Date(lead.created_at));
            if (counts.has(key)) counts.set(key, counts.get(key) + 1);
        });
        buckets.forEach((b) => {
            b.count = counts.get(b.key);
        });
        return { buckets, max: Math.max(1, ...buckets.map((b) => b.count)) };
    }, [leads]);

    const categorias = useMemo(() => {
        const map = new Map();
        leads.forEach((lead) => {
            const c = parseProduto(lead.produto);
            map.set(c, (map.get(c) || 0) + 1);
        });
        return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }, [leads]);

    const buildOptions = useCallback(
        (accessor) => {
            const map = new Map();
            leads.forEach((lead) => {
                const v = accessor(lead);
                map.set(v, (map.get(v) || 0) + 1);
            });
            return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        },
        [leads],
    );

    const produtoOptions = useMemo(() => buildOptions((l) => parseProduto(l.produto)), [buildOptions]);
    const referrerOptions = useMemo(() => buildOptions((l) => refHost(l.referrer)), [buildOptions]);
    const igOptions = useMemo(() => buildOptions((l) => igValue(l)), [buildOptions]);
    const utmMediumOptions = useMemo(() => buildOptions((l) => l.utm_medium || '—'), [buildOptions]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
        const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
        const filtroSoSim = contatoFiltro.sim && !contatoFiltro.nao;
        const filtroSoNao = contatoFiltro.nao && !contatoFiltro.sim;
        return leads.filter((lead) => {
            const created = new Date(lead.created_at);
            if (q) {
                const haystack = `${lead.id} ${lead.nome_completo || ''} ${lead.whatsapp || ''}`.toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            if (from && created < from) return false;
            if (to && created > to) return false;
            if (filtroSoSim && !lead.contato_realizado) return false;
            if (filtroSoNao && lead.contato_realizado) return false;
            if (filters.produto && parseProduto(lead.produto) !== filters.produto) return false;
            if (filters.referrer && refHost(lead.referrer) !== filters.referrer) return false;
            if (filters.ig && igValue(lead) !== filters.ig) return false;
            if (filters.utm_medium && (lead.utm_medium || '—') !== filters.utm_medium) return false;
            return true;
        });
    }, [leads, search, filters, dateFrom, dateTo, contatoFiltro]);

    const visible = filtered.slice(0, visibleCount);
    const todayKey = dayKey(new Date());

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
                        <h1 className="text-lg font-bold leading-tight">Dashboard de Leads</h1>
                        <p className="text-xs text-gray-400">Supabase · atualização automática a cada 10s</p>
                    </div>

                    <div className="ml-auto flex items-center gap-3">
                        {error ? (
                            <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-full px-3 py-1">
                                <AlertCircle className="w-3.5 h-3.5" />
                                Sem conexão
                            </span>
                        ) : (
                            <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/30 rounded-full px-3 py-1">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                                </span>
                                Ao vivo
                            </span>
                        )}
                        <span className="text-xs text-gray-400 hidden sm:block">
                            {lastUpdated ? `Atualizado às ${lastUpdated.toLocaleTimeString('pt-BR')}` : 'Carregando...'}
                        </span>
                        <button
                            type="button"
                            onClick={load}
                            title="Atualizar agora"
                            className="p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition"
                        >
                            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Aviso de novo lead */}
            {newCount > 0 && (
                <div className="fixed top-20 right-4 z-50 flex items-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg shadow-green-600/25 text-sm font-medium">
                    <MessageCircle className="w-5 h-5" />
                    {newCount} novo{newCount > 1 ? 's' : ''} lead{newCount > 1 ? 's' : ''} recebido{newCount > 1 ? 's' : ''}!
                </div>
            )}

            <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
                {error && !loading && leads.length === 0 ? (
                    <div className="bg-red-500/10 border border-red-500/40 text-red-400 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            {error}
                        </span>
                        <button
                            type="button"
                            onClick={load}
                            className="shrink-0 px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-medium transition"
                        >
                            Tentar agora
                        </button>
                    </div>
                ) : null}

                {/* Barra de período + atalhos Meta Ads (acima das métricas) */}
                <section className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 h-10 px-3 rounded-lg border border-gray-600 bg-gray-700 text-sm">
                        <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-gray-400 hidden sm:inline">Período:</span>
                        <input
                            type="date"
                            value={dateFrom}
                            max={dateTo || undefined}
                            onChange={(e) => {
                                setDateFrom(e.target.value);
                                setVisibleCount(PAGE_SIZE);
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
                                setVisibleCount(PAGE_SIZE);
                            }}
                            aria-label="Data final"
                            title="Data final"
                            className="bg-transparent text-white placeholder-gray-500 [color-scheme:dark] focus:outline-none cursor-pointer"
                        />
                    </div>
                    {(dateFrom || dateTo) && (
                        <button
                            type="button"
                            onClick={() => {
                                setDateFrom('');
                                setDateTo('');
                                setVisibleCount(PAGE_SIZE);
                            }}
                            className="flex items-center gap-1.5 h-10 px-3 rounded-lg border border-gray-600 text-sm text-gray-300 hover:text-white hover:border-gray-500 transition"
                        >
                            <X className="w-4 h-4" />
                            Limpar período
                        </button>
                    )}
                    <div className="ml-auto flex items-center gap-1.5">
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

                {/* Métricas */}
                <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard title="Total de leads" value={metrics.total} icon={Users} accent="text-blue-400" />
                    <MetricCard title="Hoje" value={metrics.today} icon={CalendarDays} accent="text-yellow-400" />
                    <MetricCard title="Últimos 7 dias" value={metrics.week} icon={TrendingUp} accent="text-green-400" />
                    <MetricCard title="Últimos 30 dias" value={metrics.month} icon={BarChart3} accent="text-purple-400" />
                </section>

                {/* Gráfico por dia + categorias */}
                <section className="grid lg:grid-cols-5 gap-4">
                    <div className="lg:col-span-3 bg-gray-800 rounded-xl border border-gray-700 p-5">
                        <h2 className="text-sm font-semibold text-gray-300 mb-4">Leads por dia — últimos 14 dias</h2>
                        <div className="flex items-end gap-1.5 h-44">
                            {daily.buckets.map((b) => {
                                const isToday = b.key === todayKey;
                                const height = b.count > 0 ? Math.max(8, (b.count / daily.max) * 100) : 2;
                                return (
                                    <div
                                        key={b.key}
                                        className="flex-1 h-full flex flex-col items-center justify-end gap-1 group"
                                        title={`${b.date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}: ${b.count} lead${b.count === 1 ? '' : 's'}`}
                                    >
                                        {b.count > 0 && (
                                            <span className={`text-[10px] ${isToday ? 'text-habilitar-orange font-bold' : 'text-gray-400'}`}>
                                                {b.count}
                                            </span>
                                        )}
                                        <div
                                            className={`w-full rounded-t transition-colors ${
                                                isToday
                                                    ? 'bg-habilitar-orange'
                                                    : 'bg-habilitar-orange/40 group-hover:bg-habilitar-orange/80'
                                            }`}
                                            style={{ height: `${height}%` }}
                                        />
                                        <span className={`text-[10px] ${isToday ? 'text-gray-300 font-semibold' : 'text-gray-500'}`}>
                                            {b.date.getDate()}/{b.date.getMonth() + 1}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="lg:col-span-2 bg-gray-800 rounded-xl border border-gray-700 p-5">
                        <h2 className="text-sm font-semibold text-gray-300 mb-4">Leads por categoria</h2>
                        {categorias.length === 0 ? (
                            <p className="text-sm text-gray-500">Sem dados ainda.</p>
                        ) : (
                            <div className="space-y-3">
                                {categorias.map(([name, count]) => {
                                    const pct = metrics.total ? Math.round((count / metrics.total) * 100) : 0;
                                    return (
                                        <div key={name}>
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <span className="text-sm text-gray-300 truncate">{name}</span>
                                                <span className="text-xs text-gray-400 shrink-0">
                                                    {count} · {pct}%
                                                </span>
                                            </div>
                                            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-habilitar-orange rounded-full"
                                                    style={{ width: `${Math.max(pct, 2)}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>

                {/* Tabela de leads */}
                <section className="bg-gray-800 rounded-xl border border-gray-700">
                    <div className="p-4 border-b border-gray-700 flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setVisibleCount(PAGE_SIZE);
                                }}
                                placeholder="Buscar por nome, WhatsApp ou ID..."
                                className="h-10 w-64 max-w-full pl-9 pr-3 rounded-lg bg-gray-700 border border-gray-600 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-habilitar-orange"
                            />
                        </div>

                        <Combobox label="Produto" value={filters.produto} onChange={(v) => setFilter('produto', v)} options={produtoOptions} />
                        <Combobox label="Referrer" value={filters.referrer} onChange={(v) => setFilter('referrer', v)} options={referrerOptions} />
                        <Combobox label="IG" value={filters.ig} onChange={(v) => setFilter('ig', v)} options={igOptions} />
                        <Combobox label="UTM Medium" value={filters.utm_medium} onChange={(v) => setFilter('utm_medium', v)} options={utmMediumOptions} />

                        {/* Filtro de contato realizado (checkboxes) */}
                        <div className="flex items-center gap-3 h-10 px-3 rounded-lg border border-gray-600 bg-gray-700 text-sm select-none">
                            <span className="text-gray-400">Contato:</span>
                            <label className="flex items-center gap-1.5 cursor-pointer text-gray-300 hover:text-white transition">
                                <input
                                    type="checkbox"
                                    checked={contatoFiltro.sim}
                                    onChange={(e) => {
                                        setContatoFiltro((c) => ({ ...c, sim: e.target.checked }));
                                        setVisibleCount(PAGE_SIZE);
                                    }}
                                    className="w-4 h-4 accent-habilitar-orange cursor-pointer"
                                />
                                Sim
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer text-gray-300 hover:text-white transition">
                                <input
                                    type="checkbox"
                                    checked={contatoFiltro.nao}
                                    onChange={(e) => {
                                        setContatoFiltro((c) => ({ ...c, nao: e.target.checked }));
                                        setVisibleCount(PAGE_SIZE);
                                    }}
                                    className="w-4 h-4 accent-habilitar-orange cursor-pointer"
                                />
                                Não
                            </label>
                        </div>

                        {hasActiveFilters && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="flex items-center gap-1.5 h-10 px-3 rounded-lg border border-gray-600 text-sm text-gray-300 hover:text-white hover:border-gray-500 transition"
                            >
                                <X className="w-4 h-4" />
                                Limpar
                            </button>
                        )}

                        <span className="ml-auto text-sm text-gray-400 shrink-0">
                            {filtered.length.toLocaleString('pt-BR')} de {leads.length.toLocaleString('pt-BR')} leads
                        </span>
                    </div>

                    {saveError && (
                        <div className="mx-4 mt-3 flex items-center gap-2 bg-red-500/10 border border-red-500/40 text-red-400 rounded-lg px-3 py-2 text-xs">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            {saveError}
                        </div>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-700">
                                    <th className="px-4 py-3 font-medium">ID</th>
                                    <th className="px-4 py-3 font-medium">Nome completo</th>
                                    <th className="px-4 py-3 font-medium">WhatsApp</th>
                                    <th className="px-4 py-3 font-medium">Produto</th>
                                    <th className="px-4 py-3 font-medium text-center">Contato</th>
                                    <th className="px-4 py-3 font-medium">Referrer</th>
                                    <th className="px-4 py-3 font-medium">IG</th>
                                    <th className="px-4 py-3 font-medium">UTM Medium</th>
                                    <th className="px-4 py-3 font-medium">Criado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading && leads.length === 0
                                    ? Array.from({ length: 6 }).map((_, i) => (
                                          <tr key={i} className="border-b border-gray-800">
                                              <td colSpan={9} className="px-4 py-3.5">
                                                  <div className="h-4 rounded bg-gray-700 animate-pulse" />
                                              </td>
                                          </tr>
                                      ))
                                    : visible.map((lead) => {
                                          const wa = waLink(lead.whatsapp);
                                          return (
                                              <tr key={lead.id} className="border-b border-gray-800 hover:bg-gray-700/40 transition-colors">
                                                  <td className="px-4 py-3 text-gray-500 font-mono whitespace-nowrap">#{lead.id}</td>
                                                  <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                                                      {lead.nome_completo || '—'}
                                                  </td>
                                                  <td className="px-4 py-3 whitespace-nowrap">
                                                      {wa ? (
                                                          <a
                                                              href={wa}
                                                              target="_blank"
                                                              rel="noreferrer"
                                                              title="Abrir conversa no WhatsApp"
                                                              className="inline-flex items-center gap-1.5 text-green-400 hover:text-green-300 transition"
                                                          >
                                                              <MessageCircle className="w-4 h-4" />
                                                              {lead.whatsapp}
                                                          </a>
                                                      ) : (
                                                          '—'
                                                      )}
                                                  </td>
                                                  <td className="px-4 py-3 whitespace-nowrap">
                                                      <span className="inline-block px-2.5 py-1 rounded-full bg-habilitar-orange/15 text-habilitar-orange-light text-xs font-semibold">
                                                          {parseProduto(lead.produto)}
                                                      </span>
                                                  </td>
                                                  <td className="px-4 py-3 whitespace-nowrap text-center">
                                                      <input
                                                          type="checkbox"
                                                          checked={Boolean(lead.contato_realizado)}
                                                          onChange={() => toggleContato(lead)}
                                                          title={lead.contato_realizado
                                                              ? 'Contato realizado — clique para desmarcar'
                                                              : 'Marcar contato como realizado'}
                                                          aria-label={`Contato realizado de ${lead.nome_completo || `lead ${lead.id}`}`}
                                                          className="w-5 h-5 accent-habilitar-orange cursor-pointer"
                                                      />
                                                  </td>
                                                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap" title={lead.referrer || ''}>
                                                      {refHost(lead.referrer)}
                                                  </td>
                                                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{igValue(lead)}</td>
                                                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{lead.utm_medium || '—'}</td>
                                                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{formatDate(lead.created_at)}</td>
                                              </tr>
                                          );
                                      })}
                            </tbody>
                        </table>
                    </div>

                    {!loading && filtered.length === 0 && (
                        <div className="py-16 text-center">
                            <Inbox className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                            <p className="text-gray-400 text-sm">
                                {hasActiveFilters ? (
                                    <>
                                        Nenhum lead encontrado com os filtros ativos.
                                        <button type="button" onClick={clearFilters} className="ml-1 text-habilitar-orange hover:underline">
                                            Limpar filtros
                                        </button>
                                    </>
                                ) : (
                                    'Nenhum lead cadastrado ainda.'
                                )}
                            </p>
                        </div>
                    )}

                    {filtered.length > visibleCount && (
                        <div className="p-4 border-t border-gray-700 text-center">
                            <button
                                type="button"
                                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 text-sm text-gray-300 hover:text-white hover:border-gray-500 transition"
                            >
                                <Filter className="w-4 h-4" />
                                Mostrar mais ({(filtered.length - visibleCount).toLocaleString('pt-BR')} restantes)
                            </button>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
}

export default DashPage;
