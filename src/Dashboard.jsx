import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Users,
    CalendarDays,
    TrendingUp,
    DollarSign,
    MousePointerClick,
    MessageCircle,
    Palette,
    Package,
    Image as ImageIcon,
    RefreshCw,
    AlertCircle,
    ExternalLink,
    Megaphone,
    Home,
    GraduationCap,
    Database,
    Terminal,
} from 'lucide-react';
import usePageTitle from './lib/usePageTitle';

// =============================================================================
//  /dashboard — Visão geral da operação: índice de todas as páginas (cada
//  card abre em nova aba) + as principais métricas gerais de tudo que roda
//  no projeto, agregadas no navegador a partir dos mesmos endpoints públicos
//  das páginas individuais:
//
//    leads      /api/leads        (tabela "leads" — mesma fonte do /lead)
//    marketing  /api/marketing    (marketing_performance — Windsor, /meta-ads)
//    mensagens  /api/mensagens    (scripts de WhatsApp ativos, /mensagens)
//    criativos  /api/criativos    (biblioteca do gestor de tráfego, /criativos)
//    produtos   /api/produtos     (flyers de orçamento, /imagens)
//    fotos      /api/fotos-perfil (fotos de perfil WhatsApp, /imagens)
//
//  Cada endpoint degrada sozinho: se uma tabela ainda não existir, a seção
//  mostra "—" com um aviso e o resto da página continua de pé. O critério de
//  dia é o UTC — mesmo do /lead e do editor do Supabase.
// =============================================================================

// --- Utilitários -------------------------------------------------------------

const fmtBRL = (value) =>
    Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const dayKey = (d) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

// "2026-09-01" ou "2026-09-01T00:00:00+00:00" → "2026-09-01" (coluna date da
// tabela marketing_performance).
const dateOnly = (value) => String(value || '').slice(0, 10);

// "Pré-Matrícula CNH — Autoescola Habilitar (Moto [A])" -> "Moto [A]"
const parseProduto = (produto) => {
    if (!produto) return '—';
    const match = String(produto).match(/\(([^)]*)\)/);
    return match ? match[1].trim() : produto;
};

// --- Índice de páginas (todas abrem em nova aba) -----------------------------

const PAGE_GROUPS = [
    {
        grupo: 'Operação & Mídia',
        itens: [
            { href: '/lead', titulo: 'Leads', desc: 'Dashboard de leads em tempo real (Supabase)', icon: Users },
            { href: '/meta-ads', titulo: 'Meta Ads', desc: 'Mídia paga detalhada (campanha/conjunto/anúncio)', icon: Megaphone },
            { href: '/mensagens', titulo: 'Mensagens', desc: 'Scripts de WhatsApp para o atendimento', icon: MessageCircle },
        ],
    },
    {
        grupo: 'Produção',
        itens: [
            { href: '/criativos', titulo: 'Criativos', desc: 'Biblioteca de criativos para o gestor de tráfego', icon: Palette },
            { href: '/imagens', titulo: 'Imagens', desc: 'Flyers de orçamento e fotos de perfil WhatsApp', icon: ImageIcon },
        ],
    },
    {
        grupo: 'Site & Captura',
        itens: [
            { href: '/', titulo: 'Site', desc: 'Página de captura (pré-matrícula)', icon: Home },
            { href: '/mega-oferta', titulo: 'Mega Oferta', desc: 'Página de obrigado + WhatsApp', icon: GraduationCap },
        ],
    },
    {
        grupo: 'Supabase',
        itens: [
            {
                href: 'https://supabase.com/dashboard/project/dtugwspbkkqxkeoajunf/editor/17534?schema=public',
                titulo: 'Tabelas',
                desc: 'Editor de tabelas do projeto no Supabase (abre o painel deles)',
                icon: Database,
            },
            {
                href: 'https://supabase.com/dashboard/project/dtugwspbkkqxkeoajunf/sql/new',
                titulo: 'SQL',
                desc: 'Editor de SQL do projeto no Supabase (abre o painel deles)',
                icon: Terminal,
            },
        ],
    },
];

// --- Componentes internos ------------------------------------------------------

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

// Cabeçalho de seção de métricas com link "abrir página" (nova aba).
const SectionHeader = ({ title, href, hint }) => (
    <div className="flex items-center justify-between gap-3 mb-4">
        <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
        </div>
        {href && (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-600 bg-gray-700 text-xs text-gray-300 hover:text-white hover:border-gray-500 transition shrink-0"
            >
                Abrir página
                <ExternalLink className="w-3.5 h-3.5" />
            </a>
        )}
    </div>
);

// Card do índice: clique abre a página em nova aba (pedido do índice).
const PageCard = ({ href, titulo, desc, icon: Icon }) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group bg-gray-800 hover:bg-gray-700/60 rounded-xl border border-gray-700 hover:border-habilitar-orange/70 p-4 transition"
    >
        <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-lg bg-habilitar-orange/15 flex items-center justify-center">
                <Icon className="w-5 h-5 text-habilitar-orange-light" />
            </div>
            <ExternalLink className="w-4 h-4 text-gray-600 group-hover:text-white transition" />
        </div>
        <h3 className="mt-3 font-semibold text-white">{titulo}</h3>
        <p className="text-xs text-gray-400 mt-1 leading-relaxed">{desc}</p>
    </a>
);

// Aviso compacto para endpoint que falhou (tabela inexistente, credencial etc.).
const SectionError = ({ message }) => (
    <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-3">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        {message}
    </p>
);

// --- Página -------------------------------------------------------------------

function DashboardPage() {
    usePageTitle('Dashboard');
    const [results, setResults] = useState({});
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);

    const load = useCallback(async () => {
        setSyncing(true);
        const endpoints = {
            leads: '/api/leads',
            marketing: '/api/marketing',
            mensagens: '/api/mensagens',
            criativos: '/api/criativos',
            produtos: '/api/produtos',
            fotos: '/api/fotos-perfil',
        };
        const entries = await Promise.all(
            Object.entries(endpoints).map(async ([key, url]) => {
                try {
                    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
                    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                    const json = await resp.json();
                    const data = Array.isArray(json.leads) ? json.leads
                        : Array.isArray(json.rows) ? json.rows
                        : [];
                    return [key, { ok: true, data }];
                } catch {
                    return [key, { ok: false }];
                }
            }),
        );
        setResults(Object.fromEntries(entries));
        setLastUpdated(new Date());
        setLoading(false);
        setSyncing(false);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const rows = useCallback(
        (key) => (results[key] && results[key].ok ? results[key].data : null),
        [results],
    );
    const failed = useCallback(
        (key) => results[key] != null && !results[key].ok,
        [results],
    );

    // --- Leads (mesma fonte e critério de dia UTC do /lead) ---

    const leadStats = useMemo(() => {
        const leads = rows('leads');
        if (!leads) return null;

        const now = new Date();
        const startOf = (daysAgo) => {
            const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            if (daysAgo) d.setUTCDate(d.getUTCDate() - daysAgo);
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

        // Gráfico: janela fixa dos últimos 14 dias (UTC).
        const buckets = [];
        const counts = new Map();
        for (let d = startOf(13); buckets.length < 14; d.setUTCDate(d.getUTCDate() + 1)) {
            const key = dayKey(d);
            counts.set(key, 0);
            buckets.push({ key, date: new Date(d), count: 0 });
        }
        leads.forEach((lead) => {
            const key = dayKey(new Date(lead.created_at));
            if (counts.has(key)) counts.set(key, counts.get(key) + 1);
        });
        buckets.forEach((b) => {
            b.count = counts.get(b.key);
        });

        const catMap = new Map();
        leads.forEach((lead) => {
            const c = parseProduto(lead.produto);
            catMap.set(c, (catMap.get(c) || 0) + 1);
        });
        const categorias = [...catMap.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5);

        return {
            total: leads.length,
            today: countToday,
            week: countWeek,
            month: countMonth,
            buckets,
            categorias,
            max: Math.max(1, ...buckets.map((b) => b.count)),
        };
    }, [rows]);

    // --- Mídia (Windsor → marketing_performance) ---
    // A tabela guarda histórico desde fev/2024, mas os leads só começaram
    // recentemente — dividir investimento TOTAL por leads daria um CPL sem
    // sentido. As métricas usam a janela DESDE O 1º LEAD (o total histórico
    // fica no hint da seção). "Dias com mídia" conta DATAS distintas: a
    // tabela é fato anúncio × dia, com várias linhas por dia.
    const marketingStats = useMemo(() => {
        const data = rows('marketing');
        if (!data) return null;

        // Dia UTC do lead mais antigo (limite inferior da janela).
        const leads = rows('leads');
        let minCreated = Infinity;
        (leads || []).forEach((lead) => {
            const t = new Date(lead.created_at).getTime();
            if (!Number.isNaN(t) && t < minCreated) minCreated = t;
        });
        const firstLeadDate = Number.isFinite(minCreated) ? dayKey(new Date(minCreated)) : null;

        let spendTotal = 0;
        let spend = 0;
        let clicks = 0;
        const dias = new Set();
        data.forEach((row) => {
            spendTotal += Number(row.spend) || 0;
            const d = dateOnly(row.date);
            if (!d) return;
            if (!firstLeadDate || d >= firstLeadDate) {
                spend += Number(row.spend) || 0;
                clicks += Number(row.clicks) || 0;
                dias.add(d);
            }
        });
        return { spend, clicks, spendTotal, dias: dias.size, firstLeadDate };
    }, [rows]);

    // CPL médio blended: investimento da janela dos leads ÷ total de leads.
    const blendedCpl = leadStats && marketingStats && leadStats.total > 0 && marketingStats.spend > 0
        ? marketingStats.spend / leadStats.total
        : null;

    // --- Conteúdo (mensagens, criativos, produtos, fotos) ---

    const conteudoStats = useMemo(() => {
        const STATUS_LABEL = { novo: 'Novos', aprovado: 'Aprovados', em_uso: 'Em uso', arquivado: 'Arquivados' };
        const criativos = rows('criativos');
        const produtos = rows('produtos');
        const fotos = rows('fotos');
        const mensagens = rows('mensagens');
        return {
            // /api/mensagens devolve todas (a gestão do /mensagens precisa das
            // inativas); o card do Dashboard mostra só as ativas.
            mensagens: mensagens ? mensagens.filter((m) => m.ativo).length : null,
            criativos: criativos
                ? {
                    total: criativos.length,
                    porStatus: Object.keys(STATUS_LABEL).map((s) => ({
                        key: s,
                        label: STATUS_LABEL[s],
                        count: criativos.filter((c) => (c.status || 'novo') === s).length,
                    })),
                }
                : null,
            produtos: produtos
                ? { total: produtos.length, ativos: produtos.filter((p) => p.ativo !== false).length }
                : null,
            fotos: fotos
                ? { total: fotos.length, ativas: fotos.filter((f) => f.ativo !== false).length }
                : null,
        };
    }, [rows]);

    const todayKey = dayKey(new Date());
    const skeleton = loading;

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
                        <h1 className="text-lg font-bold leading-tight">Visão Geral</h1>
                        <p className="text-xs text-gray-400">Métricas gerais da operação + índice de páginas</p>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
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

            <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">
                {/* Índice de páginas — cada card abre em nova aba */}
                <section className="space-y-4">
                    <div>
                        <h2 className="text-base font-semibold text-white">Páginas</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Cada card abre a página em uma nova aba</p>
                    </div>
                    {PAGE_GROUPS.map((group) => (
                        <div key={group.grupo}>
                            <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">{group.grupo}</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                {group.itens.map((item) => (
                                    <PageCard key={item.href} {...item} />
                                ))}
                            </div>
                        </div>
                    ))}
                </section>

                {/* Leads */}
                <section className="space-y-4">
                    <SectionHeader title="Leads" href="/lead" hint="Tabela leads do Supabase · tudo que já foi capturado" />
                    {skeleton ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="bg-gray-800 rounded-xl border border-gray-700 p-5 h-28 animate-pulse" />
                            ))}
                        </div>
                    ) : leadStats ? (
                        <>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <MetricCard title="Total de leads" value={leadStats.total} icon={Users} accent="text-blue-400" />
                                <MetricCard title="Hoje" value={leadStats.today} icon={CalendarDays} accent="text-yellow-400" />
                                <MetricCard title="Últimos 7 dias" value={leadStats.week} icon={TrendingUp} accent="text-green-400" />
                                <MetricCard title="Últimos 30 dias" value={leadStats.month} icon={DollarSign} accent="text-purple-400" />
                            </div>
                            <div className="grid lg:grid-cols-5 gap-4">
                                {/* Gráfico dos últimos 14 dias (mesmo visual do /lead) */}
                                <div className="lg:col-span-3 bg-gray-800 rounded-xl border border-gray-700 p-5">
                                    <h3 className="text-sm font-semibold text-gray-300 mb-4">Leads por dia · últimos 14 dias</h3>
                                    <div className="flex items-end gap-1.5 h-40">
                                        {leadStats.buckets.map((b) => {
                                            const isToday = b.key === todayKey;
                                            const height = b.count > 0 ? Math.max(8, (b.count / leadStats.max) * 100) : 2;
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
                                {/* Top 5 categorias */}
                                <div className="lg:col-span-2 bg-gray-800 rounded-xl border border-gray-700 p-5">
                                    <h3 className="text-sm font-semibold text-gray-300 mb-4">Leads por categoria · top 5</h3>
                                    {leadStats.categorias.length === 0 ? (
                                        <p className="text-sm text-gray-500">Sem dados ainda.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {leadStats.categorias.map(([name, count]) => {
                                                const pct = leadStats.total ? Math.round((count / leadStats.total) * 100) : 0;
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
                            </div>
                        </>
                    ) : (
                        <SectionError message="Sem dados de leads — verifique o endpoint /api/leads." />
                    )}
                </section>

                {/* Mídia */}
                <section className="space-y-4">
                    <SectionHeader
                        title="Mídia"
                        href="/meta-ads"
                        hint={marketingStats && marketingStats.firstLeadDate
                            ? `Janela: desde o 1º lead (${marketingStats.firstLeadDate.split('-').reverse().join('/')}) · histórico total: ${fmtBRL(marketingStats.spendTotal)}`
                            : 'marketing_performance (Windsor)'}
                    />
                    {skeleton ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="bg-gray-800 rounded-xl border border-gray-700 p-5 h-28 animate-pulse" />
                            ))}
                        </div>
                    ) : marketingStats ? (
                        <>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <MetricCard title="Investimento no período" value={fmtBRL(marketingStats.spend)} icon={DollarSign} accent="text-yellow-400" />
                                <MetricCard title="Cliques no período" value={Math.round(marketingStats.clicks)} icon={MousePointerClick} accent="text-blue-400" />
                                <MetricCard title="CPL médio" value={blendedCpl != null ? fmtBRL(blendedCpl) : '—'} icon={TrendingUp} accent="text-purple-400" />
                                <MetricCard title="Dias com mídia" value={marketingStats.dias} icon={CalendarDays} accent="text-green-400" />
                            </div>
                            {marketingStats.dias === 0 && (
                                <SectionError message="Sem linhas de mídia na janela dos leads — confira o sync do Windsor." />
                            )}
                        </>
                    ) : (
                        <SectionError message="Sem dados de mídia — a tabela marketing_performance ainda não existe ou o Windsor ainda não sincronizou." />
                    )}
                </section>

                {/* Conteúdo */}
                <section className="space-y-4">
                    <SectionHeader title="Conteúdo" hint="Bibliotecas que alimentam o atendimento e o tráfego" />
                    {skeleton ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="bg-gray-800 rounded-xl border border-gray-700 p-5 h-28 animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <MetricCard
                                    title="Mensagens ativas"
                                    value={conteudoStats.mensagens != null ? conteudoStats.mensagens : '—'}
                                    icon={MessageCircle}
                                    accent="text-green-400"
                                />
                                <MetricCard
                                    title="Criativos"
                                    value={conteudoStats.criativos ? conteudoStats.criativos.total : '—'}
                                    icon={Palette}
                                    accent="text-habilitar-orange-light"
                                />
                                <MetricCard
                                    title="Produtos (flyers)"
                                    value={conteudoStats.produtos ? `${conteudoStats.produtos.ativos} ativos / ${conteudoStats.produtos.total}` : '—'}
                                    icon={Package}
                                    accent="text-blue-400"
                                />
                                <MetricCard
                                    title="Fotos de perfil"
                                    value={conteudoStats.fotos ? `${conteudoStats.fotos.ativas} ativas / ${conteudoStats.fotos.total}` : '—'}
                                    icon={ImageIcon}
                                    accent="text-purple-400"
                                />
                            </div>

                            {/* Detalhe por status dos criativos */}
                            {conteudoStats.criativos && (
                                <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
                                    <div className="flex items-center justify-between gap-3 mb-4">
                                        <h3 className="text-sm font-semibold text-gray-300">Criativos por status</h3>
                                        <a
                                            href="/criativos"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition"
                                        >
                                            Biblioteca
                                            <ExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {conteudoStats.criativos.porStatus.map((s) => (
                                            <div key={s.key} className="bg-gray-700/50 rounded-lg px-4 py-3 flex items-center justify-between">
                                                <span className="text-sm text-gray-300">{s.label}</span>
                                                <span className="text-lg font-bold text-white">{s.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {failed('mensagens') && <SectionError message="Mensagens indisponíveis — /api/mensagens não respondeu." />}
                            {failed('criativos') && <SectionError message="Criativos indisponíveis — /api/criativos não respondeu." />}
                            {failed('produtos') && <SectionError message="Produtos indisponíveis — /api/produtos não respondeu." />}
                            {failed('fotos') && <SectionError message="Fotos de perfil indisponíveis — /api/fotos-perfil não respondeu." />}
                        </>
                    )}
                </section>
            </main>
        </div>
    );
}

export default DashboardPage;
