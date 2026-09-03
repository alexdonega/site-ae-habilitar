// =============================================================================
//  Editor de página inteira — /criativos/:id | /criativos/novo
// =============================================================================
//  Criar/editar criativos usando a tela toda (mesmo padrão do ImagensEditar):
//  mídia grande à esquerda — vídeo com player nativo, dá play direto — e
//  campos + copy completa à direita (o botão "Copiar copy" fica aqui).
//  Salvar volta para /criativos; Excluir (só quando editando) apaga a linha e
//  o objeto do Storage. Helpers compartilhados (STATUS_OPTIONS, useCopiar,
//  classes de input) vêm de ./Criativos.jsx; o modal de confirmação é o
//  mesmo do /imagens.
//
//  No "novo" (e ao trocar a mídia), o arquivo vai DIRETO ao Storage via
//  signed upload URL com barra de progresso — não passa pela função da
//  Vercel (limite de corpo ~4,5MB).
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    AlertTriangle, Check, ChevronLeft, ClipboardCopy, Download, Trash2, Upload,
} from 'lucide-react';
import { STATUS_OPTIONS, useCopiar, inputCls, textareaCls } from './Criativos.jsx';
import { ModalConfirmacao } from './Imagens.jsx';

const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400';

// Combobox com busca: digita para filtrar, clica para escolher. Aceita valor
// livre (proporção fora da lista) — Enter/sair do campo mantém o que foi
// digitado; a lista é só sugestão.
function Combobox({ id, value, onChange, options, placeholder }) {
    const [aberto, setAberto] = useState(false);
    const [busca, setBusca] = useState(null); // null = mostra o value; string = digitando
    const wrapRef = useRef(null);

    useEffect(() => {
        const fora = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setAberto(false);
        };
        document.addEventListener('mousedown', fora);
        return () => document.removeEventListener('mousedown', fora);
    }, []);

    const texto = busca === null ? value || '' : busca;
    const filtradas = options.filter((o) => o.toLowerCase().includes(texto.toLowerCase()));

    return (
        <div ref={wrapRef} className="relative">
            <input
                id={id}
                className={inputCls}
                value={texto}
                placeholder={placeholder}
                autoComplete="off"
                onFocus={() => setAberto(true)}
                onChange={(e) => {
                    setBusca(e.target.value);
                    setAberto(true);
                    onChange(e.target.value);
                }}
                onBlur={() => setBusca(null)}
            />
            {aberto && filtradas.length > 0 && (
                <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-600 bg-gray-700 py-1 text-sm shadow-xl">
                    {filtradas.map((o) => (
                        <li key={o}>
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    onChange(o);
                                    setBusca(null);
                                    setAberto(false);
                                }}
                                className={`block w-full px-3 py-1.5 text-left transition hover:bg-gray-600 ${
                                    o === value ? 'font-semibold text-habilitar-orange-light' : 'text-gray-200'
                                }`}
                            >
                                {o}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// tipo: o que a mídia é; formato: a proporção (tamanho) do criativo
const TIPO_COMBO = ['imagem', 'video'];
const FORMATO_COMBO = ['1:1', '4:5', '5:4', '3:4', '4:3', '2:3', '3:2', '9:16', '16:9', '21:9'];

// Seletor de mídia (imagem OU vídeo) — input escondido dentro de label
function SeletorMidia({ arquivo, tipoPreview, onChange }) {
    const [erro, setErro] = useState(null);
    const inputRef = useRef(null);

    const handle = (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!/^(image|video)\//.test(file.type)) {
            setErro('Formato não suportado — escolha uma imagem ou um vídeo.');
            return;
        }
        setErro(null);
        onChange(file);
    };

    const previewUrl = arquivo ? URL.createObjectURL(arquivo) : null;

    return (
        <div>
            <label
                className={`flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden
                    rounded-xl border-2 border-dashed border-gray-600 bg-gray-700/50 transition hover:border-habilitar-orange`}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={handle}
                />
                {previewUrl ? (
                    tipoPreview === 'video' ? (
                        <video src={previewUrl} muted playsInline className="h-full w-full bg-black object-contain" />
                    ) : (
                        <img src={previewUrl} alt="Prévia da mídia" className="h-full w-full object-contain" />
                    )
                ) : (
                    <span className="flex flex-col items-center gap-2 p-4 text-center text-xs text-gray-400">
                        <Upload size={22} />
                        Clique para escolher imagem ou vídeo
                    </span>
                )}
            </label>
            {arquivo && (
                <p className="mt-2 text-center text-[11px] text-gray-500">
                    {arquivo.name} · {(arquivo.size / 1048576).toFixed(1)} MB ·{' '}
                    {arquivo.type.startsWith('video') ? 'vídeo' : 'imagem'}
                </p>
            )}
            {erro && <p className="mt-1 text-xs text-red-300">{erro}</p>}
        </div>
    );
}

export default function CriativosEditar() {
    const navigate = useNavigate();
    const { id } = useParams();
    const novo = !id;

    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);
    const [salvando, setSalvando] = useState(false);
    const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
    const { copiadoKey, copiar } = useCopiar();

    // Mídia existente (já salva no Storage) e mídia nova (File escolhido agora)
    const [midiaAtual, setMidiaAtual] = useState(null); // {url, tipo, nome}
    const [arquivoNovo, setArquivoNovo] = useState(null);

    const [form, setForm] = useState({
        tipo: '',
        titulo: '',
        formato: '',
        headline: '',
        texto_principal: '',
        descricao: '',
        campaign: '',
        adset_name: '',
        ad_name: '',
        creative_id: '',
        status: 'novo',
        observacoes: '',
    });

    // Progresso do upload do arquivo (só quando há mídia nova)
    const [progresso, setProgresso] = useState(null); // { fase, pct }

    useEffect(() => {
        if (novo) {
            setCarregando(false);
            return;
        }
        let cancelado = false;
        const carregar = async () => {
            try {
                const resp = await fetch('/api/criativos', { headers: { Accept: 'application/json' } });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const json = await resp.json();
                const row = (json.rows || []).find((r) => String(r.id) === String(id));
                if (cancelado) return;
                if (!row) throw new Error('Criativo não encontrado.');
                setMidiaAtual({ url: row.arquivo_url, tipo: row.tipo, nome: row.arquivo_nome });
                setForm({
                    tipo: row.tipo ?? '',
                    titulo: row.titulo ?? '',
                    formato: row.formato ?? '',
                    headline: row.headline ?? '',
                    texto_principal: row.texto_principal ?? '',
                    descricao: row.descricao ?? '',
                    campaign: row.campaign ?? '',
                    adset_name: row.adset_name ?? '',
                    ad_name: row.ad_name ?? '',
                    creative_id: row.creative_id ?? '',
                    status: row.status ?? 'novo',
                    observacoes: row.observacoes ?? '',
                });
            } catch (err) {
                if (!cancelado) setErro(err.message);
            } finally {
                if (!cancelado) setCarregando(false);
            }
        };
        carregar();
        return () => {
            cancelado = true;
        };
    }, [id, novo]);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    async function api(path, options = {}) {
        const res = await fetch(path, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        return body;
    }

    /** PUT direto no Storage via signed URL, com barra de progresso. */
    function uploadToStorage(url, file) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', url);
            xhr.setRequestHeader('x-upsert', 'true');
            if (file.type) xhr.setRequestHeader('Content-Type', file.type);
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) setProgresso((p) => ({ ...p, pct: Math.round((e.loaded / e.total) * 100) }));
            };
            xhr.onload = () =>
                xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage respondeu ${xhr.status}`));
            xhr.onerror = () => reject(new Error('Falha de rede no upload para o Storage'));
            xhr.send(file);
        });
    }

    /** Envia a mídia nova ao Storage e devolve {path, nome, tipo}. */
    async function enviarMidia(file) {
        setProgresso({ fase: 'Preparando upload…', pct: 0 });
        const up = await api('/api/criativos', {
            method: 'POST',
            body: JSON.stringify({ action: 'upload-url', filename: file.name }),
        });
        const absoluteUrl = /^https?:/i.test(up.signedUrl)
            ? up.signedUrl
            : `${import.meta.env.PUBLIC_SUPABASE_URL}${up.signedUrl}`;
        setProgresso({ fase: 'Enviando arquivo…', pct: 0 });
        await uploadToStorage(absoluteUrl, file);
        return { path: up.path, nome: file.name, tipo: file.type.startsWith('video') ? 'video' : 'imagem' };
    }

    const salvar = async () => {
        if (salvando) return;
        if (!form.titulo.trim()) return setErro('Dê um título ao criativo.');
        if (novo && !arquivoNovo) return setErro('Escolha a mídia (imagem ou vídeo).');
        setSalvando(true);
        setErro(null);
        try {
            if (novo) {
                setProgresso({ fase: 'Registrando…', pct: 100 });
                const midia = await enviarMidia(arquivoNovo);
                await api('/api/criativos', {
                    method: 'POST',
                    body: JSON.stringify({
                        ...form,
                        // o tipo escolhido vence; sem escolha, deriva do arquivo
                        tipo: form.tipo || midia.tipo,
                        arquivo_path: midia.path,
                        arquivo_nome: midia.nome,
                    }),
                });
            } else {
                const body = { ...form };
                if (arquivoNovo) {
                    const midia = await enviarMidia(arquivoNovo);
                    body.tipo = midia.tipo;
                    body.arquivo_path = midia.path;
                    body.arquivo_nome = midia.nome;
                }
                setProgresso({ fase: 'Salvando…', pct: 100 });
                await api(`/api/criativos?id=${encodeURIComponent(id)}`, {
                    method: 'PATCH',
                    body: JSON.stringify(body),
                });
            }
            navigate('/criativos');
        } catch (err) {
            setErro(err.message);
            setSalvando(false);
            setProgresso(null);
        }
    };

    // Exclusão só roda depois da confirmação no modal.
    const confirmarExclusao = async () => {
        setConfirmandoExclusao(false);
        try {
            await api(`/api/criativos?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            navigate('/criativos');
        } catch (err) {
            setErro(err.message);
        }
    };

    // Baixa a mídia (fetch → blob → clique programático com nome amigável).
    const baixarMidia = async () => {
        if (!midiaAtual) return;
        try {
            const blob = await (await fetch(midiaAtual.url)).blob();
            const href = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = href;
            a.download = midiaAtual.nome || 'criativo';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(href), 5000);
        } catch (err) {
            setErro(`Não consegui baixar a mídia: ${err.message}`);
        }
    };

    const copiado = copiadoKey === 'form-copy';
    const temCopy = Boolean(form.headline || form.texto_principal || form.descricao);
    const tipoPreview = arquivoNovo
        ? (arquivoNovo.type.startsWith('video') ? 'video' : 'imagem')
        : midiaAtual?.tipo;

    return (
        <div className="min-h-screen bg-gray-900 font-sans text-white">
            <header className="sticky top-0 z-20 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
                <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-4">
                    <button
                        onClick={() => navigate('/criativos')}
                        className="flex items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-300 transition hover:bg-gray-700"
                    >
                        <ChevronLeft size={16} />
                        Voltar
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-lg font-bold leading-tight">
                            {novo ? 'Novo criativo' : 'Editar criativo'}
                        </h1>
                        {!novo && form.titulo && (
                            <p className="truncate text-xs text-gray-400">{form.titulo}</p>
                        )}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        {salvando && <span className="text-xs text-gray-400">Salvando…</span>}
                        <button
                            onClick={salvar}
                            disabled={salvando || carregando}
                            className="rounded-lg bg-habilitar-orange px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                        >
                            {novo ? 'Publicar criativo' : 'Salvar'}
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
                    <div className="grid gap-6 lg:grid-cols-[440px_1fr]">
                        <div className="aspect-video animate-pulse rounded-xl bg-gray-800" />
                        <div className="space-y-4">
                            <div className="h-10 animate-pulse rounded-lg bg-gray-800" />
                            <div className="h-10 w-1/2 animate-pulse rounded-lg bg-gray-800" />
                            <div className="h-72 animate-pulse rounded-lg bg-gray-800" />
                        </div>
                    </div>
                ) : (
                    <div className="grid items-start gap-6 lg:grid-cols-[440px_1fr]">
                        {/* Mídia — grande e fixa enquanto rola a copy */}
                        <div className="space-y-3 lg:sticky lg:top-24">
                            {arquivoNovo ? (
                                <SeletorMidia arquivo={arquivoNovo} tipoPreview={tipoPreview} onChange={setArquivoNovo} />
                            ) : midiaAtual ? (
                                <div className="overflow-hidden rounded-xl border border-gray-700 bg-black">
                                    {midiaAtual.tipo === 'video' ? (
                                        // Play nativo: streaming direto do Storage do Supabase
                                        <video src={midiaAtual.url} controls playsInline preload="metadata" className="max-h-[60vh] w-full bg-black" />
                                    ) : (
                                        <img src={midiaAtual.url} alt={form.titulo} className="max-h-[60vh] w-full object-contain" />
                                    )}
                                </div>
                            ) : (
                                <SeletorMidia arquivo={null} tipoPreview={null} onChange={setArquivoNovo} />
                            )}

                            {/* Trocar mídia (editando) / remover escolha (novo) */}
                            {arquivoNovo && (
                                <button
                                    type="button"
                                    onClick={() => setArquivoNovo(null)}
                                    className="w-full rounded-lg bg-gray-700 px-4 py-2 text-xs font-semibold text-gray-300 transition hover:bg-gray-600"
                                >
                                    Remover arquivo escolhido{midiaAtual ? ' (mantém a mídia atual)' : ''}
                                </button>
                            )}
                            {!arquivoNovo && midiaAtual && (
                                <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-200 transition hover:bg-gray-600">
                                    <Upload size={15} />
                                    Trocar mídia
                                    <input
                                        type="file"
                                        accept="image/*,video/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            e.target.value = '';
                                            if (f) setArquivoNovo(f);
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

                            {midiaAtual && (
                                <button
                                    type="button"
                                    onClick={baixarMidia}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-200 transition hover:bg-gray-600"
                                >
                                    <Download size={15} />
                                    Baixar mídia
                                </button>
                            )}

                            {!novo && (
                                <button
                                    type="button"
                                    onClick={() => setConfirmandoExclusao(true)}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-900/60 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-950/40"
                                >
                                    <Trash2 size={15} />
                                    Excluir criativo
                                </button>
                            )}
                        </div>

                        {/* Campos */}
                        <div className="space-y-4">
                            <div>
                                <label className={labelCls} htmlFor="edit-titulo">Título *</label>
                                <input
                                    id="edit-titulo"
                                    className={inputCls}
                                    value={form.titulo}
                                    onChange={set('titulo')}
                                    placeholder="Vídeo O Menor Preço — Vertical 4:5"
                                />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-3">
                                <div>
                                    <label className={labelCls} htmlFor="edit-tipo">Tipo</label>
                                    <Combobox
                                        id="edit-tipo"
                                        value={form.tipo}
                                        onChange={set('tipo')}
                                        options={TIPO_COMBO}
                                        placeholder="imagem"
                                    />
                                </div>
                                <div>
                                    <label className={labelCls} htmlFor="edit-formato">Formato (proporção)</label>
                                    <Combobox
                                        id="edit-formato"
                                        value={form.formato}
                                        onChange={set('formato')}
                                        options={FORMATO_COMBO}
                                        placeholder="16:9"
                                    />
                                </div>
                                <div>
                                    <label className={labelCls} htmlFor="edit-status">Status</label>
                                    <select id="edit-status" className={inputCls} value={form.status} onChange={set('status')}>
                                        {STATUS_OPTIONS.map((s) => (
                                            <option key={s.id} value={s.id}>{s.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className={labelCls} htmlFor="edit-headline">Headline (título do anúncio)</label>
                                <input
                                    id="edit-headline"
                                    className={inputCls}
                                    value={form.headline}
                                    onChange={set('headline')}
                                    placeholder="Saiba mais"
                                />
                            </div>

                            <div>
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <label className={`${labelCls} mb-0`} htmlFor="edit-copy">
                                        Texto principal (copy do anúncio)
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            copiar(
                                                'form-copy',
                                                [
                                                    form.texto_principal && `TEXTO PRINCIPAL:\n${form.texto_principal}`,
                                                    form.headline && `TÍTULO (HEADLINE):\n${form.headline}`,
                                                    form.descricao && `DESCRIÇÃO:\n${form.descricao}`,
                                                ]
                                                    .filter(Boolean)
                                                    .join('\n\n'),
                                            )
                                        }
                                        disabled={!temCopy}
                                        title="Copia a copy completa, formatada para o Gerenciador de Anúncios"
                                        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                                            copiado
                                                ? 'bg-green-600 text-white'
                                                : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                        }`}
                                    >
                                        {copiado ? <Check size={13} /> : <ClipboardCopy size={13} />}
                                        {copiado ? 'Copiado!' : 'Copiar copy'}
                                    </button>
                                </div>
                                <textarea
                                    id="edit-copy"
                                    rows={14}
                                    className={`${textareaCls} leading-relaxed`}
                                    value={form.texto_principal}
                                    onChange={set('texto_principal')}
                                    placeholder={'⚠️ SORRISO, PRESTE ATENÇÃO!\n\nSe você quer tirar sua CNH…'}
                                />
                            </div>

                            <div>
                                <label className={labelCls} htmlFor="edit-descricao">Descrição (link)</label>
                                <input
                                    id="edit-descricao"
                                    className={inputCls}
                                    value={form.descricao}
                                    onChange={set('descricao')}
                                />
                            </div>

                            <details className="text-xs text-gray-400">
                                <summary className="cursor-pointer select-none hover:text-gray-200">
                                    Referência ao tráfego pago
                                </summary>
                                <div className="grid gap-4 pt-3 sm:grid-cols-2">
                                    <div>
                                        <label className={labelCls} htmlFor="edit-campaign">Campanha</label>
                                        <input id="edit-campaign" className={inputCls} value={form.campaign} onChange={set('campaign')} />
                                    </div>
                                    <div>
                                        <label className={labelCls} htmlFor="edit-adset">Conjunto (adset)</label>
                                        <input id="edit-adset" className={inputCls} value={form.adset_name} onChange={set('adset_name')} />
                                    </div>
                                    <div>
                                        <label className={labelCls} htmlFor="edit-ad">Anúncio</label>
                                        <input id="edit-ad" className={inputCls} value={form.ad_name} onChange={set('ad_name')} />
                                    </div>
                                    <div>
                                        <label className={labelCls} htmlFor="edit-creative">Creative ID</label>
                                        <input id="edit-creative" className={inputCls} value={form.creative_id} onChange={set('creative_id')} />
                                    </div>
                                </div>
                            </details>

                            <div>
                                <label className={labelCls} htmlFor="edit-obs">Observações para o gestor</label>
                                <input
                                    id="edit-obs"
                                    className={inputCls}
                                    value={form.observacoes}
                                    onChange={set('observacoes')}
                                    placeholder="Ex.: usar só no público frio"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </main>

            <ModalConfirmacao
                aberto={confirmandoExclusao}
                titulo="Excluir criativo?"
                detalhe={
                    form.titulo
                        ? `"${form.titulo}" será removido, junto com a mídia do Storage — não dá para desfazer.`
                        : 'A mídia também será removida do Storage — não dá para desfazer.'
                }
                onConfirmar={confirmarExclusao}
                onFechar={() => setConfirmandoExclusao(false)}
            />
        </div>
    );
}
