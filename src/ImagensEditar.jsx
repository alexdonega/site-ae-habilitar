// =============================================================================
//  Editor de página inteira — /imagens/produto/:id | /imagens/produto/novo
//                            /imagens/foto/:id    | /imagens/foto/novo
// =============================================================================
//  Criar/editar produtos e fotos de perfil usando a tela toda: imagem grande
//  à esquerda, campos e a copy completa à direita (o botão "Copiar copy" fica
//  aqui). Salvar volta para /imagens; Excluir (só quando editando) apaga a
//  linha e o objeto do Storage. Helpers compartilhados (useCopiar, api,
//  classes de input, ModalConfirmacao) vêm de ./Imagens.jsx.
//
//  Upload no padrão do /criativos: o arquivo vai DIRETO ao Storage via signed
//  upload URL com barra de progresso (não passa pela função da Vercel, que
//  limita o corpo a ~4,5MB) — sem recompressão, qualidade original.
// =============================================================================

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Check, ChevronLeft, Copy, Download, Trash2, Upload } from 'lucide-react'
import { api, inputClass, labelClass, ModalConfirmacao, useCopiar } from './Imagens.jsx'

// -----------------------------------------------------------------------------
// Seletor de arquivo (input escondido dentro de label estilizada — mesmo
// visual do "novo" do /criativos, com nome e tamanho do arquivo abaixo)
// -----------------------------------------------------------------------------

function SeletorArquivo({ arquivo, onChange, quadrado = false }) {
    const [erro, setErro] = useState(null)

    const handle = (e) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
            setErro('Formato não suportado — use JPEG, PNG ou WebP.')
            return
        }
        setErro(null)
        onChange(file)
    }

    const previewUrl = arquivo ? URL.createObjectURL(arquivo) : null

    return (
        <div>
            <label
                className={`flex ${quadrado ? 'aspect-square' : 'aspect-[3/4]'} w-full cursor-pointer items-center
                    justify-center overflow-hidden rounded-xl border-2 border-dashed border-gray-600
                    bg-gray-700/50 transition hover:border-habilitar-orange`}
            >
                <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handle}
                />
                {previewUrl ? (
                    <img src={previewUrl} alt="Prévia da imagem" className="h-full w-full object-cover" />
                ) : (
                    <span className="flex flex-col items-center gap-2 p-4 text-center text-xs text-gray-400">
                        <Upload size={22} />
                        Clique para escolher a imagem
                    </span>
                )}
            </label>
            {arquivo && (
                <p className="mt-2 text-center text-[11px] text-gray-500">
                    {arquivo.name} · {(arquivo.size / 1048576).toFixed(1)} MB
                </p>
            )}
            {erro && <p className="mt-1 text-xs text-red-300">{erro}</p>}
        </div>
    )
}

export default function ImagensEditar({ tipo = 'produto' }) {
    const isProduto = tipo === 'produto'
    const endpoint = isProduto ? 'produtos' : 'fotos-perfil'
    const navigate = useNavigate()
    const { id } = useParams()
    const novo = !id

    const [carregando, setCarregando] = useState(true)
    const [erro, setErro] = useState(null)
    const [salvando, setSalvando] = useState(false)

    const [nome, setNome] = useState('') // fotos_perfil (rótulo)
    const [produto, setProduto] = useState('')
    const [plano, setPlano] = useState('')
    const [orcamento, setOrcamento] = useState('')
    const [copy, setCopy] = useState('')
    const [ordem, setOrdem] = useState(0)
    const [ativo, setAtivo] = useState(true)
    const [imagemAtual, setImagemAtual] = useState('') // URL pública já salva
    const [arquivoNovo, setArquivoNovo] = useState(null) // File escolhido agora
    const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
    const [progresso, setProgresso] = useState(null) // { fase, pct }
    const { copiadoKey, copiarTexto } = useCopiar()

    useEffect(() => {
        let cancelado = false
        const carregar = async () => {
            try {
                const resp = await fetch(`/api/${endpoint}`, { headers: { Accept: 'application/json' } })
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
                const json = await resp.json()
                const rows = Array.isArray(json.rows) ? json.rows : []
                if (cancelado) return
                if (novo) {
                    // Sugere a próxima ordem com base no que já existe.
                    setOrdem(rows.reduce((max, r) => Math.max(max, r.ordem || 0), 0) + 1)
                } else {
                    const row = rows.find((r) => String(r.id) === String(id))
                    if (!row) throw new Error('Registro não encontrado.')
                    setNome(row.nome ?? '')
                    setProduto(row.produto ?? row.nome ?? '') // fallback: linha criada antes do SQL de produto/plano
                    setPlano(row.plano ?? '')
                    setOrcamento(row.orcamento ?? '')
                    setCopy(row.copy ?? '')
                    setOrdem(row.ordem ?? 0)
                    setAtivo(row.ativo ?? true)
                    setImagemAtual(row.imagem_url ?? '')
                }
            } catch (err) {
                if (!cancelado) setErro(err.message)
            } finally {
                if (!cancelado) setCarregando(false)
            }
        }
        carregar()
        return () => { cancelado = true }
    }, [endpoint, id, novo])

    // PUT direto no Storage via signed URL, com barra de progresso.
    function uploadComProgresso(url, file) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.open('PUT', url)
            xhr.setRequestHeader('x-upsert', 'true')
            if (file.type) xhr.setRequestHeader('Content-Type', file.type)
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const pct = Math.round((e.loaded / e.total) * 100)
                    setProgresso((p) => (p ? { ...p, pct } : p))
                }
            }
            xhr.onload = () =>
                xhr.status >= 200 && xhr.status < 300
                    ? resolve()
                    : reject(new Error(`Storage respondeu ${xhr.status}`))
            xhr.onerror = () => reject(new Error('Falha de rede no upload para o Storage'))
            xhr.send(file)
        })
    }

    /** Pede a signed URL e envia o arquivo direto ao Storage; devolve o path. */
    async function enviarImagem(file) {
        setProgresso({ fase: 'Preparando upload…', pct: 0 })
        const up = await api(`/api/${endpoint}`, {
            method: 'POST',
            body: { action: 'upload-url', filename: file.name },
        })
        const absoluteUrl = /^https?:/i.test(up.signedUrl)
            ? up.signedUrl
            : `${import.meta.env.PUBLIC_SUPABASE_URL}${up.signedUrl}`
        setProgresso({ fase: 'Enviando imagem…', pct: 0 })
        await uploadComProgresso(absoluteUrl, file)
        return up.path
    }

    const salvar = async () => {
        if (salvando) return
        if (isProduto && !produto.trim()) return setErro('Diga o produto.')
        if (novo && !arquivoNovo) return setErro('Escolha a imagem.')
        setSalvando(true)
        setErro(null)
        try {
            const body = { ordem: Math.trunc(Number(ordem)) || 0, ativo }
            if (isProduto) {
                body.produto = produto.trim()
                body.plano = plano.trim()
                body.orcamento = orcamento
                body.copy = copy
            } else {
                body.nome = nome.trim()
            }
            if (arquivoNovo) {
                body.imagem_path = await enviarImagem(arquivoNovo)
            }
            setProgresso((p) => ({ fase: 'Salvando…', pct: 100 }))
            if (novo) await api(`/api/${endpoint}`, { method: 'POST', body })
            else await api(`/api/${endpoint}?id=${id}`, { method: 'PATCH', body })
            navigate('/imagens')
        } catch (err) {
            setErro(err.message)
            setSalvando(false)
            setProgresso(null)
        }
    }

    // Exclusão só roda depois do "Excluir" no modal de confirmação.
    const confirmarExclusao = async () => {
        setConfirmandoExclusao(false)
        try {
            await api(`/api/${endpoint}?id=${id}`, { method: 'DELETE' })
            navigate('/imagens')
        } catch (err) {
            setErro(err.message)
        }
    }

    // Baixa a imagem salva (fetch → blob → clique programático com nome
    // amigável; o atributo download de <a> sozinho é ignorado entre origens
    // diferentes).
    const baixarImagem = async () => {
        if (!imagemAtual) return
        try {
            const resp = await fetch(imagemAtual)
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
            const href = URL.createObjectURL(await resp.blob())
            const ext = (imagemAtual.split('?')[0].split('.').pop() || 'jpeg').toLowerCase()
            const base = (rotulo || 'imagem')
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'imagem'
            const a = document.createElement('a')
            a.href = href
            a.download = `${base}.${ext}`
            document.body.appendChild(a)
            a.click()
            a.remove()
            setTimeout(() => URL.revokeObjectURL(href), 5000)
        } catch (err) {
            setErro(`Não consegui baixar a imagem: ${err.message}`)
        }
    }

    const titulo = isProduto
        ? (novo ? 'Novo produto' : 'Editar produto')
        : (novo ? 'Nova foto de perfil' : 'Editar foto de perfil')
    const copiado = copiadoKey === 'form-copy'
    // Título exibido (header, modal de exclusão, nome do download):
    // produtos = "produto — Plano X"; fotos = rótulo.
    const rotulo = isProduto
        ? [produto, plano && `Plano ${plano}`].filter(Boolean).join(' — ')
        : nome

    return (
        <div className="min-h-screen bg-gray-900 font-sans text-white">
            <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
                    <button
                        onClick={() => navigate('/imagens')}
                        className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-300 transition hover:bg-gray-700"
                    >
                        <ChevronLeft size={16} />
                        Voltar
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-lg font-bold leading-tight">{titulo}</h1>
                        {!novo && rotulo && (
                            <p className="truncate text-xs text-gray-400">{rotulo}</p>
                        )}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        {salvando && <span className="text-xs text-gray-400">Salvando…</span>}
                        <button
                            onClick={salvar}
                            disabled={salvando || carregando}
                            className="rounded-lg bg-habilitar-orange px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                        >
                            {novo ? 'Publicar' : 'Salvar'}
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
                        <div className="aspect-[3/4] animate-pulse rounded-xl bg-gray-800" />
                        <div className="space-y-4">
                            <div className="h-10 animate-pulse rounded-lg bg-gray-800" />
                            <div className="h-10 w-1/2 animate-pulse rounded-lg bg-gray-800" />
                            <div className="h-96 animate-pulse rounded-lg bg-gray-800" />
                        </div>
                    </div>
                ) : (
                    <div className="grid items-start gap-6 lg:grid-cols-[360px_1fr]">
                        {/* Imagem — grande, fixa enquanto rola a copy */}
                        <div className="space-y-3 lg:sticky lg:top-24">
                            {arquivoNovo ? (
                                <SeletorArquivo
                                    arquivo={arquivoNovo}
                                    onChange={setArquivoNovo}
                                    quadrado={!isProduto}
                                />
                            ) : imagemAtual ? (
                                <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-900">
                                    <img
                                        src={imagemAtual}
                                        alt={rotulo || 'Imagem'}
                                        className="max-h-[60vh] w-full object-contain"
                                    />
                                </div>
                            ) : (
                                <SeletorArquivo
                                    arquivo={null}
                                    onChange={setArquivoNovo}
                                    quadrado={!isProduto}
                                />
                            )}

                            {/* Trocar imagem (editando) / remover escolha (novo) */}
                            {arquivoNovo && (
                                <button
                                    type="button"
                                    onClick={() => setArquivoNovo(null)}
                                    className="w-full rounded-lg bg-gray-700 px-4 py-2 text-xs font-semibold text-gray-300 transition hover:bg-gray-600"
                                >
                                    Remover arquivo escolhido{imagemAtual ? ' (mantém a imagem atual)' : ''}
                                </button>
                            )}
                            {!arquivoNovo && imagemAtual && (
                                <label
                                    className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-200 transition hover:bg-gray-600"
                                >
                                    <Upload size={15} />
                                    Trocar imagem
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        className="hidden"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0]
                                            e.target.value = ''
                                            if (f && /^image\/(jpeg|png|webp)$/.test(f.type)) setArquivoNovo(f)
                                        }}
                                    />
                                </label>
                            )}

                            {/* Progresso do upload */}
                            {progresso && (
                                <div className="space-y-1.5 rounded-xl border border-gray-700 bg-gray-800 p-3">
                                    <p className="text-xs text-gray-400">
                                        {progresso.fase} {progresso.pct > 0 && progresso.pct < 100 ? `· ${progresso.pct}%` : ''}
                                    </p>
                                    <div className="h-2 overflow-hidden rounded-full bg-gray-700">
                                        <div
                                            className="h-full bg-habilitar-orange transition-all"
                                            style={{ width: `${progresso.pct}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {imagemAtual && (
                                <button
                                    onClick={baixarImagem}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-200 transition hover:bg-gray-600"
                                >
                                    <Download size={15} />
                                    Baixar imagem
                                </button>
                            )}

                            {!novo && (
                                <button
                                    onClick={() => setConfirmandoExclusao(true)}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-900/60 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-950/40"
                                >
                                    <Trash2 size={15} />
                                    Excluir {isProduto ? 'produto' : 'foto'}
                                </button>
                            )}
                        </div>

                        {/* Campos */}
                        <div className="space-y-4">
                            {isProduto ? (
                                <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                                    <div>
                                        <label className={labelClass} htmlFor="edit-produto">Produto</label>
                                        <input
                                            id="edit-produto"
                                            className={inputClass}
                                            value={produto}
                                            onChange={(e) => setProduto(e.target.value)}
                                            placeholder="Primeira habilitação Carro e Moto"
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClass} htmlFor="edit-plano">Plano</label>
                                        <input
                                            id="edit-plano"
                                            className={inputClass}
                                            value={plano}
                                            onChange={(e) => setPlano(e.target.value)}
                                            placeholder="Básico, Ouro, Bronze…"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className={labelClass} htmlFor="edit-nome">Nome (rótulo opcional)</label>
                                    <input
                                        id="edit-nome"
                                        className={inputClass}
                                        value={nome}
                                        onChange={(e) => setNome(e.target.value)}
                                        placeholder="Perfil atual"
                                    />
                                </div>
                            )}

                            <div className={`grid gap-4 ${isProduto ? 'sm:grid-cols-[1fr_140px]' : 'sm:grid-cols-[140px]'}`}>
                                {isProduto && (
                                    <div>
                                        <label className={labelClass} htmlFor="edit-orcamento">Orçamento (resumo)</label>
                                        <input
                                            id="edit-orcamento"
                                            className={inputClass}
                                            value={orcamento}
                                            onChange={(e) => setOrcamento(e.target.value)}
                                            placeholder="R$ 1.297 à vista ou 10x no cartão"
                                        />
                                    </div>
                                )}
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

                            {isProduto && (
                                <div>
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                        <label className={`${labelClass} mb-0`} htmlFor="edit-copy">
                                            Copy (formatação WhatsApp: *negrito*, _itálico_...)
                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => copiarTexto('form-copy', copy)}
                                            title="Copia o texto do campo como está (pronto para colar no WhatsApp)"
                                            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                                                copiado
                                                    ? 'bg-green-600 text-white'
                                                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                            }`}
                                        >
                                            {copiado ? <Check size={13} /> : <Copy size={13} />}
                                            {copiado ? 'Copy copiada!' : 'Copiar copy'}
                                        </button>
                                    </div>
                                    <textarea
                                        id="edit-copy"
                                        rows={20}
                                        className={`${inputClass} font-mono text-xs leading-relaxed`}
                                        value={copy}
                                        onChange={(e) => setCopy(e.target.value)}
                                        placeholder={'🔰 *PLANO BÁSICO*\n✔️ Acesso ao sistema\n...'}
                                    />
                                </div>
                            )}

                            <label className="flex items-center gap-2 text-sm text-gray-300">
                                <input
                                    type="checkbox"
                                    checked={ativo}
                                    onChange={(e) => setAtivo(e.target.checked)}
                                    className="h-4 w-4 accent-habilitar-orange"
                                />
                                Ativo (visível)
                            </label>
                        </div>
                    </div>
                )}
            </main>

            <ModalConfirmacao
                aberto={confirmandoExclusao}
                titulo={`Excluir ${isProduto ? 'produto' : 'foto'}?`}
                detalhe={
                    rotulo
                        ? `"${rotulo}" será removido, junto com a imagem do Storage — não dá para desfazer.`
                        : 'A imagem também será removida do Storage — não dá para desfazer.'
                }
                onConfirmar={confirmarExclusao}
                onFechar={() => setConfirmandoExclusao(false)}
            />
        </div>
    )
}
