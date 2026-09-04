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
    DollarSign,
    MousePointerClick,
} from 'lucide-react';
import usePageTitle from './lib/usePageTitle';

// =============================================================================
//  /lead — Dashboard pública de leads em tempo real (fonte: Supabase, tabela
//  "leads"; rota antiga /dash redireciona para cá). Os dados vêm do endpoint
//  /api/leads (serverless, service_role), porque o RLS da tabela bloqueia a
//  leitura direta pelo browser. A página faz polling a cada 10s e também ao
//  voltar para a aba — novo lead aparece sozinho, com aviso flutuante.
//
//  Inclui KPIs de mídia (investimento/cliques/CPL médio), lidos da tabela
//  "marketing_performance" — destino diário do Windsor.ai — via /api/marketing
//  (mesmo padrão: service_role só no servidor). O detalhamento por campanha,
//  conjunto e anúncio fica na página /meta-ads.
//
//  A coluna Status (Pagou | Passou documento | Vai passar dados | Vai na
//  Autoescola) é um select inline que grava direto no Supabase via PATCH
//  /api/leads — coluna "status" da tabela leads (DDL em
//  supabase/sql/2026-09-04-leads-status.sql); dá para filtrar por etapa no
//  combobox "Status" da barra de filtros.
//
//  CRITÉRIO DE DIA: todos os limites ("Hoje", 7/30 dias, período, gráfico,
//  coluna "Criado") usam o dia UTC — exatamente o que o editor do Supabase
//  mostra para created_at (timestamptz). Assim os números da dashboard sempre
//  batem com a tabela no Supabase, independente do fuso do dispositivo.
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

// Coluna WhatsApp: o clique passa pelo endpoint /api/falazapp-ticket, que
// redireciona para o ticket do lead no painel FalazApp (e cai no wa.me se
// o contato ainda não tiver ticket lá).
const falazappTicketLink = (whatsapp) =>
    `/api/falazapp-ticket?whatsapp=${encodeURIComponent(whatsapp || '')}`;

const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('pt-BR', {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

// Todos os limites de dia da dashboard usam o dia UTC — o mesmo critério do
// editor do Supabase, que renderiza created_at (timestamptz) em UTC. Se o
// "hoje" fosse calculado no fuso do navegador, leads enviados entre 21h e
// 23h59 (BRT) cairiam no dia seguinte e os números não bateriam com o
// Supabase (ex.: "Hoje" mostrando 4 quando o editor lista 7).
const dayKey = (d) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

// Meia-noite UTC do dia de uma data (para janelas "hoje"/7 dias/30 dias).
const startOfUtcDay = (d) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// "2026-09-01" ou "2026-09-01T00:00:00+00:00" → "2026-09-01" (coluna date da
// tabela marketing_performance, comparável com os inputs de período).
const dateOnly = (value) => String(value || '').slice(0, 10);

// 1234.5 → "R$ 1.234,50"
const fmtBRL = (value) =>
    Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// --- Componentes internos ----------------------------------------------------

// Aceita número (formata pt-BR) ou string já formatada (ex.: "R$ 1.234,50").
const MetricCard = ({ title, value, icon: Icon, accent }) => (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex justify-between items-start mb-2">
            <span className="text-gray-400 text-sm">{title}</span>
            <Icon className={`w-6 h-6 ${accent}`} />
        </div>
        <div className="text-3xl font-bold text-white">
            {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
        </div>
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

// Quantidade de linhas carregadas por vez na tabela (scroll infinito).
const PAGE_SIZE = 20;

// Etapas de atendimento da coluna Status (mesma lista em api/leads.js e no
// comment da coluna no Supabase). '' = sem status.
const LEAD_STATUS = ['Pagou', 'Passou documento', 'Vai passar dados', 'Vai na Autoescola'];

// Cor do select de status por etapa (cinza quando sem status).
const STATUS_STYLE = {
    '': 'bg-gray-700 text-gray-300 border-gray-600',
    'Pagou': 'bg-green-900/60 text-green-300 border-green-700',
    'Passou documento': 'bg-blue-900/60 text-blue-300 border-blue-700',
    'Vai passar dados': 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
    'Vai na Autoescola': 'bg-purple-900/60 text-purple-300 border-purple-700',
};
const statusStyle = (s) => STATUS_STYLE[s] || STATUS_STYLE[''];

// --- Página ------------------------------------------------------------------

function DashPage() {
    usePageTitle('Lead');
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [newCount, setNewCount] = useState(0);

    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState({ produto: '', referrer: '', ig: '', utm_medium: '', status: '' });
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    // Erro do PATCH de status (ex.: coluna ainda não criada no Supabase) —
    // aparece num banner vermelho por alguns segundos.
    const [statusError, setStatusError] = useState(null);
    const statusErrorTimer = useRef(null);

    // Mídia (Windsor → marketing_performance): dado muda 1×/dia, então não
    // entra no polling de 10s — carrega no mount, ao voltar para a aba e no
    // botão de refresh.
    const [marketing, setMarketing] = useState([]);
    const [marketingError, setMarketingError] = useState(null);

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

    const loadMarketing = useCallback(async () => {
        try {
            const resp = await fetch('/api/marketing', { headers: { Accept: 'application/json' } });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const json = await resp.json();
            setMarketing(Array.isArray(json.rows) ? json.rows : []);
            setMarketingError(null);
        } catch {
            setMarketingError('Sem dados de mídia — a tabela marketing_performance ainda não existe ou o Windsor ainda não sincronizou.');
        }
    }, []);

    useEffect(() => {
        load();
        loadMarketing();
        const interval = setInterval(load, 10000);
        const onVisible = () => {
            if (!document.hidden) {
                load();
                loadMarketing();
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
            if (flashTimer.current) clearTimeout(flashTimer.current);
            if (statusErrorTimer.current) clearTimeout(statusErrorTimer.current);
        };
    }, [load, loadMarketing]);

    const setFilter = (key, value) => {
        setFilters((f) => ({ ...f, [key]: value }));
        setVisibleCount(PAGE_SIZE);
    };

    // Coluna Status: o select inline grava direto no Supabase via PATCH
    // /api/leads (atualização otimista — volta ao valor anterior se falhar;
    // o polling de 10s re-sincroniza de qualquer forma).
    const setStatus = async (id, status) => {
        const anterior = (leads.find((l) => l.id === id) || {}).status ?? null;
        setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
        setStatusError(null);
        try {
            const resp = await fetch(`/api/leads?id=${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (!resp.ok) {
                const json = await resp.json().catch(() => ({}));
                throw new Error(json.detail || json.error || `HTTP ${resp.status}`);
            }
        } catch (err) {
            setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: anterior } : l)));
            setStatusError(`Não deu para salvar o status: ${err.message}`);
            if (statusErrorTimer.current) clearTimeout(statusErrorTimer.current);
            statusErrorTimer.current = setTimeout(() => setStatusError(null), 8000);
        }
    };

    const hasActiveFilters = Boolean(
        search.trim()
            || dateFrom
            || dateTo
            || filters.produto
            || filters.referrer
            || filters.ig
            || filters.utm_medium
            || filters.status,
    );
    const clearFilters = () => {
        setSearch('');
        setFilters({ produto: '', referrer: '', ig: '', utm_medium: '', status: '' });
        setDateFrom('');
        setDateTo('');
        setVisibleCount(PAGE_SIZE);
    };

    // --- Dados dentro do período selecionado (base de TODA a dashboard:
    // KPIs, gráfico por dia, categorias e tabela). Sem datas = tudo. ---

    const filteredByDate = useMemo(() => {
        // Limite do período em UTC (mesmo critério do editor do Supabase).
        const from = dateFrom ? new Date(`${dateFrom}T00:00:00Z`) : null;
        const to = dateTo ? new Date(`${dateTo}T23:59:59.999Z`) : null;
        if (!from && !to) return leads;
        return leads.filter((lead) => {
            const created = new Date(lead.created_at);
            if (from && created < from) return false;
            if (to && created > to) return false;
            return true;
        });
    }, [leads, dateFrom, dateTo]);

    // --- Métricas (sobre o período selecionado) ---

    const metrics = useMemo(() => {
        // Janelas "hoje"/7/30 dias abertas na meia-noite UTC (dia do Supabase).
        const now = new Date();
        const startOf = (daysAgo) => {
            const d = startOfUtcDay(now);
            if (daysAgo) d.setUTCDate(d.getUTCDate() - daysAgo);
            return d;
        };
        const today = startOf(0);
        const week = startOf(6);
        const month = startOf(29);
        let countToday = 0;
        let countWeek = 0;
        let countMonth = 0;
        filteredByDate.forEach((lead) => {
            const created = new Date(lead.created_at);
            if (created >= today) countToday += 1;
            if (created >= week) countWeek += 1;
            if (created >= month) countMonth += 1;
        });
        return { total: filteredByDate.length, today: countToday, week: countWeek, month: countMonth };
    }, [filteredByDate]);

    // Gráfico por dia: janela fixa de 7 dias a partir da data do primeiro
    // lead (ex.: 01/09–07/09), mesmo que os dias futuros ainda não tenham
    // dados. O início do período filtrado tem prioridade sobre o 1º lead.
    const daily = useMemo(() => {
        const source = filteredByDate;
        const start = (() => {
            if (dateFrom) return startOfUtcDay(new Date(`${dateFrom}T00:00:00Z`));
            if (source.length > 0) return startOfUtcDay(new Date(source[source.length - 1].created_at)); // lista é desc
            return startOfUtcDay(new Date());
        })();

        const end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 6);

        const counts = new Map();
        const buckets = [];
        for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
            const key = dayKey(d);
            counts.set(key, 0);
            buckets.push({ key, date: new Date(d), count: 0 });
        }
        source.forEach((lead) => {
            const key = dayKey(new Date(lead.created_at));
            if (counts.has(key)) counts.set(key, counts.get(key) + 1);
        });
        buckets.forEach((b) => {
            b.count = counts.get(b.key);
        });
        return { buckets, max: Math.max(1, ...buckets.map((b) => b.count)) };
    }, [filteredByDate, dateFrom]);

    const categorias = useMemo(() => {
        const map = new Map();
        filteredByDate.forEach((lead) => {
            const c = parseProduto(lead.produto);
            map.set(c, (map.get(c) || 0) + 1);
        });
        return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }, [filteredByDate]);

    // --- Mídia (Windsor → marketing_performance) no período selecionado ---

    const marketingByDate = useMemo(() => {
        if (!dateFrom && !dateTo) return marketing;
        return marketing.filter((row) => {
            const d = dateOnly(row.date);
            if (!d) return false;
            if (dateFrom && d < dateFrom) return false;
            if (dateTo && d > dateTo) return false;
            return true;
        });
    }, [marketing, dateFrom, dateTo]);

    const marketingTotals = useMemo(() => {
        let spend = 0;
        let clicks = 0;
        marketingByDate.forEach((row) => {
            spend += Number(row.spend) || 0;
            clicks += Number(row.clicks) || 0;
        });
        return { spend, clicks };
    }, [marketingByDate]);

    // CPL médio (blended): investimento total ÷ leads do período. Não depende
    // do casamento campanha ↔ utm_campaign, então funciona sempre.
    const blendedCpl = metrics.total > 0 && marketingTotals.spend > 0
        ? marketingTotals.spend / metrics.total
        : null;

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
    const statusOptions = useMemo(() => buildOptions((l) => l.status || 'Sem status'), [buildOptions]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return filteredByDate.filter((lead) => {
            if (q) {
                const haystack = `${lead.id} ${lead.nome_completo || ''} ${lead.whatsapp || ''}`.toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            if (filters.produto && parseProduto(lead.produto) !== filters.produto) return false;
            if (filters.referrer && refHost(lead.referrer) !== filters.referrer) return false;
            if (filters.ig && igValue(lead) !== filters.ig) return false;
            if (filters.utm_medium && (lead.utm_medium || '—') !== filters.utm_medium) return false;
            if (filters.status && (lead.status || 'Sem status') !== filters.status) return false;
            return true;
        });
    }, [filteredByDate, search, filters]);

    const visible = filtered.slice(0, visibleCount);
    const todayKey = dayKey(new Date());

    // Scroll infinito: quando o "sentinela" no fim da tabela entra na tela,
    // revela mais PAGE_SIZE linhas (a lista completa já está em memória —
    // limitar a renderização evita sobrecarregar o navegador).
    const sentinelRef = useRef(null);
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') return undefined;
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setVisibleCount((c) => c + PAGE_SIZE);
                }
            },
            { rootMargin: '300px' },
        );
        io.observe(el);
        return () => io.disconnect();
    }, [filtered.length, visibleCount, loading]);

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
                        <a
                            href="/criativos"
                            title="Biblioteca de criativos para o gestor de tráfego"
                            className="hidden sm:flex items-center h-9 px-3 rounded-lg border border-gray-600 bg-gray-700 text-xs text-gray-300 hover:text-white hover:border-gray-500 transition"
                        >
                            Criativos
                        </a>
                        <button
                            type="button"
                            onClick={() => {
                                load();
                                loadMarketing();
                            }}
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
                {/* Erro ao salvar status (ex.: coluna "status" pendente no Supabase) */}
                {statusError && (
                    <div className="bg-red-500/10 border border-red-500/40 text-red-400 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        {statusError}
                    </div>
                )}

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

                {/* Barra de período (acima das métricas) */}
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
                                setVisibleCount(PAGE_SIZE);
                            }}
                            onClick={(e) => {
                                try { e.currentTarget.showPicker(); } catch { /* navegador sem suporte */ }
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
                        <h2 className="text-sm font-semibold text-gray-300 mb-4">
                            Leads por dia
                            {daily.buckets.length > 0 && (
                                <span className="text-gray-500 font-normal">
                                    {' · '}
                                    {daily.buckets[0].date.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })}
                                    {' – '}
                                    {daily.buckets[daily.buckets.length - 1].date.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })}
                                </span>
                            )}
                        </h2>
                        <div className="flex items-end gap-1.5 h-44">
                            {daily.buckets.map((b) => {
                                const isToday = b.key === todayKey;
                                const height = b.count > 0 ? Math.max(8, (b.count / daily.max) * 100) : 2;
                                return (
                                    <div
                                        key={b.key}
                                        className="flex-1 h-full flex flex-col items-center justify-end gap-1 group"
                                        title={`${b.date.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })}: ${b.count} lead${b.count === 1 ? '' : 's'}`}
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
                                            {b.date.getUTCDate()}/{b.date.getUTCMonth() + 1}
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

                {/* Mídia (Windsor → marketing_performance): investimento vs leads no período.
                    O detalhamento por campanha vive na página /meta-ads. */}
                <section className="space-y-4">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <MetricCard title="Investimento" value={fmtBRL(marketingTotals.spend)} icon={DollarSign} accent="text-yellow-400" />
                        <MetricCard title="Cliques" value={Math.round(marketingTotals.clicks)} icon={MousePointerClick} accent="text-blue-400" />
                        <MetricCard title="Leads (período)" value={metrics.total} icon={Users} accent="text-green-400" />
                        <MetricCard title="CPL médio" value={blendedCpl != null ? fmtBRL(blendedCpl) : '—'} icon={TrendingUp} accent="text-purple-400" />
                    </div>
                    {marketingError && marketing.length === 0 && (
                        <p className="text-xs text-gray-500 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            {marketingError}
                        </p>
                    )}
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
                        <Combobox label="Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} />
                        <Combobox label="Referrer" value={filters.referrer} onChange={(v) => setFilter('referrer', v)} options={referrerOptions} />
                        <Combobox label="IG" value={filters.ig} onChange={(v) => setFilter('ig', v)} options={igOptions} />
                        <Combobox label="UTM Medium" value={filters.utm_medium} onChange={(v) => setFilter('utm_medium', v)} options={utmMediumOptions} />

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

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-700">
                                    <th className="px-4 py-3 font-medium">ID</th>
                                    <th className="px-4 py-3 font-medium">Nome completo</th>
                                    <th className="px-4 py-3 font-medium">WhatsApp</th>
                                    <th className="px-4 py-3 font-medium">Produto</th>
                                    <th className="px-4 py-3 font-medium">Status</th>
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
                                          return (
                                              <tr key={lead.id} className="border-b border-gray-800 hover:bg-gray-700/40 transition-colors">
                                                  <td className="px-4 py-3 text-gray-500 font-mono whitespace-nowrap">#{lead.id}</td>
                                                  <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                                                      {lead.nome_completo || '—'}
                                                  </td>
                                                  <td className="px-4 py-3 whitespace-nowrap">
                                                      {lead.whatsapp ? (
                                                          <a
                                                              href={falazappTicketLink(lead.whatsapp)}
                                                              target="_blank"
                                                              rel="noreferrer"
                                                              title="Abrir conversa no FalazApp"
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
                                                  <td className="px-4 py-3 whitespace-nowrap">
                                                      <select
                                                          value={lead.status || ''}
                                                          onChange={(e) => setStatus(lead.id, e.target.value || null)}
                                                          title="Etapa do atendimento — clique para mudar (grava na hora)"
                                                          className={`h-8 rounded-lg border text-xs font-semibold [color-scheme:dark] outline-none cursor-pointer ${statusStyle(lead.status || '')}`}
                                                      >
                                                          <option value="">Sem status</option>
                                                          {LEAD_STATUS.map((s) => (
                                                              <option key={s} value={s}>{s}</option>
                                                          ))}
                                                      </select>
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

                    {/* Sentinela do scroll infinito + status de linhas carregadas */}
                    <div ref={sentinelRef} aria-hidden="true" className="h-px" />
                    {filtered.length > visible.length && (
                        <div className="px-4 py-3 border-t border-gray-700 text-center space-y-2">
                            <p className="text-xs text-gray-500">
                                Mostrando {visible.length.toLocaleString('pt-BR')} de {filtered.length.toLocaleString('pt-BR')} leads — role para carregar mais
                            </p>
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
