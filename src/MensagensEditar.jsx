// =============================================================================
//  Editor de página inteira — /mensagens/:id | /mensagens/novo
// =============================================================================
//  Criar/editar mensagens de WhatsApp usando a tela toda: o mockup do celular
//  fica fixo à esquerda e atualiza AO VIVO enquanto você digita a mensagem
//  (negrito/itálico/formatação WhatsApp renderizados no ato; variáveis
//  {primeiro-nome}/{produto} aparecem preenchidas com exemplo). Os campos
//  ficam à direita, com o botão "Copiar mensagem" junto ao texto. Salvar
//  volta para /mensagens; Excluir (só quando editando) apaga a linha após
//  confirmação. Helpers e o mockup vêm de ./Mensagens.jsx.
//
//  Qualquer mensagem tem o botão "Adicionar mensagem": abre o campo da
//  ABERTURA — a 1ª mensagem do envio (ex.: a MEGA OFERTA antes do orçamento,
//  pré-preenchida com a "Abertura do carrinho" da biblioteca), com a mensagem
//  principal vindo logo depois como 2ª mensagem. O mockup mostra as duas
//  bolhas na ordem de envio.
// =============================================================================

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Check, ChevronLeft, Copy, Plus, Trash2, X } from 'lucide-react'
import {
    AlternadorModo, ModalConfirmacao, PhoneMockup, WhatsAppChat, api,
    fillExampleVars, inputClass, labelClass, useCopiar,
} from './Mensagens.jsx'

// Comparação de categoria/título sem acento e em minúsculas ("Orçamentos" →
// "orcamentos") para achar os orçamentos e a abertura da biblioteca.
const semAcento = (s) =>
    String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function MensagensEditar() {
    const navigate = useNavigate()
    const { id } = useParams()
    const novo = !id

    const [carregando, setCarregando] = useState(true)
    const [erro, setErro] = useState(null)
    const [salvando, setSalvando] = useState(false)

    const [categoria, setCategoria] = useState('Comunicação')
    const [titulo, setTitulo] = useState('')
    const [conteudo, setConteudo] = useState('')
    const [ordem, setOrdem] = useState(0)
    const [ativo, setAtivo] = useState(true)
    const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

    // Abertura — a mensagem enviada ANTES do orçamento (2 envios). O campo só
    // aparece nas categorias de orçamento; "aberturaModelo" guarda o texto da
    // "Abertura do carrinho" da biblioteca para pré-preencher o clique no
    // botão "Adicionar mensagem".
    const [abertura, setAbertura] = useState('')
    const [aberturaAberta, setAberturaAberta] = useState(false)
    const [aberturaModelo, setAberturaModelo] = useState('')

    // Como o mockup mostra a mensagem: recebida (celular do lead) ou enviada.
    const [mode, setMode] = useState('recebida')
    const { copiadoKey, copiarTexto } = useCopiar()

    // Categorias já usadas — sugere no datalist do campo Categoria.
    const [categorias, setCategorias] = useState([])

    useEffect(() => {
        let cancelado = false
        const carregar = async () => {
            try {
                const resp = await fetch('/api/mensagens', { headers: { Accept: 'application/json' } })
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
                const json = await resp.json()
                const rows = Array.isArray(json.rows) ? json.rows : []
                if (cancelado) return
                setCategorias(Array.from(new Set(rows.map((r) => r.categoria).filter(Boolean))))
                const modelo = rows.find((r) => semAcento(r.titulo).includes('abertura do carrinho'))
                setAberturaModelo(modelo ? modelo.conteudo : '')
                if (novo) {
                    // Sugere a próxima ordem com base no que já existe.
                    setOrdem(rows.reduce((max, r) => Math.max(max, r.ordem || 0), 0) + 1)
                } else {
                    const row = rows.find((r) => String(r.id) === String(id))
                    if (!row) throw new Error('Mensagem não encontrada.')
                    setCategoria(row.categoria ?? 'Comunicação')
                    setTitulo(row.titulo ?? '')
                    setConteudo(row.conteudo ?? '')
                    setOrdem(row.ordem ?? 0)
                    setAtivo(row.ativo ?? true)
                    setAbertura(row.abertura ?? '')
                    setAberturaAberta(Boolean(row.abertura))
                }
            } catch (err) {
                if (!cancelado) setErro(err.message)
            } finally {
                if (!cancelado) setCarregando(false)
            }
        }
        carregar()
        return () => { cancelado = true }
    }, [id, novo])

    const salvar = async () => {
        if (!titulo.trim()) return setErro('Diga o título da mensagem.')
        if (!conteudo.trim()) return setErro('A mensagem não pode ficar vazia.')
        const body = {
            categoria: categoria.trim() || 'Comunicação',
            titulo: titulo.trim(),
            conteudo,
            // null quando o campo está fechado/vazio — o envio volta a ser de
            // 1 mensagem (apaga a abertura se existir no banco).
            abertura: aberturaAberta && abertura.trim() ? abertura : null,
            ordem: Math.trunc(Number(ordem)) || 0,
            ativo,
        }
        setSalvando(true)
        setErro(null)
        try {
            if (novo) await api('/api/mensagens', { method: 'POST', body })
            else await api(`/api/mensagens?id=${id}`, { method: 'PATCH', body })
            navigate('/mensagens')
        } catch (err) {
            setErro(err.message)
            setSalvando(false)
        }
    }

    // Exclusão só roda depois do "Excluir" no modal de confirmação.
    const confirmarExclusao = async () => {
        setConfirmandoExclusao(false)
        try {
            await api(`/api/mensagens?id=${id}`, { method: 'DELETE' })
            navigate('/mensagens')
        } catch (err) {
            setErro(err.message)
        }
    }

    const copiado = copiadoKey === 'form-conteudo'
    const copiadoAbertura = copiadoKey === 'form-abertura'

    // "Adicionar mensagem" aparece em qualquer mensagem; a categoria só ajusta
    // o rótulo da 2ª caixa ("o orçamento" vs. "a principal").
    const isOrcamento = semAcento(categoria).includes('orcamento')

    const adicionarAbertura = () => {
        // Pré-preenche com a "Abertura do carrinho" da biblioteca (a MEGA
        // OFERTA que acompanha os orçamentos) quando o campo está vazio.
        setAbertura((atual) => (atual.trim() ? atual : aberturaModelo))
        setAberturaAberta(true)
    }

    return (
        <div className="min-h-screen bg-gray-900 font-sans text-white">
            <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
                    <button
                        onClick={() => navigate('/mensagens')}
                        className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-300 transition hover:bg-gray-700"
                    >
                        <ChevronLeft size={16} />
                        Voltar
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-lg font-bold leading-tight">
                            {novo ? 'Nova mensagem' : 'Editar mensagem'}
                        </h1>
                        {!novo && titulo && (
                            <p className="truncate text-xs text-gray-400">{titulo}</p>
                        )}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        {salvando && <span className="text-xs text-gray-400">Salvando…</span>}
                        <button
                            onClick={salvar}
                            disabled={salvando || carregando}
                            className="rounded-lg bg-habilitar-orange px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                        >
                            Salvar
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-6xl px-4 py-6">
                {erro && (
                    <div className="mb-6 flex items-start gap-2 rounded-xl border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-200">
                        <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                        <span>{erro}</span>
                    </div>
                )}

                {carregando ? (
                    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
                        <div className="h-[620px] animate-pulse rounded-[2.6rem] bg-gray-800" />
                        <div className="space-y-4">
                            <div className="h-10 animate-pulse rounded-lg bg-gray-800" />
                            <div className="h-10 w-1/2 animate-pulse rounded-lg bg-gray-800" />
                            <div className="h-96 animate-pulse rounded-lg bg-gray-800" />
                        </div>
                    </div>
                ) : (
                    <div className="grid items-start gap-6 lg:grid-cols-[360px_1fr]">
                        {/* Mockup — fixo enquanto rola o formulário; atualiza
                            ao vivo conforme o texto é digitado. */}
                        <div className="space-y-3 lg:sticky lg:top-24">
                            <AlternadorModo mode={mode} onChange={setMode} />
                            <PhoneMockup>
                                <WhatsAppChat
                                    text={fillExampleVars(conteudo)}
                                    abertura={fillExampleVars(aberturaAberta ? abertura : '')}
                                    mode={mode}
                                />
                            </PhoneMockup>
                            <p className="text-center text-xs text-gray-500">
                                Preview ao vivo — como {mode === 'recebida' ? 'o lead recebe' : 'você envia'}
                                {aberturaAberta && abertura.trim() && ' (2 mensagens)'}
                            </p>
                        </div>

                        {/* Campos */}
                        <div className="space-y-4">
                            <div>
                                <label className={labelClass} htmlFor="edit-titulo">Título</label>
                                <input
                                    id="edit-titulo"
                                    className={inputClass}
                                    value={titulo}
                                    onChange={(e) => setTitulo(e.target.value)}
                                    placeholder="Boas-vindas — pós-inscrição no formulário"
                                />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
                                <div>
                                    <label className={labelClass} htmlFor="edit-categoria">Categoria</label>
                                    <input
                                        id="edit-categoria"
                                        className={inputClass}
                                        value={categoria}
                                        onChange={(e) => setCategoria(e.target.value)}
                                        placeholder="Comunicação"
                                        list="categorias-mensagens"
                                    />
                                    <datalist id="categorias-mensagens">
                                        {categorias.map((c) => <option key={c} value={c} />)}
                                    </datalist>
                                </div>
                                <div>
                                    <label className={labelClass} htmlFor="edit-ordem">Ordem</label>
                                    <input
                                        id="edit-ordem"
                                        type="number"
                                        className={inputClass}
                                        value={ordem}
                                        onChange={(e) => setOrdem(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Abertura — o envio pode sair em 2 mensagens: ela
                                primeiro ("…te mando agora 👇") e a mensagem
                                principal logo abaixo logo depois. */}
                            {!aberturaAberta && (
                                <div>
                                    <button
                                        type="button"
                                        onClick={adicionarAbertura}
                                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-600 px-4 py-2.5 text-sm font-semibold text-gray-300 transition hover:border-habilitar-orange hover:text-white"
                                    >
                                        <Plus size={15} />
                                        Adicionar mensagem
                                    </button>
                                    <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                                        A 1ª mensagem do envio, que vai antes desta (ex.: a MEGA
                                        OFERTA antes do orçamento) — pré-preenchida com a “Abertura
                                        do carrinho” da biblioteca; o envio vira 2 mensagens na
                                        ordem do mockup.
                                    </p>
                                </div>
                            )}

                            {aberturaAberta && (
                                <div className="space-y-2 rounded-xl border border-gray-700 bg-gray-800/60 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <label className={`${labelClass} mb-0`} htmlFor="edit-abertura">
                                            Abertura — enviada antes, como 1ª mensagem
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => copiarTexto('form-abertura', abertura)}
                                                title="Copia a abertura como está (pronto para colar no WhatsApp)"
                                                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                                                    copiadoAbertura
                                                        ? 'bg-green-600 text-white'
                                                        : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                                }`}
                                            >
                                                {copiadoAbertura ? <Check size={13} /> : <Copy size={13} />}
                                                {copiadoAbertura ? 'Copiado!' : 'Copiar abertura'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setAbertura('')
                                                    setAberturaAberta(false)
                                                }}
                                                title="Remove a abertura — volta a enviar só o orçamento"
                                                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-950/40"
                                            >
                                                <X size={13} />
                                                Remover
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        id="edit-abertura"
                                        rows={10}
                                        className={`${inputClass} font-mono text-xs leading-relaxed`}
                                        value={abertura}
                                        onChange={(e) => setAbertura(e.target.value)}
                                        placeholder={'{primeiro-nome} está liberado a *MEGA OFERTA*…\nas condições completas eu já te mando agora 👇'}
                                    />
                                    <p className="text-[11px] text-gray-500">
                                        Formatação WhatsApp (*negrito*, _itálico_) · a mensagem
                                        embaixo vai logo depois — é o “👇” desta abertura.
                                    </p>
                                </div>
                            )}

                            <div>
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <label className={`${labelClass} mb-0`} htmlFor="edit-conteudo">
                                        Mensagem{aberturaAberta
                                            ? isOrcamento
                                                ? ' — o orçamento (2ª mensagem)'
                                                : ' — a principal (2ª mensagem)'
                                            : ' (formatação WhatsApp: *negrito*, _itálico_, ~riscado~)'}
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => copiarTexto('form-conteudo', conteudo)}
                                        title="Copia o texto do campo como está (pronto para colar no WhatsApp)"
                                        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                                            copiado
                                                ? 'bg-green-600 text-white'
                                                : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                        }`}
                                    >
                                        {copiado ? <Check size={13} /> : <Copy size={13} />}
                                        {copiado ? 'Copiado!' : 'Copiar mensagem'}
                                    </button>
                                </div>
                                <textarea
                                    id="edit-conteudo"
                                    rows={20}
                                    className={`${inputClass} font-mono text-xs leading-relaxed`}
                                    value={conteudo}
                                    onChange={(e) => setConteudo(e.target.value)}
                                    placeholder={'✅ *PRÉ-INSCRIÇÃO CONFIRMADA!*\nAgora falta pouco! Serão apenas *50 vagas*…\n\nUse {primeiro-nome} e {produto} para personalizar por lead.'}
                                />
                            </div>

                            <label className="flex items-center gap-2 text-sm text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={ativo}
                                    onChange={(e) => setAtivo(e.target.checked)}
                                    className="h-4 w-4 accent-habilitar-orange"
                                />
                                Ativo (visível)
                            </label>

                            {!novo && (
                                <button
                                    onClick={() => setConfirmandoExclusao(true)}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-900/60 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-950/40 sm:w-auto"
                                >
                                    <Trash2 size={15} />
                                    Excluir mensagem
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </main>

            <ModalConfirmacao
                aberto={confirmandoExclusao}
                titulo="Excluir mensagem?"
                detalhe={
                    titulo
                        ? `"${titulo}" será removida da biblioteca — não dá para desfazer.`
                        : 'A mensagem será removida da biblioteca — não dá para desfazer.'
                }
                onConfirmar={confirmarExclusao}
                onFechar={() => setConfirmandoExclusao(false)}
            />
        </div>
    )
}
