// =============================================================================
//  /imagens — produtos & orçamentos + foto perfil WhatsApp (formato tabela)
// =============================================================================
//  Duas seções alimentadas pelo Supabase (RLS sem policies; a leitura passa
//  pelos endpoints /api/produtos e /api/fotos-perfil com service_role):
//
//   1. Produtos & Orçamentos — tabela com a imagem do orçamento (flyer no
//      bucket "imagens/produtos/"), nome, resumo dos valores e a copy de
//      WhatsApp em texto PURO com formatação nativa (*negrito*, _itálico_...).
//      A célula da copy expande/recolhe com um clique. Criar/editar abre uma
//      página própria de tela cheia (ImagensEditar.jsx — /imagens/produto/:id,
//      /imagens/foto/:id e as variantes /novo) com imagem grande e a copy
//      completa; o botão "Copiar copy" mora lá.
//   2. Foto perfil WhatsApp — tabela com a foto, o preview circular como
//      aparece no app, copiar link e abrir em tamanho real.
//
//  Decisão do Alex em 2026-09-03: página aberta, sem token. No editor, o
//  arquivo vai DIRETO ao Storage via signed upload URL com barra de
//  progresso (mesmo fluxo do /criativos) — a service_role nunca vai ao
//  client.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import usePageTitle from './lib/usePageTitle'
import {
    AlertTriangle, Check, Copy, ExternalLink, Pencil, Plus, RefreshCw,
    Trash2, X,
} from 'lucide-react'

// -----------------------------------------------------------------------------
// Utilidades — compartilhadas com o editor de página inteira (ImagensEditar.jsx)
// -----------------------------------------------------------------------------

export const inputClass =
    'w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-400 outline-none focus:border-habilitar-orange'
export const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400'

const thClass = 'px-4 py-3 font-medium whitespace-nowrap'
const tdClass = 'px-4 py-2.5 align-middle'

export async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`)
    return json
}

function StatusBadge({ ativo }) {
    return (
        <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                ativo ? 'bg-green-900/60 text-green-300' : 'bg-gray-700 text-gray-300'
            }`}
        >
            {ativo ? 'Ativo' : 'Inativo'}
        </span>
    )
}

// Copiar para a área de transferência com feedback "Copiado!" por 2s
// (por key, para vários botões independentes na mesma tela).
export function useCopiar() {
    const [copiadoKey, setCopiadoKey] = useState(null)
    const copyTimer = useRef(null)

    const copiarTexto = useCallback((key, texto) => {
        const done = () => {
            setCopiadoKey(key)
            clearTimeout(copyTimer.current)
            copyTimer.current = setTimeout(() => setCopiadoKey(null), 2000)
        }
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(texto).then(done).catch(done)
        } else {
            const ta = document.createElement('textarea')
            ta.value = texto
            document.body.appendChild(ta)
            ta.select()
            document.execCommand('copy')
            ta.remove()
            done()
        }
    }, [])

    return { copiadoKey, copiarTexto }
}

// -----------------------------------------------------------------------------
// Modal de confirmação — usado nas exclusões da tabela e do editor
// -----------------------------------------------------------------------------

export function ModalConfirmacao({
    aberto,
    titulo,
    detalhe,
    onConfirmar,
    onFechar,
    confirmarTexto = 'Excluir',
    perigo = true,
}) {
    useEffect(() => {
        if (!aberto) return
        const onKey = (e) => { if (e.key === 'Escape') onFechar() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [aberto, onFechar])

    if (!aberto) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/70" onClick={onFechar} />
            <div className="relative w-full max-w-md rounded-2xl border border-gray-700 bg-gray-800 p-6 shadow-2xl">
                <h3 className="text-base font-bold text-white">{titulo}</h3>
                {detalhe && (
                    <p className="mt-2 text-sm leading-relaxed text-gray-400">{detalhe}</p>
                )}
                <div className="mt-6 flex justify-end gap-2">
                    <button
                        onClick={onFechar}
                        className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:bg-gray-600"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirmar}
                        className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${
                            perigo ? 'bg-red-600 hover:bg-red-500' : 'bg-habilitar-orange hover:brightness-110'
                        }`}
                    >
                        {confirmarTexto}
                    </button>
                </div>
            </div>
        </div>
    )
}

// -----------------------------------------------------------------------------
// Modal de imagem (lightbox) — clique na miniatura da tabela abre em tamanho
// real; fecha com Esc, no botão "Fechar" ou clicando no fundo escurecido.
// -----------------------------------------------------------------------------

export function ModalImagem({ src, alt, onFechar }) {
    useEffect(() => {
        if (!src) return
        const onKey = (e) => { if (e.key === 'Escape') onFechar() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [src, onFechar])

    if (!src) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/80" onClick={onFechar} />
            <div className="relative flex max-h-full w-full max-w-5xl flex-col items-center">
                <button
                    onClick={onFechar}
                    title="Fechar (Esc)"
                    className="mb-2 flex items-center gap-1.5 self-end rounded-lg bg-gray-800/90 px-3 py-1.5 text-sm font-semibold text-gray-200 shadow transition hover:bg-gray-700"
                >
                    <X size={15} />
                    Fechar
                </button>
                <img
                    src={src}
                    alt={alt}
                    className="max-h-[78vh] w-auto max-w-full rounded-xl border border-gray-600 bg-gray-900 object-contain shadow-2xl"
                />
                {alt && (
                    <p className="mt-2 max-w-full truncate px-2 text-center text-xs text-gray-400">{alt}</p>
                )}
            </div>
        </div>
    )
}

// -----------------------------------------------------------------------------
// Página — tabelas de produtos e fotos (edição em /imagens/produto|foto/:id)
// -----------------------------------------------------------------------------

export default function Imagens() {
    usePageTitle('Imagens');
    const navigate = useNavigate()
    const [produtos, setProdutos] = useState([])
    const [fotos, setFotos] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [lastUpdated, setLastUpdated] = useState(null)

    // Imagem aberta no lightbox: { src, alt }
    const [imagemAberta, setImagemAberta] = useState(null)

    // Copys expandidas na tabela (clique na célula alterna prévia/texto cheio)
    const [copysAbertas, setCopysAbertas] = useState(() => new Set())

    const { copiadoKey, copiarTexto } = useCopiar()

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const [prodResp, fotoResp] = await Promise.all([
                fetch('/api/produtos', { headers: { Accept: 'application/json' } }),
                fetch('/api/fotos-perfil', { headers: { Accept: 'application/json' } }),
            ])
            if (!prodResp.ok || !fotoResp.ok) throw new Error(`HTTP ${prodResp.status}/${fotoResp.status}`)
            const [prodJson, fotoJson] = await Promise.all([prodResp.json(), fotoResp.json()])
            setProdutos(Array.isArray(prodJson.rows) ? prodJson.rows : [])
            setFotos(Array.isArray(fotoJson.rows) ? fotoJson.rows : [])
            setError(null)
            setLastUpdated(new Date())
        } catch {
            setError(
                'Sem dados — verifique se as tabelas "produtos" e "fotos_perfil" já existem ' +
                '(rode supabase/sql/2026-09-03-produtos-imagens.sql no SQL Editor do Supabase).',
            )
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
        const onVisible = () => { if (!document.hidden) load() }
        document.addEventListener('visibilitychange', onVisible)
        return () => document.removeEventListener('visibilitychange', onVisible)
    }, [load])

    const alternarCopyAberta = useCallback((id) => {
        setCopysAbertas((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    const produtosAtivos = produtos.filter((p) => p.ativo).length

    return (
        <div className="min-h-screen bg-gray-900 font-sans text-white">
            <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-4">
                    <img
                        src="/assets/images/logo-autoescola-habilitar.webp"
                        alt="Autoescola Habilitar"
                        className="h-10"
                    />
                    <div>
                        <h1 className="text-lg font-bold leading-tight">Imagens</h1>
                        <p className="text-xs text-gray-400">
                            Produtos & orçamentos + foto perfil WhatsApp
                        </p>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                        {produtos.length > 0 && (
                            <span className="rounded-full bg-green-900/60 px-3 py-1 text-xs font-medium text-green-300">
                                {produtosAtivos}/{produtos.length} produtos · {fotos.length} fotos
                            </span>
                        )}
                        <button
                            onClick={load}
                            className="flex items-center gap-2 rounded-lg bg-habilitar-orange px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                        >
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                            Atualizar
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl space-y-10 px-4 py-6">
                {error && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-200">
                        <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* ── Seção 1: Produtos & Orçamentos ─────────────────────────── */}
                <section className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">
                                Produtos & Orçamentos
                            </h2>
                            <p className="text-xs text-gray-500">
                                Imagem do orçamento + copy pronta para colar no WhatsApp (clique na copy para expandir)
                            </p>
                        </div>
                        <button
                            onClick={() => navigate('/imagens/produto/novo')}
                            className="flex items-center gap-2 rounded-lg bg-habilitar-orange px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                        >
                            <Plus size={15} />
                            Novo produto
                        </button>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-gray-700 bg-gray-800">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-700 text-left text-xs uppercase tracking-wider text-gray-400">
                                    <th className={`${thClass} w-28`}>Imagem</th>
                                    <th className={`${thClass} w-[20%]`}>Produto</th>
                                    <th className={thClass}>Plano</th>
                                    <th className={thClass}>Orçamento</th>
                                    <th className={`${thClass} w-[17%]`}>Copy</th>
                                    <th className={`${thClass} text-center`}>Ordem</th>
                                    <th className={`${thClass} text-center`}>Status</th>
                                    <th className={`${thClass} text-right`}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    Array.from({ length: 4 }).map((_, i) => (
                                        <tr key={i} className="border-b border-gray-800 last:border-0">
                                            <td className={tdClass} colSpan={8}>
                                                <div className="h-24 animate-pulse rounded bg-gray-700" />
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    produtos.map((p) => {
                                        const aberta = copysAbertas.has(p.id)
                                        return (
                                            <tr
                                                key={p.id}
                                                className={`border-b border-gray-800 align-middle transition-colors last:border-0 hover:bg-gray-700/40 ${
                                                    !p.ativo ? 'opacity-60' : ''
                                                }`}
                                            >
                                                <td className={tdClass}>
                                                    <button
                                                        onClick={() => setImagemAberta({ src: p.imagem_url, alt: [p.produto, p.plano].filter(Boolean).join(' — ') })}
                                                        title="Ver imagem em tamanho real"
                                                        className="block cursor-zoom-in"
                                                    >
                                                        <img
                                                            src={p.imagem_url}
                                                            alt={p.produto}
                                                            loading="lazy"
                                                            className="h-24 w-20 rounded-lg border border-gray-600 object-cover transition hover:border-habilitar-orange"
                                                        />
                                                    </button>
                                                </td>
                                                <td className={`${tdClass} max-w-[320px] font-medium leading-snug text-white`}>
                                                    {p.produto || p.nome}
                                                </td>
                                                <td className={`${tdClass} whitespace-nowrap`}>
                                                    {p.plano ? (
                                                        <span className="inline-block rounded-full bg-gray-700 px-2.5 py-0.5 text-[11px] font-medium text-gray-200">
                                                            {p.plano}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-500">—</span>
                                                    )}
                                                </td>
                                                <td className={`${tdClass} whitespace-nowrap`}>
                                                    {p.orcamento ? (
                                                        <span className="inline-block rounded-full bg-habilitar-orange/20 px-2.5 py-0.5 text-[11px] font-medium text-habilitar-orange-light">
                                                            {p.orcamento}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-500">—</span>
                                                    )}
                                                </td>
                                                <td className={`${tdClass} text-gray-300`}>
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => alternarCopyAberta(p.id)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') alternarCopyAberta(p.id)
                                                        }}
                                                        title={aberta ? 'Clique para recolher' : 'Clique para ver a copy completa'}
                                                        className={`cursor-pointer select-none whitespace-pre-wrap text-xs leading-relaxed ${
                                                            aberta ? '' : 'line-clamp-4'
                                                        }`}
                                                    >
                                                        {p.copy || <span className="text-gray-500">(sem copy)</span>}
                                                    </div>
                                                </td>
                                                <td className={`${tdClass} text-center text-gray-500`}>{p.ordem}</td>
                                                <td className={`${tdClass} text-center`}>
                                                    <StatusBadge ativo={p.ativo} />
                                                </td>
                                                <td className={tdClass}>
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            onClick={() => navigate(`/imagens/produto/${p.id}`)}
                                                            title="Editar (copiar copy, ajustar nome/valores, trocar imagem, excluir)"
                                                            className="rounded-lg bg-gray-700 p-2 text-gray-300 transition hover:bg-gray-600"
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {!loading && produtos.length === 0 && (
                        <p className="rounded-xl border border-gray-800 bg-gray-800/40 p-6 text-center text-sm text-gray-400">
                            Nenhum produto cadastrado — clique em “Novo produto” ou rode{' '}
                            <code className="rounded bg-gray-900 px-1.5 py-0.5 text-xs">
                                node scripts/seed-imagens.mjs
                            </code>{' '}
                            para importar os orçamentos que já estão na sua pasta de Downloads.
                        </p>
                    )}
                </section>

                {/* ── Seção 2: Foto perfil WhatsApp ──────────────────────────── */}
                <section className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">
                                Foto perfil WhatsApp
                            </h2>
                            <p className="text-xs text-gray-500">
                                Fotos de perfil do WhatsApp da Autoescola — “No app” mostra como fica recortada em círculo
                            </p>
                        </div>
                        <button
                            onClick={() => navigate('/imagens/foto/novo')}
                            className="flex items-center gap-2 rounded-lg bg-habilitar-orange px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                        >
                            <Plus size={15} />
                            Nova foto
                        </button>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-gray-700 bg-gray-800">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-700 text-left text-xs uppercase tracking-wider text-gray-400">
                                    <th className={`${thClass} w-24`}>Foto</th>
                                    <th className={`${thClass} w-28`}>No app</th>
                                    <th className={thClass}>Nome</th>
                                    <th className={`${thClass} text-center`}>Ordem</th>
                                    <th className={`${thClass} text-center`}>Status</th>
                                    <th className={`${thClass} text-right`}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    Array.from({ length: 3 }).map((_, i) => (
                                        <tr key={i} className="border-b border-gray-800 last:border-0">
                                            <td className={tdClass} colSpan={6}>
                                                <div className="h-14 animate-pulse rounded bg-gray-700" />
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    fotos.map((f) => {
                                        const copiado = copiadoKey === `f-${f.id}`
                                        const rotulo = f.nome || 'Sem nome'
                                        return (
                                            <tr
                                                key={f.id}
                                                className={`border-b border-gray-800 transition-colors last:border-0 hover:bg-gray-700/40 ${
                                                    !f.ativo ? 'opacity-60' : ''
                                                }`}
                                            >
                                                <td className={tdClass}>
                                                    <button
                                                        onClick={() => setImagemAberta({ src: f.imagem_url, alt: rotulo })}
                                                        title="Ver imagem em tamanho real"
                                                        className="block cursor-zoom-in"
                                                    >
                                                        <img
                                                            src={f.imagem_url}
                                                            alt={rotulo}
                                                            loading="lazy"
                                                            className="h-14 w-14 rounded-lg border border-gray-600 object-cover transition hover:border-habilitar-orange"
                                                        />
                                                    </button>
                                                </td>
                                                <td className={tdClass}>
                                                    <span className="inline-block h-11 w-11 overflow-hidden rounded-full ring-2 ring-[#00a884]">
                                                        <img
                                                            src={f.imagem_url}
                                                            alt=""
                                                            loading="lazy"
                                                            className="h-full w-full object-cover"
                                                        />
                                                    </span>
                                                </td>
                                                <td className={`${tdClass} font-medium text-white`}>{rotulo}</td>
                                                <td className={`${tdClass} text-center text-gray-500`}>{f.ordem}</td>
                                                <td className={`${tdClass} text-center`}>
                                                    <StatusBadge ativo={f.ativo} />
                                                </td>
                                                <td className={tdClass}>
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            onClick={() => copiarTexto(`f-${f.id}`, f.imagem_url)}
                                                            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                                                                copiado
                                                                    ? 'bg-green-600 text-white'
                                                                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                                            }`}
                                                        >
                                                            {copiado ? <Check size={13} /> : <Copy size={13} />}
                                                            {copiado ? 'Copiado!' : 'Copiar link'}
                                                        </button>
                                                        <a
                                                            href={f.imagem_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            title="Abrir imagem"
                                                            className="rounded-lg bg-gray-700 p-2 text-gray-300 transition hover:bg-gray-600"
                                                        >
                                                            <ExternalLink size={14} />
                                                        </a>
                                                        <button
                                                            onClick={() => navigate(`/imagens/foto/${f.id}`)}
                                                            title="Editar (nome, ordem, trocar imagem, excluir)"
                                                            className="rounded-lg bg-gray-700 p-2 text-gray-300 transition hover:bg-gray-600"
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {!loading && fotos.length === 0 && (
                        <p className="rounded-xl border border-gray-800 bg-gray-800/40 p-6 text-center text-sm text-gray-400">
                            Nenhuma foto de perfil cadastrada — clique em “Nova foto”.
                        </p>
                    )}
                </section>

                {lastUpdated && (
                    <p className="text-center text-xs text-gray-600">
                        Atualizado às {lastUpdated.toLocaleTimeString('pt-BR')}
                    </p>
                )}
            </main>

            <ModalImagem
                src={imagemAberta?.src}
                alt={imagemAberta?.alt}
                onFechar={() => setImagemAberta(null)}
            />
        </div>
    )
}
