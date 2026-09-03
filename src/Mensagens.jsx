// =============================================================================
//  /mensagens — biblioteca de scripts de WhatsApp (formato tabela)
// =============================================================================
//  Lê /api/mensagens (service_role; a tabela tem RLS sem policies) e mostra
//  as mensagens numa tabela de gestão (mesmo padrão do /imagens): título,
//  categoria, prévia da mensagem (clique expande/recolhe), ordem e status.
//  O botão de olho abre um MODAL com o mockup de celular do WhatsApp — a
//  simulação fiel de como o lead recebe (bolha branca) ou como você envia
//  (bolha verde com tiques). Editar/criar abre a página dedicada
//  MensagensEditar.jsx (/mensagens/:id e /mensagens/novo), que tem o mockup
//  ao vivo enquanto digita.
//
//  O "conteudo" vem do Supabase em texto PURO com a formatação nativa do
//  WhatsApp (*negrito*, _itálico_, ~riscado~, ```monoespaçado```). O
//  renderizador converte para o visual real; o botão "Copiar" devolve o
//  texto exatamente como está no banco (cola perfeito no WhatsApp).
//
//  Orçamentos podem ter também uma ABERTURA (coluna "abertura"): a mensagem
//  enviada antes do orçamento no mesmo atendimento (ex.: a MEGA OFERTA —
//  "as condições completas eu já te mando agora 👇"). O mockup mostra as
//  duas bolhas na ordem de envio e cada uma tem seu botão de copiar.
//
//  Helpers e o mockup são exportados para o editor (MensagensEditar.jsx).
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import usePageTitle from './lib/usePageTitle'
import {
    AlertTriangle, BatteryFull, Camera, Check, CheckCheck, ChevronLeft, Copy,
    Eye, Inbox, Mic, MoreVertical, Paperclip, Pencil, Phone, Plus, RefreshCw,
    Send, Signal, Smile, Video, Wifi, X,
} from 'lucide-react'

// -----------------------------------------------------------------------------
// Utilidades — compartilhadas com o editor de página inteira (MensagensEditar.jsx)
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

// Modal de confirmação — usado na exclusão do editor (MensagensEditar.jsx).
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
// Formatação WhatsApp → JSX
// -----------------------------------------------------------------------------

// Regras do WhatsApp: o marcador precisa "abraçar" texto que não começa nem
// termina com espaço, não atravessa quebra de linha e não pode estar colado
// em letra/número por fora (senão vira texto literal, como no app real).
const FORMAT_RE = /(^|[^A-Za-z0-9])([*_~])([^\s*_~][^*_~\n]*[^\s*_~]|[^\s*_~])\2(?![A-Za-z0-9])/g

function renderInline(chunk, push) {
    let last = 0
    let m
    FORMAT_RE.lastIndex = 0
    while ((m = FORMAT_RE.exec(chunk))) {
        if (m.index > last) push(chunk.slice(last, m.index), null)
        if (m[1]) push(m[1], null)
        const style = m[2] === '*' ? 'bold' : m[2] === '_' ? 'italic' : 'strike'
        push(m[3], style)
        last = m.index + m[0].length
    }
    if (last < chunk.length) push(chunk.slice(last), null)
}

export function WhatsAppText({ text }) {
    return (
        <>
            {text.split(/```([\s\S]*?)```/g).map((chunk, i) => {
                if (i % 2 === 1) {
                    return (
                        <code key={i} className="rounded bg-black/[0.06] px-1 font-mono text-[12.5px]">
                            {chunk}
                        </code>
                    )
                }
                const parts = []
                const push = (str, style) => {
                    if (!str) return
                    if (style === 'bold') parts.push(<strong key={parts.length}>{str}</strong>)
                    else if (style === 'italic') parts.push(<em key={parts.length}>{str}</em>)
                    else if (style === 'strike') parts.push(<del key={parts.length}>{str}</del>)
                    else parts.push(str)
                }
                renderInline(chunk, push)
                return <span key={i}>{parts}</span>
            })}
        </>
    )
}

// -----------------------------------------------------------------------------
// Mockup do celular
// -----------------------------------------------------------------------------

// Papel de parede: bege do WhatsApp + "doodles" discretos (SVG inline).
const DOODLES = encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150'>` +
    `<g opacity='0.05' font-size='13'>` +
    `<text x='8' y='20'>☕</text><text x='70' y='14'>📷</text><text x='115' y='38'>❤</text>` +
    `<text x='30' y='60'>✈</text><text x='95' y='66'>🎵</text><text x='12' y='98'>⭐</text>` +
    `<text x='60' y='110'>💌</text><text x='122' y='128'>🎈</text><text x='40' y='132'>🎤</text>` +
    `</g></svg>`,
)
const WALLPAPER = {
    backgroundColor: '#EFE7DD',
    backgroundImage: `url("data:image/svg+xml,${DOODLES}")`,
}

// Variáveis {primeiro-nome}/{produto} aparecem preenchidas com exemplo no
// preview; o "Copiar" mantém os placeholders para personalizar por lead.
export const EXAMPLE_VARS = { 'primeiro-nome': 'Raimundo', 'produto': 'Moto' }
export const fillExampleVars = (text) =>
    String(text || '').replace(/\{([^}]+)\}/g, (m, key) => EXAMPLE_VARS[key.trim()] ?? m)

export const varsDe = (conteudo) =>
    Array.from(new Set(Array.from(String(conteudo || '').matchAll(/\{([^}]+)\}/g), (m) => m[1].trim())))

const timeFor = (id) => `${9 + (id % 8)}:${String((id * 13) % 60).padStart(2, '0')}`

// Uma bolha da conversa — a abertura e o orçamento são duas bolhas seguidas.
function Bolha({ text, sent }) {
    return (
        <div className={`flex ${sent ? 'justify-end' : 'justify-start'}`}>
            <div
                className={`relative max-w-[86%] rounded-lg px-2 py-[6px] shadow-sm ${
                    sent ? 'rounded-tr-none bg-[#D9FDD3]' : 'rounded-tl-none bg-white'
                }`}
            >
                {/* Rabinho da bolha */}
                <span
                    aria-hidden
                    className={`absolute top-0 h-0 w-0 border-t-[11px] ${
                        sent
                            ? '-right-[9px] border-r-[9px] border-r-transparent border-t-[#D9FDD3]'
                            : '-left-[9px] border-l-[9px] border-l-transparent border-t-white'
                    }`}
                />
                <div className="whitespace-pre-wrap break-words text-[13.5px] leading-[1.35] text-[#111b21]">
                    <WhatsAppText text={text || ''} />
                    <span className="float-right ml-2 mt-[7px] inline-flex items-center text-[10px] leading-none text-[#667781]">
                        {timeFor((text || '').length)}
                        {sent && (
                            <CheckCheck size={13} strokeWidth={2.4} className="ml-[2px] text-[#53bdeb]" />
                        )}
                    </span>
                </div>
            </div>
        </div>
    )
}

// "abertura" (opcional) é a mensagem enviada antes da principal — renderizada
// como bolha própria, na ordem real do envio.
export function WhatsAppChat({ text, abertura = '', mode = 'recebida' }) {
    const bodyRef = useRef(null)
    const sent = mode === 'enviada'

    // Abre a conversa já no fim, como chega no celular.
    useEffect(() => {
        const el = bodyRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [text, abertura, mode])

    return (
        <div className="relative flex h-[600px] flex-col overflow-hidden rounded-[2.1rem] bg-[#EFE7DD]">
            {/* Barra de status */}
            <div className="flex items-center justify-between bg-[#008069] px-4 pb-1 pt-1.5 text-[10px] font-medium text-white">
                <span>9:41</span>
                <span className="flex items-center gap-1">
                    <Signal size={11} /><Wifi size={11} /><BatteryFull size={13} />
                </span>
            </div>

            {/* Header da conversa */}
            <div className="flex items-center gap-2 bg-[#008069] px-2 pb-2 text-white">
                <ChevronLeft size={24} className="shrink-0" />
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
                    <img
                        src="/assets/images/logo-autoescola-habilitar.webp"
                        alt=""
                        className="h-full w-full object-cover"
                    />
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate text-[14px] font-medium">Auto Escola Habilitar</div>
                    <div className="text-[11px] text-white/75">online</div>
                </div>
                <Video size={19} className="shrink-0" />
                <Phone size={16} className="shrink-0" />
                <MoreVertical size={18} className="shrink-0" />
            </div>

            {/* Corpo da conversa */}
            <div ref={bodyRef} className="flex-1 overflow-y-auto px-3 py-2" style={WALLPAPER}>
                <div className="my-2 flex justify-center">
                    <span className="rounded-md bg-white/90 px-2 py-[3px] text-[10px] font-medium uppercase tracking-wide text-[#54656f] shadow-sm">
                        Hoje
                    </span>
                </div>

                <div className="flex flex-col gap-[3px]">
                    {abertura && <Bolha text={abertura} sent={sent} />}
                    <Bolha text={text} sent={sent} />
                </div>
            </div>

            {/* Barra de digitação */}
            <div className="flex items-center gap-2 bg-[#EFE7DD] px-2 pb-2 pt-1">
                <div className="flex min-h-[40px] flex-1 items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm">
                    <Smile size={20} className="shrink-0 text-[#8696a0]" />
                    <span className="flex-1 text-[14px] text-[#8696a0]">Mensagem</span>
                    <Paperclip size={19} className="shrink-0 text-[#54656f]" />
                    <Camera size={19} className="shrink-0 text-[#54656f]" />
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] shadow">
                    <Mic size={19} className="text-white" />
                </div>
            </div>
        </div>
    )
}

export function PhoneMockup({ children }) {
    return (
        <div className="mx-auto w-full max-w-[350px]">
            <div className="rounded-[2.6rem] bg-gray-950 p-[9px] shadow-2xl ring-1 ring-white/10">
                {children}
            </div>
        </div>
    )
}

// Alternador "Como ela recebe" (bolha branca) ↔ "Como você envia"
// (bolha verde com tiques) — usado no modal e no editor.
export function AlternadorModo({ mode, onChange }) {
    return (
        <div className="inline-flex rounded-lg border border-gray-700 bg-gray-800 p-1 text-xs">
            <button
                onClick={() => onChange('recebida')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition ${
                    mode === 'recebida' ? 'bg-habilitar-orange text-white' : 'text-gray-300 hover:text-white'
                }`}
            >
                <Inbox size={13} />
                Como ela recebe
            </button>
            <button
                onClick={() => onChange('enviada')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition ${
                    mode === 'enviada' ? 'bg-habilitar-orange text-white' : 'text-gray-300 hover:text-white'
                }`}
            >
                <Send size={13} />
                Como você envia
            </button>
        </div>
    )
}

// -----------------------------------------------------------------------------
// Modal de preview — mockup do WhatsApp em tamanho real
// -----------------------------------------------------------------------------

export function ModalWhatsApp({ msg, onFechar }) {
    const [mode, setMode] = useState('recebida')
    const { copiadoKey, copiarTexto } = useCopiar()
    const aberto = !!msg

    useEffect(() => {
        if (!aberto) return
        const onKey = (e) => { if (e.key === 'Escape') onFechar() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [aberto, onFechar])

    if (!msg) return null
    const vars = varsDe([msg.conteudo, msg.abertura].filter(Boolean).join('\n'))
    const copiado = copiadoKey === 'modal'
    const copiadoAbertura = copiadoKey === 'modal-abertura'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/80" onClick={onFechar} />
            <div className="relative flex max-h-full w-full max-w-md flex-col items-center">
                <div className="mb-3 flex w-full items-center gap-2">
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-white">{msg.titulo}</p>
                        <p className="text-xs text-gray-400">
                            {msg.categoria}
                            {msg.abertura && ' · envio em 2 mensagens'}
                            {vars.length > 0 && ` · variáveis ${vars.map((v) => `{${v}}`).join(', ')}`}
                        </p>
                    </div>
                    <button
                        onClick={onFechar}
                        title="Fechar (Esc)"
                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gray-800/90 px-3 py-1.5 text-sm font-semibold text-gray-200 shadow transition hover:bg-gray-700"
                    >
                        <X size={15} />
                        Fechar
                    </button>
                </div>

                <PhoneMockup>
                    <WhatsAppChat
                        text={fillExampleVars(msg.conteudo)}
                        abertura={fillExampleVars(msg.abertura)}
                        mode={mode}
                    />
                </PhoneMockup>

                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <AlternadorModo mode={mode} onChange={setMode} />
                    {msg.abertura && (
                        <button
                            onClick={() => copiarTexto('modal-abertura', msg.abertura)}
                            title="Copia a abertura — no WhatsApp cada mensagem vai num envio próprio"
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                                copiadoAbertura ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                            }`}
                        >
                            {copiadoAbertura ? <Check size={13} /> : <Copy size={13} />}
                            {copiadoAbertura ? 'Copiado!' : 'Copiar abertura'}
                        </button>
                    )}
                    <button
                        onClick={() => copiarTexto('modal', msg.conteudo)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                            copiado ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                        }`}
                    >
                        {copiado ? <Check size={13} /> : <Copy size={13} />}
                        {copiado ? 'Copiado!' : msg.abertura ? 'Copiar orçamento' : 'Copiar mensagem'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// -----------------------------------------------------------------------------
// Página — tabela de mensagens (edição em /mensagens/:id, modal de preview)
// -----------------------------------------------------------------------------

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

// dd/mm/aa hh:mm compacto; title com o valor completo. "—" se a coluna ainda
// não existir (updated_at chega com supabase/sql/2026-09-03-mensagens-updated-at.sql).
function DataCell({ value }) {
    if (!value) return <span className="text-gray-500">—</span>
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return <span className="text-gray-500">—</span>
    return (
        <span
            title={d.toLocaleString('pt-BR')}
            className="whitespace-nowrap text-xs text-gray-400"
        >
            {d.toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: '2-digit',
                hour: '2-digit', minute: '2-digit',
            })}
        </span>
    )
}

export default function Mensagens() {
    usePageTitle('Mensagens')
    const navigate = useNavigate()
    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [lastUpdated, setLastUpdated] = useState(null)

    // Mensagem aberta no modal de preview (mockup)
    const [msgAberta, setMsgAberta] = useState(null)

    // Prévas expandidas na tabela (clique na célula alterna prévia/texto cheio)
    const [abertas, setAbertas] = useState(() => new Set())

    // Filtros: categoria (chips) + busca textual
    const [catSel, setCatSel] = useState('todas')
    const [busca, setBusca] = useState('')

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const resp = await fetch('/api/mensagens', { headers: { Accept: 'application/json' } })
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
            const json = await resp.json()
            setRows(Array.isArray(json.rows) ? json.rows : [])
            setError(null)
            setLastUpdated(new Date())
        } catch {
            setError(
                'Sem mensagens — verifique se a tabela "mensagens" já existe ' +
                '(rode supabase/sql/2026-09-03-mensagens.sql no SQL Editor do Supabase).',
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

    const alternarAberta = useCallback((id) => {
        setAbertas((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    const ativas = useMemo(() => rows.filter((r) => r.ativo).length, [rows])

    const categorias = useMemo(() => {
        const mapa = new Map()
        rows.forEach((r) => mapa.set(r.categoria, (mapa.get(r.categoria) || 0) + 1))
        return Array.from(mapa.entries()) // [[categoria, quantidade], …] na ordem da tabela
    }, [rows])

    const filtrados = useMemo(() => {
        const q = busca.trim().toLowerCase()
        return rows.filter((r) => {
            if (catSel !== 'todas' && r.categoria !== catSel) return false
            if (!q) return true
            return [r.titulo, r.conteudo, r.categoria]
                .some((v) => String(v || '').toLowerCase().includes(q))
        })
    }, [rows, catSel, busca])

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
                        <h1 className="text-lg font-bold leading-tight">Mensagens</h1>
                        <p className="text-xs text-gray-400">
                            Scripts de WhatsApp — gestão e preview fiel do recebimento
                        </p>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                        {rows.length > 0 && (
                            <span className="rounded-full bg-green-900/60 px-3 py-1 text-xs font-medium text-green-300">
                                {ativas}/{rows.length} ativas
                            </span>
                        )}
                        <button
                            onClick={load}
                            className="flex items-center gap-2 rounded-lg bg-habilitar-orange px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                        >
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                            Atualizar
                        </button>
                        <button
                            onClick={() => navigate('/mensagens/novo')}
                            className="flex items-center gap-2 rounded-lg bg-habilitar-orange px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110"
                        >
                            <Plus size={15} />
                            Nova mensagem
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
                {error && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-200">
                        <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <section className="space-y-4">
                    <div>
                        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">
                            Biblioteca de mensagens
                        </h2>
                        <p className="text-xs text-gray-500">
                            Clique no olho para ver como chega no WhatsApp do lead · clique na mensagem para expandir
                        </p>
                    </div>

                    {/* Filtros */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => setCatSel('todas')}
                                className={`h-9 rounded-lg border px-3 text-sm transition ${
                                    catSel === 'todas'
                                        ? 'border-habilitar-orange bg-habilitar-orange/10 text-white'
                                        : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                                }`}
                            >
                                Todas
                                <span className="ml-1.5 text-xs text-gray-400">{rows.length}</span>
                            </button>
                            {categorias.map(([cat, qtd]) => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setCatSel(cat)}
                                    className={`h-9 rounded-lg border px-3 text-sm transition ${
                                        catSel === cat
                                            ? 'border-habilitar-orange bg-habilitar-orange/10 text-white'
                                            : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                                    }`}
                                >
                                    {cat}
                                    <span className="ml-1.5 text-xs text-gray-400">{qtd}</span>
                                </button>
                            ))}
                        </div>
                        <div className="flex h-9 min-w-[200px] max-w-sm flex-1 items-center gap-2 rounded-lg border border-gray-600 bg-gray-700 px-3">
                            <input
                                type="search"
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                placeholder="Buscar por título, mensagem, categoria…"
                                className="w-full bg-transparent text-sm text-white placeholder-gray-500 outline-none"
                            />
                        </div>
                        {filtrados.length !== rows.length && (
                            <span className="text-xs text-gray-400">
                                {filtrados.length} de {rows.length}
                            </span>
                        )}
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-gray-700 bg-gray-800">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-700 text-left text-xs uppercase tracking-wider text-gray-400">
                                    <th className={`${thClass} w-[24%]`}>Título</th>
                                    <th className={thClass}>Categoria</th>
                                    <th className={thClass}>Mensagem</th>
                                    <th className={`${thClass} text-center`}>Ordem</th>
                                    <th className={`${thClass} text-center`}>Status</th>
                                    <th className={thClass}>Criado</th>
                                    <th className={thClass}>Atualizado</th>
                                    <th className={`${thClass} text-right`}>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    Array.from({ length: 4 }).map((_, i) => (
                                        <tr key={i} className="border-b border-gray-800 last:border-0">
                                            <td className={tdClass} colSpan={8}>
                                                <div className="h-10 animate-pulse rounded bg-gray-700" />
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    filtrados.map((msg) => {
                                        const aberta = abertas.has(msg.id)
                                        const vars = varsDe([msg.conteudo, msg.abertura].filter(Boolean).join('\n'))
                                        return (
                                            <tr
                                                key={msg.id}
                                                className={`border-b border-gray-800 transition-colors last:border-0 hover:bg-gray-700/40 ${
                                                    !msg.ativo ? 'opacity-60' : ''
                                                }`}
                                            >
                                                <td className={`${tdClass} font-medium leading-snug text-white`}>
                                                    {msg.titulo}
                                                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                                        {msg.abertura && (
                                                            <span
                                                                title="Tem uma abertura que vai antes desta — o envio é em 2 mensagens"
                                                                className="rounded bg-habilitar-orange/15 px-1.5 py-0.5 text-[10px] font-semibold text-habilitar-orange"
                                                            >
                                                                + abertura
                                                            </span>
                                                        )}
                                                        {vars.length > 0 && (
                                                            <span className="text-[11px] text-gray-500">
                                                                variáveis: {vars.map((v) => `{${v}}`).join(', ')}
                                                            </span>
                                                        )}
                                                    </span>
                                                </td>
                                                <td className={`${tdClass} whitespace-nowrap`}>
                                                    <span className="inline-block rounded-full bg-gray-700 px-2.5 py-0.5 text-[11px] font-medium text-gray-200">
                                                        {msg.categoria}
                                                    </span>
                                                </td>
                                                <td className={`${tdClass} text-gray-300`}>
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => alternarAberta(msg.id)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') alternarAberta(msg.id)
                                                        }}
                                                        title={aberta ? 'Clique para recolher' : 'Clique para ver a mensagem completa'}
                                                        className={`cursor-pointer select-none whitespace-pre-wrap text-xs leading-relaxed ${
                                                            aberta ? '' : 'line-clamp-4'
                                                        }`}
                                                    >
                                                        {msg.conteudo || <span className="text-gray-500">(vazia)</span>}
                                                    </div>
                                                </td>
                                                <td className={`${tdClass} text-center text-gray-500`}>{msg.ordem}</td>
                                                <td className={`${tdClass} text-center`}>
                                                    <StatusBadge ativo={msg.ativo} />
                                                </td>
                                                <td className={tdClass}>
                                                    <DataCell value={msg.created_at} />
                                                </td>
                                                <td className={tdClass}>
                                                    <DataCell value={msg.updated_at} />
                                                </td>
                                                <td className={tdClass}>
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            onClick={() => setMsgAberta(msg)}
                                                            title="Ver como chega no WhatsApp (mockup)"
                                                            className="rounded-lg bg-gray-700 p-2 text-gray-300 transition hover:bg-gray-600"
                                                        >
                                                            <Eye size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => navigate(`/mensagens/${msg.id}`)}
                                                            title="Editar (texto, categoria, ordem, excluir)"
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

                    {!loading && rows.length === 0 && (
                        <p className="rounded-xl border border-gray-800 bg-gray-800/40 p-6 text-center text-sm text-gray-400">
                            Nenhuma mensagem cadastrada — clique em “Nova mensagem”.
                        </p>
                    )}
                    {!loading && rows.length > 0 && filtrados.length === 0 && (
                        <p className="rounded-xl border border-gray-800 bg-gray-800/40 p-6 text-center text-sm text-gray-400">
                            Nenhuma mensagem com esses filtros — limpe a busca ou troque a categoria.
                        </p>
                    )}
                </section>

                {lastUpdated && (
                    <p className="text-center text-xs text-gray-600">
                        Atualizado às {lastUpdated.toLocaleTimeString('pt-BR')}
                    </p>
                )}
            </main>

            <ModalWhatsApp msg={msgAberta} onFechar={() => setMsgAberta(null)} />
        </div>
    )
}
