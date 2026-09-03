// =============================================================================
//  /criativos — Biblioteca de criativos para o gestor de tráfego (formato tabela)
// =============================================================================
//  Mesmo padrão visual do /imagens: tabela com mídia, copy expansível (clique
//  na célula), status e ações. A mídia vive no bucket "criativos" do Supabase
//  Storage; a copy vem dos anúncios que já rodaram (fonte: Windsor.ai →
//  marketing_performance — body = texto principal, title = headline).
//
//  - Imagem: clique na thumb amplia (lightbox).
//  - Vídeo: clique na thumb abre o player em overlay (play nativo, streaming
//    direto do Storage).
//  - Copiar copy: texto principal + headline + descrição formatados para
//    colar no Gerenciador de Anúncios.
//  - Decisão do Alex em 2026-09-03: página aberta, sem token (mesmo padrão
//    do /imagens) — leitura E escrita. O upload vai DIRETO ao Storage via
//    signed upload URL com barra de progresso (a função da Vercel limita
//    corpo a ~4,5MB).
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import usePageTitle from './lib/usePageTitle';
import { useNavigate } from 'react-router-dom';
import {
    AlertCircle,
    ArrowDownToLine,
    Check,
    ClipboardCopy,
    Film,
    Image as ImageIcon,
    Inbox,
    Pencil,
    Plus,
    RefreshCw,
    X,
} from 'lucide-react';

export const STATUS_OPTIONS = [
    { id: 'novo', label: 'Novo', chip: 'bg-blue-900/60 text-blue-300' },
    { id: 'aprovado', label: 'Aprovado', chip: 'bg-green-900/60 text-green-300' },
    { id: 'em_uso', label: 'Em uso', chip: 'bg-habilitar-orange/20 text-habilitar-orange-light' },
    { id: 'arquivado', label: 'Arquivado', chip: 'bg-gray-700 text-gray-300' },
];

const TIPO_OPTIONS = [
    { id: 'todos', label: 'Todos' },
    { id: 'imagem', label: 'Imagens' },
    { id: 'video', label: 'Vídeos' },
];

const thClass = 'px-4 py-3 font-medium whitespace-nowrap';
const tdClass = 'px-4 py-2.5 align-middle';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** Copy completa formatada para colar no Gerenciador de Anúncios. */
function copyCompleta(c) {
    const parts = [];
    if (c.texto_principal) parts.push(`TEXTO PRINCIPAL:\n${c.texto_principal}`);
    if (c.headline) parts.push(`TÍTULO (HEADLINE):\n${c.headline}`);
    if (c.descricao) parts.push(`DESCRIÇÃO:\n${c.descricao}`);
    return parts.join('\n\n');
}

function fmtData(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('pt-BR');
    } catch {
        return '';
    }
}

// Copiar para a área de transferência com feedback "Copiado!" por 2s
// (por key, para vários botões independentes na mesma tela).
export function useCopiar() {
    const [copiadoKey, setCopiadoKey] = useState(null);
    const timer = useRef(null);

    const copiar = useCallback((key, texto) => {
        const done = () => {
            setCopiadoKey(key);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopiadoKey(null), 2000);
        };
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(texto).then(done).catch(done);
        } else {
            const ta = document.createElement('textarea');
            ta.value = texto;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            done();
        }
    }, []);

    return { copiadoKey, copiar };
}

// --------------------------------------------------------------------------
// Overlays: player de vídeo (clique na thumb) e lightbox de imagem
// --------------------------------------------------------------------------

function MediaOverlay({ criativo, onClose }) {
    const éVideo = criativo.tipo === 'video';

    // Esc fecha o player/lightbox
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90 p-4"
            onClick={onClose}
        >
            {éVideo ? (
                // Play nativo: streaming direto do Storage do Supabase
                <video
                    src={criativo.arquivo_url}
                    controls
                    autoPlay
                    playsInline
                    className="max-h-[80vh] max-w-[94vw] rounded-lg bg-black"
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <img
                    src={criativo.arquivo_url}
                    alt={criativo.titulo}
                    className="max-h-[80vh] max-w-[94vw] rounded-lg object-contain"
                    onClick={(e) => e.stopPropagation()}
                />
            )}
            <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                <p className="text-sm font-medium text-white">{criativo.titulo}</p>
                <a
                    href={criativo.arquivo_url}
                    target="_blank"
                    rel="noreferrer"
                    download={criativo.arquivo_nome || true}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-600 bg-gray-800 px-2.5 py-1.5 text-xs text-gray-300 transition hover:text-white"
                >
                    <ArrowDownToLine className="h-3.5 w-3.5" />
                    Baixar
                </a>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-gray-600 bg-gray-800 p-1.5 text-gray-300 transition hover:text-white"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}

// --------------------------------------------------------------------------
// Helpers compartilhados com o editor de página inteira (CriativosEditar.jsx)
// --------------------------------------------------------------------------

export const inputCls =
    'h-10 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 text-sm text-white placeholder-gray-500 outline-none focus:border-habilitar-orange [color-scheme:dark]';
export const textareaCls =
    'w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-habilitar-orange resize-y';

// --------------------------------------------------------------------------
// Página — tabela de criativos (mesmo padrão do /imagens)
// --------------------------------------------------------------------------
// --------------------------------------------------------------------------

export default function Criativos() {
    usePageTitle('Criativos');
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState(null);

    // Filtros
    const [tipo, setTipo] = useState('todos');
    const [status, setStatus] = useState('todos');
    const [busca, setBusca] = useState('');

    // Copys expandidas na tabela (clique na célula alterna prévia/texto cheio)
    const [copysAbertas, setCopysAbertas] = useState(() => new Set());

    // Overlays
    const [midiaAberta, setMidiaAberta] = useState(null); // criativo em player/lightbox
    const [salvando, setSalvando] = useState(false);

    const { copiadoKey, copiar } = useCopiar();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/criativos', { headers: { Accept: 'application/json' } });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
            setRows(body.rows || []);
            setLastUpdated(new Date());
            setError('');
        } catch (err) {
            setError(`Não foi possível carregar os criativos (${err.message}).`);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const onVisible = () => {
            if (document.visibilityState === 'visible') load();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [load]);

    const alternarCopyAberta = useCallback((id) => {
        setCopysAbertas((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // Executa uma mutação e recarrega; falha aparece no box do topo.
    const mutar = async (fn) => {
        setSalvando(true);
        setError('');
        try {
            await fn();
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setSalvando(false);
        }
    };

    async function mudarStatus(c, novo) {
        try {
            await mutar(() =>
                fetch(`/api/criativos?id=${encodeURIComponent(c.id)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: novo }),
                }).then(async (res) => {
                    const body = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
                }),
            );
        } catch (err) {
            setError(err.message);
        }
    }

    const filtrados = rows.filter((c) => {
        if (tipo !== 'todos' && c.tipo !== tipo) return false;
        if (status !== 'todos' && c.status !== status) return false;
        const q = busca.trim().toLowerCase();
        if (!q) return true;
        return [c.titulo, c.headline, c.texto_principal, c.descricao, c.ad_name, c.campaign, c.observacoes, c.arquivo_nome]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(q));
    });

    const contagem = {
        imagem: rows.filter((c) => c.tipo === 'imagem').length,
        video: rows.filter((c) => c.tipo === 'video').length,
    };

    return (
        <div className="min-h-screen bg-gray-900 font-sans text-white">
            {/* Header */}
            <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-4">
                    <img
                        src="/assets/images/logo-autoescola-habilitar.webp"
                        alt="Autoescola Habilitar"
                        className="h-10"
                    />
                    <div>
                        <h1 className="text-lg font-bold leading-tight">Criativos</h1>
                        <p className="text-xs text-gray-400">
                            Biblioteca para o gestor de tráfego
                        </p>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                        {rows.length > 0 && (
                            <span className="hidden rounded-full bg-green-900/60 px-3 py-1 text-xs font-medium text-green-300 sm:block">
                                {rows.length} criativos · {contagem.video} vídeos
                            </span>
                        )}
                        <a
                            href="/meta-ads"
                            className="hidden h-10 items-center rounded-lg border border-gray-600 bg-gray-700 px-3 text-sm text-gray-300 transition hover:border-gray-500 hover:text-white sm:flex"
                        >
                            Mídia
                        </a>
                        <a
                            href="/lead"
                            className="hidden h-10 items-center rounded-lg border border-gray-600 bg-gray-700 px-3 text-sm text-gray-300 transition hover:border-gray-500 hover:text-white sm:flex"
                        >
                            Leads
                        </a>

                        <button
                            type="button"
                            onClick={() => navigate('/criativos/novo')}
                            className="flex h-10 items-center gap-2 rounded-lg bg-habilitar-orange px-3 text-sm font-semibold text-white transition hover:brightness-110"
                        >
                            <Plus className="h-4 w-4" />
                            Subir criativo
                        </button>

                        <button
                            type="button"
                            onClick={() => load()}
                            title="Atualizar"
                            className="flex h-10 items-center gap-2 rounded-lg bg-gray-800 px-3 text-sm font-semibold text-white transition hover:brightness-110"
                        >
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                            Atualizar
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl space-y-4 px-4 py-6">
                {error && (
                    <div
                        className="flex items-start gap-2 rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-200"
                    >
                        <AlertCircle size={17} className="mt-0.5 shrink-0" />
                        <span className="grow">{error}</span>
                        <button
                            type="button"
                            onClick={() => setError('')}
                            className="shrink-0 opacity-70 transition hover:opacity-100"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )}

                {/* ── Tabela de criativos ─────────────────────────────────── */}
                <section className="space-y-4">
                    {/* Filtros */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                            {TIPO_OPTIONS.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setTipo(t.id)}
                                    className={`h-9 rounded-lg border px-3 text-sm transition ${
                                        tipo === t.id
                                            ? 'border-habilitar-orange bg-habilitar-orange/10 text-white'
                                            : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                                    }`}
                                >
                                    {t.label}
                                    <span className="ml-1.5 text-xs text-gray-400">
                                        {t.id === 'todos' ? rows.length : contagem[t.id] ?? 0}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => setStatus('todos')}
                                className={`h-9 rounded-lg border px-3 text-sm transition ${
                                    status === 'todos'
                                        ? 'border-gray-400 bg-gray-600 text-white'
                                        : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                                }`}
                            >
                                Todos os status
                            </button>
                            {STATUS_OPTIONS.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => setStatus(s.id)}
                                    className={`h-9 rounded-lg border px-3 text-sm transition ${
                                        status === s.id ? `${s.chip} border-transparent` : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                                    }`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex h-9 min-w-[200px] max-w-sm flex-1 items-center gap-2 rounded-lg border border-gray-600 bg-gray-700 px-3">
                            <input
                                type="search"
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                placeholder="Buscar por título, copy, anúncio…"
                                className="w-full bg-transparent text-sm text-white placeholder-gray-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-gray-700 bg-gray-800">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-700 text-left text-xs uppercase tracking-wider text-gray-400">
                                    <th className={`${thClass} w-28`}>Mídia</th>
                                    <th className={`${thClass} w-[18%]`}>Título</th>
                                    <th className={thClass}>Copy</th>
                                    <th className={`${thClass} whitespace-nowrap text-center`}>Criado</th>
                                    <th className={`${thClass} whitespace-nowrap text-center`}>Atualizado</th>
                                    <th className={`${thClass} text-center`}>Status</th>
                                    <th className={`${thClass} text-right`}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    Array.from({ length: 6 }).map((_, i) => (
                                        <tr key={i} className="border-b border-gray-800 last:border-0">
                                            <td className={tdClass} colSpan={7}>
                                                <div className="h-20 animate-pulse rounded bg-gray-700" />
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    filtrados.map((c) => {
                                        const aberta = copysAbertas.has(c.id);
                                        const copiado = copiadoKey === c.id;
                                        const temCopy = Boolean(c.headline || c.texto_principal || c.descricao);
                                        return (
                                            <tr
                                                key={c.id}
                                                className={`border-b border-gray-800 align-middle transition-colors last:border-0 hover:bg-gray-700/40 ${
                                                    c.status === 'arquivado' ? 'opacity-60' : ''
                                                }`}
                                            >
                                                {/* Mídia */}
                                                <td className={tdClass}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setMidiaAberta(c)}
                                                        title={c.tipo === 'video' ? 'Assistir vídeo' : 'Ampliar imagem'}
                                                        className="group relative block h-20 w-16 overflow-hidden rounded-lg border border-gray-600 transition hover:border-habilitar-orange"
                                                    >
                                                        {c.tipo === 'video' ? (
                                                            // preload=metadata mostra o primeiro quadro como thumb
                                                            <video
                                                                src={c.arquivo_url}
                                                                preload="metadata"
                                                                muted
                                                                playsInline
                                                                className="h-full w-full bg-black object-cover"
                                                            />
                                                        ) : (
                                                            <img
                                                                src={c.arquivo_url}
                                                                alt={c.titulo}
                                                                loading="lazy"
                                                                className="h-full w-full object-cover"
                                                            />
                                                        )}
                                                        {c.tipo === 'video' && (
                                                            <span className="absolute inset-0 flex items-center justify-center bg-black/30 transition group-hover:bg-black/10">
                                                                <Film className="h-5 w-5 text-white drop-shadow" />
                                                            </span>
                                                        )}
                                                        {c.tipo === 'imagem' && (
                                                            <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                                                                <ImageIcon className="h-5 w-5 text-white drop-shadow" />
                                                            </span>
                                                        )}
                                                    </button>
                                                </td>

                                                {/* Título */}
                                                <td className={`${tdClass} max-w-[280px] font-medium leading-snug text-white`}>
                                                    {c.titulo}
                                                    <span className="mt-1 block text-[11px] font-normal text-gray-500">
                                                        {c.formato || (c.tipo === 'video' ? 'vídeo' : 'imagem')}
                                                    </span>
                                                    {c.observacoes ? (
                                                        <span className="mt-1 block text-[11px] font-normal text-yellow-200/80">
                                                            {c.observacoes}
                                                        </span>
                                                    ) : null}
                                                </td>

                                                {/* Copy — clique expande/recolhe (padrão /imagens) */}
                                                <td className={`${tdClass} text-gray-300`}>
                                                    {temCopy ? (
                                                        <div
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={() => alternarCopyAberta(c.id)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter' || e.key === ' ') alternarCopyAberta(c.id);
                                                            }}
                                                            title={aberta ? 'Clique para recolher' : 'Clique para ver a copy completa'}
                                                            className={`cursor-pointer select-none text-xs leading-relaxed ${
                                                                aberta ? '' : 'line-clamp-4'
                                                            }`}
                                                        >
                                                            {c.headline && (
                                                                <span className="mb-0.5 block font-semibold text-white">{c.headline}</span>
                                                            )}
                                                            {c.texto_principal && (
                                                                <span className="whitespace-pre-line">{c.texto_principal}</span>
                                                            )}
                                                            {c.descricao && (
                                                                <span className="mt-0.5 block text-gray-500">{c.descricao}</span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-gray-500">Sem copy cadastrada</span>
                                                    )}
                                                </td>

                                                {/* Criado / Atualizado (tooltip com hora completa) */}
                                                <td
                                                    className={`${tdClass} whitespace-nowrap text-center text-xs text-gray-400`}
                                                    title={c.criado_em ? new Date(c.criado_em).toLocaleString('pt-BR') : undefined}
                                                >
                                                    {fmtData(c.criado_em) || '—'}
                                                </td>
                                                <td
                                                    className={`${tdClass} whitespace-nowrap text-center text-xs text-gray-400`}
                                                    title={c.atualizado_em ? new Date(c.atualizado_em).toLocaleString('pt-BR') : undefined}
                                                >
                                                    {fmtData(c.atualizado_em) || '—'}
                                                </td>

                                                {/* Status */}
                                                <td className={`${tdClass} text-center`}>
                                                    <select
                                                        value={c.status}
                                                        onChange={(e) => mudarStatus(c, e.target.value)}
                                                        disabled={salvando}
                                                        title="Mudar status"
                                                        className="h-8 rounded-lg border border-gray-600 bg-gray-700 text-xs text-gray-200 [color-scheme:dark] outline-none disabled:opacity-50"
                                                    >
                                                        {STATUS_OPTIONS.map((s) => (
                                                            <option key={s.id} value={s.id}>{s.label}</option>
                                                        ))}
                                                    </select>
                                                </td>

                                                {/* Ações — baixar/excluir ficam na página de edição */}
                                                <td className={tdClass}>
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => copiar(c.id, copyCompleta(c))}
                                                            disabled={!temCopy}
                                                            title="Copiar copy completa (texto principal + headline + descrição)"
                                                            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                                                                copiado
                                                                    ? 'bg-green-600 text-white'
                                                                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                                            }`}
                                                        >
                                                            {copiado ? <Check size={13} /> : <ClipboardCopy size={13} />}
                                                            {copiado ? 'Copiado!' : 'Copiar copy'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => navigate(`/criativos/${c.id}`)}
                                                            disabled={salvando}
                                                            title="Editar (título, copy, referências, status, baixar e excluir)"
                                                            className="rounded-lg bg-gray-700 p-2 text-gray-300 transition hover:bg-gray-600 disabled:opacity-50"
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {!loading && filtrados.length === 0 && (
                        <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-800 bg-gray-800/40 p-8 text-center">
                            <Inbox className="h-9 w-9 text-gray-600" />
                            <p className="text-sm text-gray-400">
                                {rows.length === 0
                                    ? 'Nenhum criativo publicado ainda.'
                                    : 'Nenhum criativo corresponde aos filtros.'}
                            </p>
                            {rows.length === 0 ? (
                                <button
                                    type="button"
                                    onClick={() => navigate('/criativos/novo')}
                                    className="flex h-10 items-center gap-2 rounded-lg bg-habilitar-orange px-4 text-sm font-semibold text-white transition hover:brightness-110"
                                >
                                    <Plus className="h-4 w-4" />
                                    Subir o primeiro
                                </button>
                            ) : null}
                        </div>
                    )}

                    {lastUpdated && (
                        <p className="text-center text-xs text-gray-600">
                            Atualizado às {lastUpdated.toLocaleTimeString('pt-BR')} · mídia no bucket “criativos” · copy dos
                            anúncios via Windsor.ai
                        </p>
                    )}
                </section>
            </main>

            {/* Player/lightbox da mídia */}
            {midiaAberta ? (
                <MediaOverlay
                    criativo={midiaAberta}
                    onClose={() => {
                        setMidiaAberta(null);
                        load(); // recarrega ao fechar (atualiza thumbnail do vídeo)
                    }}
                />
            ) : null}
        </div>
    );
}
