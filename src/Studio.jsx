import React, { useEffect, useRef, useState } from 'react';
import {
    Image as ImageIcon,
    Film,
    Sparkles,
    Copy,
    Download,
    Trash2,
    LogOut,
    Loader2,
    AlertTriangle,
    Upload,
    X,
    KeyRound,
    ArrowLeft,
    Clock,
} from 'lucide-react';

// -----------------------------------------------------------------------------
// AE Studio — geração de imagens (GLM-Image) e vídeos (CogVideoX-3) via Z.ai
//
// Fluxo: o navegador nunca fala com a Z.ai diretamente (a API key fica só no
// servidor). Ele chama /api/create-image, /api/create-video e /api/task-status,
// que exigem o header x-studio-token (senha compartilhada, env ZAI_STUDIO_TOKEN).
// Tarefas assíncronas são consultadas por polling a cada 5s até SUCCESS/FAIL.
// -----------------------------------------------------------------------------

const TOKEN_KEY = 'ae_studio_token';
const HISTORY_KEY = 'ae_studio_history';
const LINK_TTL_DAYS = 30; // os links gerados pela Z.ai expiram em 30 dias
const POLL_INTERVAL_MS = 5000;
const TASK_TIMEOUT_MS = 10 * 60 * 1000; // aborta espera após 10 min
const MAX_IMAGES = 2;
const MAX_TOTAL_B64 = 3.5 * 1024 * 1024; // limite prático do body na Vercel (4.5MB)

const IMAGE_SIZES = [
    { value: '1280x1280', label: 'Quadrado 1:1 (1080)' },
    { value: '1568x1056', label: 'Paisagem 3:2' },
    { value: '1472x1088', label: 'Paisagem 4:3' },
    { value: '1728x960', label: 'Paisagem 16:9' },
    { value: '1056x1568', label: 'Retrato 2:3' },
    { value: '1088x1472', label: 'Retrato 3:4' },
    { value: '960x1728', label: 'Retrato 9:16 (stories)' },
];

const VIDEO_SIZES = [
    { value: '', label: 'Automático (segue a imagem)' },
    { value: '1280x720', label: 'HD paisagem 16:9' },
    { value: '1920x1080', label: 'Full HD paisagem' },
    { value: '720x1280', label: 'HD retrato (reels/stories)' },
    { value: '1080x1920', label: 'Full HD retrato' },
    { value: '1024x1024', label: 'Quadrado 1:1' },
];

// --- Infraestrutura ----------------------------------------------------------

function newKey() {
    return typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function apiFetch(path, { method = 'GET', body, token } = {}) {
    const res = await fetch(path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'x-studio-token': token,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error || `Erro ${res.status} ao chamar ${path}`);
        err.status = res.status;
        throw err;
    }
    return data;
}

// Valida o token sem consumir a Z.ai: GET /api/task-status sem id devolve 400
// quando o token está certo e 401 quando está errado.
async function validateToken(token) {
    const res = await fetch('/api/task-status', { headers: { 'x-studio-token': token } });
    return res.status !== 401;
}

// Redimensiona/comprime a imagem no navegador (canvas → JPEG) antes do envio
// base64, para respeitar o limite de body da função (~3.5MB no total).
async function compressImage(file, maxDim = 1920, quality = 0.85) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return {
        name: file.name,
        preview: dataUrl,
        dataUrl,
        bytes: Math.round(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4),
    };
}

function loadHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveHistory(tasks) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(tasks.slice(0, 50)));
    } catch {
        /* quota cheia — histórico é best-effort */
    }
}

function daysLeft(createdAt) {
    const ms = createdAt + LINK_TTL_DAYS * 24 * 60 * 60 * 1000 - Date.now();
    return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function elapsedLabel(createdAt) {
    const seconds = Math.round((Date.now() - createdAt) / 1000);
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}min ${seconds % 60}s`;
}

const inputClass =
    'w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white placeholder-gray-400';
const labelClass = 'block text-sm font-medium text-gray-300 mb-2';

// --- Gate (login do Studio) --------------------------------------------------

function Gate({ onUnlock }) {
    const [token, setToken] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            const ok = await validateToken(token);
            if (!ok) {
                setError('Token de acesso incorreto');
                return;
            }
            sessionStorage.setItem(TOKEN_KEY, token);
            onUnlock(token);
        } catch {
            setError('Não foi possível validar o token — tente novamente');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <img
                        src="/assets/images/logo-autoescola-habilitar.webp"
                        alt="Autoescola Habilitar"
                        className="h-20 mx-auto mb-4"
                    />
                    <h1 className="text-2xl font-bold text-white">AE Studio</h1>
                    <p className="text-gray-400 mt-2">Geração de imagens e vídeos com IA</p>
                </div>

                <div className="bg-gray-800 rounded-xl border border-gray-700 p-8">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="studio-token" className={labelClass}>
                                Token de acesso
                            </label>
                            <input
                                id="studio-token"
                                type="password"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                placeholder="••••••••••"
                                className={inputClass}
                                autoFocus
                                required
                            />
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
                        >
                            {isLoading ? <Loader2 className="animate-spin h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
                            {isLoading ? 'Validando...' : 'Entrar no Studio'}
                        </button>
                    </form>
                </div>

                <div className="text-center mt-6">
                    <a href="/" className="text-gray-400 hover:text-white text-sm transition">
                        ← Voltar para o site
                    </a>
                </div>
            </div>
        </div>
    );
}

// --- Card de tarefa ----------------------------------------------------------

function TaskCard({ task, onRemove }) {
    const [copied, setCopied] = useState(false);

    const copyLink = async () => {
        if (!task.url) return;
        try {
            await navigator.clipboard.writeText(task.url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard bloqueado — o link segue clicável */
        }
    };

    const isVideo = task.type === 'video';

    return (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    {isVideo ? (
                        <Film className="h-4 w-4 text-blue-400 shrink-0" />
                    ) : (
                        <ImageIcon className="h-4 w-4 text-blue-400 shrink-0" />
                    )}
                    <p className="text-sm text-gray-200 truncate" title={task.prompt || 'Imagem de referência'}>
                        {task.prompt || '(sem prompt — só imagem)'}
                    </p>
                </div>
                <button
                    onClick={onRemove}
                    className="text-gray-500 hover:text-red-400 transition shrink-0"
                    title="Remover do histórico"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {task.status === 'PROCESSING' && (
                    <span className="inline-flex items-center gap-1.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/40 px-2.5 py-1 rounded-full">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Gerando · {elapsedLabel(task.createdAt)}
                    </span>
                )}
                {task.status === 'SUCCESS' && (
                    <span className="inline-flex items-center gap-1.5 bg-green-500/10 text-green-400 border border-green-500/40 px-2.5 py-1 rounded-full">
                        ✓ Pronto
                    </span>
                )}
                {task.status === 'FAIL' && (
                    <span className="inline-flex items-center gap-1.5 bg-red-500/10 text-red-400 border border-red-500/40 px-2.5 py-1 rounded-full">
                        <AlertTriangle className="h-3 w-3" />
                        Falhou
                    </span>
                )}
                {task.status === 'SUCCESS' && task.url && (
                    <span className="inline-flex items-center gap-1 text-gray-500">
                        <Clock className="h-3 w-3" />
                        {daysLeft(task.createdAt) > 0
                            ? `link expira em ${daysLeft(task.createdAt)} dia${daysLeft(task.createdAt) === 1 ? '' : 's'}`
                            : 'link expirado — gere novamente'}
                    </span>
                )}
                {task.error && <span className="text-red-400">{task.error}</span>}
                <span className="text-gray-500 ml-auto">
                    {new Date(task.createdAt).toLocaleString('pt-BR')}
                </span>
            </div>

            {task.status === 'SUCCESS' && task.url && (
                <div className="mt-4 space-y-3">
                    {isVideo ? (
                        <video src={task.url} poster={task.coverUrl} controls className="w-full rounded-lg bg-black" />
                    ) : (
                        <a href={task.url} target="_blank" rel="noopener noreferrer">
                            <img src={task.url} alt={task.prompt || 'Imagem gerada'} className="rounded-lg max-h-72 w-auto mx-auto" />
                        </a>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={copyLink}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg transition"
                        >
                            <Copy className="h-4 w-4" />
                            {copied ? 'Copiado!' : 'Copiar link'}
                        </button>
                        <a
                            href={task.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition"
                        >
                            <Download className="h-4 w-4" />
                            Abrir / baixar
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- Página principal --------------------------------------------------------

function StudioPage() {
    const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
    const [tab, setTab] = useState('image');
    const [tasks, setTasks] = useState(loadHistory);
    const [formError, setFormError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form — imagem
    const [imagePrompt, setImagePrompt] = useState('');
    const [imageSize, setImageSize] = useState('1280x1280');
    const [imageQuality, setImageQuality] = useState('standard');

    // Form — vídeo
    const [videoPrompt, setVideoPrompt] = useState('');
    const [videoImages, setVideoImages] = useState([]); // [{name, preview, dataUrl, bytes}]
    const [videoQuality, setVideoQuality] = useState('speed');
    const [videoDuration, setVideoDuration] = useState(5);
    const [videoFps, setVideoFps] = useState(30);
    const [videoSize, setVideoSize] = useState('');
    const [withAudio, setWithAudio] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    const tasksRef = useRef(tasks);
    useEffect(() => {
        tasksRef.current = tasks;
        saveHistory(tasks);
    }, [tasks]);

    // Polling das tarefas em PROCESSING
    useEffect(() => {
        if (!token) return undefined;

        const interval = setInterval(async () => {
            const pending = tasksRef.current.filter((t) => t.status === 'PROCESSING' && t.id);

            for (const task of pending) {
                if (Date.now() - task.createdAt > TASK_TIMEOUT_MS) {
                    setTasks((prev) =>
                        prev.map((p) =>
                            p.key === task.key
                                ? { ...p, status: 'FAIL', error: 'Tempo esgotado aguardando a Z.ai' }
                                : p,
                        ),
                    );
                    continue;
                }
                try {
                    const data = await apiFetch(`/api/task-status?id=${encodeURIComponent(task.id)}`, { token });
                    setTasks((prev) =>
                        prev.map((p) =>
                            p.key === task.key
                                ? {
                                      ...p,
                                      status: data.status,
                                      url: data.urls?.[0] || p.url,
                                      coverUrl: data.coverUrl || p.coverUrl,
                                      error: data.status === 'FAIL' ? 'A geração falhou na Z.ai' : p.error,
                                  }
                                : p,
                        ),
                    );
                } catch {
                    /* falha momentânea de rede/requisição: tenta de novo no próximo tick */
                }
            }
        }, POLL_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [token]);

    const addTask = (task) => setTasks((prev) => [task, ...prev]);

    const handleGenerateImage = async (e) => {
        e.preventDefault();
        setFormError('');
        setIsSubmitting(true);
        try {
            const data = await apiFetch('/api/create-image', {
                method: 'POST',
                token,
                body: { prompt: imagePrompt, size: imageSize, quality: imageQuality },
            });
            addTask({
                key: newKey(),
                type: 'image',
                prompt: imagePrompt.trim(),
                createdAt: Date.now(),
                status: data.mode === 'sync' ? 'SUCCESS' : data.status,
                id: data.id || null,
                url: data.url || null,
            });
            setImagePrompt('');
        } catch (err) {
            setFormError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddImages = async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length === 0) return;

        setFormError('');
        setIsUploading(true);
        try {
            const accepted = videoImages.slice();
            for (const file of files) {
                if (accepted.length >= MAX_IMAGES) break;
                if (!file.type.startsWith('image/')) continue;
                accepted.push(await compressImage(file));
            }
            const total = accepted.reduce((sum, img) => sum + img.bytes, 0);
            if (total > MAX_TOTAL_B64) {
                accepted.pop();
                setFormError('Imagens grandes demais — o total deve ficar abaixo de ~3.5MB após a compressão');
            }
            setVideoImages(accepted.slice(0, MAX_IMAGES));
        } catch {
            setFormError('Não foi possível processar a imagem escolhida');
        } finally {
            setIsUploading(false);
        }
    };

    const handleGenerateVideo = async (e) => {
        e.preventDefault();
        setFormError('');
        setIsSubmitting(true);
        try {
            const data = await apiFetch('/api/create-video', {
                method: 'POST',
                token,
                body: {
                    prompt: videoPrompt.trim() || undefined,
                    images: videoImages.map((img) => img.dataUrl),
                    quality: videoQuality,
                    duration: videoDuration,
                    fps: videoFps,
                    size: videoSize || undefined,
                    with_audio: withAudio,
                },
            });
            addTask({
                key: newKey(),
                type: 'video',
                prompt: videoPrompt.trim(),
                createdAt: Date.now(),
                status: data.status,
                id: data.id,
                url: null,
            });
            setVideoPrompt('');
            setVideoImages([]);
        } catch (err) {
            setFormError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const logout = () => {
        sessionStorage.removeItem(TOKEN_KEY);
        setToken('');
    };

    if (!token) return <Gate onUnlock={setToken} />;

    const twoFrameMode = videoImages.length === 2; // primeiro/último quadro → API exige speed

    return (
        <div className="min-h-screen bg-gray-900 text-white">
            {/* Header */}
            <header className="border-b border-gray-800 bg-gray-900/95 sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
                    <img
                        src="/assets/images/logo-autoescola-habilitar.webp"
                        alt="Autoescola Habilitar"
                        className="h-10"
                    />
                    <div>
                        <h1 className="font-bold leading-tight">AE Studio</h1>
                        <p className="text-xs text-gray-400">Imagens e vídeos com IA (Z.ai)</p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        <a
                            href="/"
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-white transition"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Site
                        </a>
                        <button
                            onClick={logout}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-red-400 transition"
                        >
                            <LogOut className="h-4 w-4" />
                            Sair
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
                {/* Aviso de expiração */}
                <div className="flex items-start gap-2.5 bg-yellow-500/5 border border-yellow-500/30 text-yellow-300/90 text-sm rounded-lg px-4 py-3">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>
                        Os links gerados pela Z.ai <strong>expiram em {LINK_TTL_DAYS} dias</strong>. Baixe os arquivos
                        que quiser manter — o histórico aqui é apenas local (navegador).
                    </p>
                </div>

                {/* Formulário */}
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
                    <div className="flex gap-2 mb-6">
                        <button
                            onClick={() => setTab('image')}
                            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                                tab === 'image'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-700/60 text-gray-300 hover:bg-gray-700'
                            }`}
                        >
                            <ImageIcon className="h-4 w-4" />
                            Imagem
                        </button>
                        <button
                            onClick={() => setTab('video')}
                            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                                tab === 'video'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-700/60 text-gray-300 hover:bg-gray-700'
                            }`}
                        >
                            <Film className="h-4 w-4" />
                            Vídeo
                        </button>
                    </div>

                    {formError && (
                        <div className="mb-5 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
                            {formError}
                        </div>
                    )}

                    {tab === 'image' && (
                        <form onSubmit={handleGenerateImage} className="space-y-5">
                            <div>
                                <label htmlFor="image-prompt" className={labelClass}>
                                    Descreva a imagem
                                </label>
                                <textarea
                                    id="image-prompt"
                                    value={imagePrompt}
                                    onChange={(e) => setImagePrompt(e.target.value)}
                                    placeholder="Ex.: foto de um instrutor de autoescola sorrindo ao lado de um carro, luz natural, estilo realista"
                                    rows={4}
                                    className={`${inputClass} resize-y`}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="image-size" className={labelClass}>
                                        Tamanho
                                    </label>
                                    <select
                                        id="image-size"
                                        value={imageSize}
                                        onChange={(e) => setImageSize(e.target.value)}
                                        className={inputClass}
                                    >
                                        {IMAGE_SIZES.map((s) => (
                                            <option key={s.value} value={s.value}>
                                                {s.label} · {s.value}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="image-quality" className={labelClass}>
                                        Qualidade
                                    </label>
                                    <select
                                        id="image-quality"
                                        value={imageQuality}
                                        onChange={(e) => setImageQuality(e.target.value)}
                                        className={inputClass}
                                    >
                                        <option value="standard">Padrão (mais rápida, ~5-10s)</option>
                                        <option value="hd">HD (mais detalhada, ~20s)</option>
                                    </select>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="animate-spin h-5 w-5" />
                                ) : (
                                    <Sparkles className="h-5 w-5" />
                                )}
                                {isSubmitting ? 'Enviando...' : 'Gerar imagem'}
                            </button>
                        </form>
                    )}

                    {tab === 'video' && (
                        <form onSubmit={handleGenerateVideo} className="space-y-5">
                            <div>
                                <div className="flex items-baseline justify-between mb-2">
                                    <label htmlFor="video-prompt" className="text-sm font-medium text-gray-300">
                                        Descreva o vídeo
                                    </label>
                                    <span
                                        className={`text-xs ${videoPrompt.length > 512 ? 'text-red-400' : 'text-gray-500'}`}
                                    >
                                        {videoPrompt.length}/512
                                    </span>
                                </div>
                                <textarea
                                    id="video-prompt"
                                    value={videoPrompt}
                                    onChange={(e) => setVideoPrompt(e.target.value)}
                                    placeholder="Ex.: um carro prata percorrendo uma avenida arborizada ao pôr do sol, câmera acompanha por trás"
                                    rows={3}
                                    maxLength={512}
                                    className={`${inputClass} resize-y`}
                                />
                                <p className="text-xs text-gray-500 mt-1.5">
                                    Prompt é opcional quando você envia imagem(s) — com 1 imagem ela vira o primeiro
                                    quadro do vídeo.
                                </p>
                            </div>

                            {/* Upload de imagens */}
                            <div>
                                <label className={labelClass}>
                                    Imagens de referência (opcional — 1 ou 2)
                                </label>
                                <div className="flex flex-wrap items-center gap-3">
                                    <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-sm cursor-pointer transition">
                                        {isUploading ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Upload className="h-4 w-4" />
                                        )}
                                        {isUploading ? 'Processando...' : 'Escolher imagem'}
                                        <input
                                            type="file"
                                            accept="image/png,image/jpeg"
                                            multiple
                                            onChange={handleAddImages}
                                            className="hidden"
                                            disabled={isUploading || videoImages.length >= MAX_IMAGES}
                                        />
                                    </label>
                                    {videoImages.map((img, index) => (
                                        <div
                                            key={index}
                                            className="relative group"
                                            title={index === 0 ? 'Primeiro quadro' : 'Último quadro'}
                                        >
                                            <img
                                                src={img.preview}
                                                alt={img.name}
                                                className="h-16 w-24 object-cover rounded-lg border border-gray-600"
                                            />
                                            <span className="absolute bottom-1 left-1 bg-black/70 text-[10px] px-1.5 py-0.5 rounded">
                                                {videoImages.length === 2 ? (index === 0 ? '1º' : 'último') : '1º quadro'}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setVideoImages((prev) => prev.filter((_, i) => i !== index))
                                                }
                                                className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                                                title="Remover imagem"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                {twoFrameMode && (
                                    <p className="text-xs text-yellow-300/80 mt-2">
                                        Com 2 imagens (primeiro/último quadro) a Z.ai só aceita qualidade
                                        "speed" — a seleção abaixo fica travada.
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="video-quality" className={labelClass}>
                                        Qualidade
                                    </label>
                                    <select
                                        id="video-quality"
                                        value={twoFrameMode ? 'speed' : videoQuality}
                                        onChange={(e) => setVideoQuality(e.target.value)}
                                        disabled={twoFrameMode}
                                        className={`${inputClass} disabled:opacity-50`}
                                    >
                                        <option value="speed">Speed (mais rápido)</option>
                                        <option value="quality">Quality (mais fiel)</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="video-size" className={labelClass}>
                                        Formato
                                    </label>
                                    <select
                                        id="video-size"
                                        value={videoSize}
                                        onChange={(e) => setVideoSize(e.target.value)}
                                        className={inputClass}
                                    >
                                        {VIDEO_SIZES.map((s) => (
                                            <option key={s.value} value={s.value}>
                                                {s.label}
                                                {s.value ? ` · ${s.value}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="video-duration" className={labelClass}>
                                        Duração
                                    </label>
                                    <select
                                        id="video-duration"
                                        value={videoDuration}
                                        onChange={(e) => setVideoDuration(Number(e.target.value))}
                                        className={inputClass}
                                    >
                                        <option value={5}>5 segundos</option>
                                        <option value={10}>10 segundos</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="video-fps" className={labelClass}>
                                        FPS
                                    </label>
                                    <select
                                        id="video-fps"
                                        value={videoFps}
                                        onChange={(e) => setVideoFps(Number(e.target.value))}
                                        className={inputClass}
                                    >
                                        <option value={30}>30 fps</option>
                                        <option value={60}>60 fps</option>
                                    </select>
                                </div>
                            </div>

                            <label className="flex items-center gap-3 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={withAudio}
                                    onChange={(e) => setWithAudio(e.target.checked)}
                                    className="h-4 w-4 accent-blue-600"
                                />
                                <span className="text-sm text-gray-300">
                                    Gerar efeitos sonoros com IA (with_audio)
                                </span>
                            </label>

                            <button
                                type="submit"
                                disabled={isSubmitting || (!videoPrompt.trim() && videoImages.length === 0)}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="animate-spin h-5 w-5" />
                                ) : (
                                    <Sparkles className="h-5 w-5" />
                                )}
                                {isSubmitting ? 'Enviando...' : 'Gerar vídeo'}
                            </button>
                            <p className="text-xs text-gray-500 text-center">
                                Vídeos costumam levar alguns minutos — a tarefa aparece na fila abaixo e atualiza
                                sozinha.
                            </p>
                        </form>
                    )}
                </div>

                {/* Fila / histórico */}
                <section className="space-y-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        Tarefas
                        <span className="text-sm font-normal text-gray-500">({tasks.length})</span>
                    </h2>
                    {tasks.length === 0 ? (
                        <p className="text-gray-500 text-sm border border-dashed border-gray-700 rounded-xl px-4 py-8 text-center">
                            Nenhuma geração ainda — crie sua primeira imagem ou vídeo acima.
                        </p>
                    ) : (
                        tasks.map((task) => (
                            <TaskCard
                                key={task.key}
                                task={task}
                                onRemove={() => setTasks((prev) => prev.filter((p) => p.key !== task.key))}
                            />
                        ))
                    )}
                </section>
            </main>
        </div>
    );
}

export default StudioPage;
