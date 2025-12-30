import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

// Verificar autenticação
const checkAuth = () => {
    const auth = localStorage.getItem('ae_habilitar_auth');
    if (!auth) return false;
    try {
        const { loggedIn } = JSON.parse(auth);
        return loggedIn === true;
    } catch {
        return false;
    }
};

// Utilitários
const formatDate = (dateString) => {
    if (!dateString) return 'Desconhecido';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).replace(',', ',');
};

const formatCurrency = (value) => {
    if (!value) return '-';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
};

const getInitial = (name) => {
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
};

// Status config
const STATUS_OPTIONS = [
    { value: 'novo', label: 'Novo' },
    { value: 'em_analise', label: 'Em Análise' },
    { value: 'qualificado', label: 'Qualificado' },
    { value: 'aprovado', label: 'Aprovado' },
    { value: 'convertido', label: 'Convertido' },
    { value: 'rejeitado', label: 'Rejeitado' }
];

const STATUS_CONFIG = {
    novo: { label: 'Novo', color: 'bg-blue-500' },
    em_analise: { label: 'Em Análise', color: 'bg-yellow-500' },
    qualificado: { label: 'Qualificado', color: 'bg-green-500' },
    aprovado: { label: 'Aprovado', color: 'bg-emerald-500' },
    convertido: { label: 'Convertido', color: 'bg-purple-500' },
    rejeitado: { label: 'Rejeitado', color: 'bg-red-500' }
};

// Ícones
const Icons = {
    ArrowLeft: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
    ),
    Phone: () => (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
    ),
    Mail: () => (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
    ),
    WhatsApp: () => (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
    ),
    Trash: () => (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
    )
};

// Componente de Campo de Formulário
const FormField = ({ label, value }) => {
    if (!value) return null;
    return (
        <div className="mb-4">
            <label className="text-gray-400 text-xs uppercase tracking-wider block mb-1">{label}</label>
            <p className="text-white">{value}</p>
        </div>
    );
};

function LeadDetailPage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [lead, setLead] = useState(null);
    const [newStatus, setNewStatus] = useState('');
    const [newNote, setNewNote] = useState('');
    const [loading, setLoading] = useState(true);

    // Verificar autenticação
    useEffect(() => {
        if (!checkAuth()) {
            navigate('/login');
        }
    }, [navigate]);

    // Carregar lead
    useEffect(() => {
        const storedLeads = localStorage.getItem('ae_habilitar_leads');
        if (storedLeads) {
            const leads = JSON.parse(storedLeads);
            const foundLead = leads.find(l => l.id === id);
            if (foundLead) {
                setLead(foundLead);
                setNewStatus(foundLead.status);
            }
        }
        setLoading(false);
    }, [id]);

    // Atualizar status
    const handleUpdateStatus = () => {
        if (!lead || newStatus === lead.status) return;

        const storedLeads = localStorage.getItem('ae_habilitar_leads');
        if (storedLeads) {
            const leads = JSON.parse(storedLeads);
            const index = leads.findIndex(l => l.id === id);
            if (index !== -1) {
                const updatedLead = {
                    ...leads[index],
                    status: newStatus,
                    interacoes: [
                        ...(leads[index].interacoes || []),
                        {
                            id: Date.now().toString(),
                            tipo: 'status_change',
                            de: lead.status,
                            para: newStatus,
                            data: new Date().toISOString()
                        }
                    ]
                };
                leads[index] = updatedLead;
                localStorage.setItem('ae_habilitar_leads', JSON.stringify(leads));
                setLead(updatedLead);
            }
        }
    };

    // Adicionar nota
    const handleAddNote = () => {
        if (!lead || !newNote.trim()) return;

        const storedLeads = localStorage.getItem('ae_habilitar_leads');
        if (storedLeads) {
            const leads = JSON.parse(storedLeads);
            const index = leads.findIndex(l => l.id === id);
            if (index !== -1) {
                const nota = {
                    id: Date.now().toString(),
                    texto: newNote.trim(),
                    data: new Date().toISOString()
                };
                const updatedLead = {
                    ...leads[index],
                    notas: [...(leads[index].notas || []), nota],
                    interacoes: [
                        ...(leads[index].interacoes || []),
                        {
                            id: Date.now().toString(),
                            tipo: 'nota',
                            texto: newNote.trim(),
                            data: new Date().toISOString()
                        }
                    ]
                };
                leads[index] = updatedLead;
                localStorage.setItem('ae_habilitar_leads', JSON.stringify(leads));
                setLead(updatedLead);
                setNewNote('');
            }
        }
    };

    // Deletar nota
    const handleDeleteNote = (noteId) => {
        if (!lead) return;

        const storedLeads = localStorage.getItem('ae_habilitar_leads');
        if (storedLeads) {
            const leads = JSON.parse(storedLeads);
            const index = leads.findIndex(l => l.id === id);
            if (index !== -1) {
                const updatedLead = {
                    ...leads[index],
                    notas: (leads[index].notas || []).filter(n => n.id !== noteId)
                };
                leads[index] = updatedLead;
                localStorage.setItem('ae_habilitar_leads', JSON.stringify(leads));
                setLead(updatedLead);
            }
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-white">Carregando...</div>
            </div>
        );
    }

    if (!lead) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-white mb-4">Lead não encontrado</p>
                    <button
                        onClick={() => navigate('/lead')}
                        className="text-blue-400 hover:text-blue-300"
                    >
                        Voltar para lista
                    </button>
                </div>
            </div>
        );
    }

    const statusConfig = STATUS_CONFIG[lead.status] || STATUS_CONFIG.novo;

    return (
        <div className="min-h-screen bg-gray-900 text-white">
            {/* Header */}
            <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <h1 className="text-xl font-bold">Lead: {lead.nome_completo}</h1>
                    <button
                        onClick={() => navigate('/lead')}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-600 rounded-lg hover:bg-gray-800 transition"
                    >
                        <Icons.ArrowLeft />
                        <span>Voltar</span>
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Coluna Principal */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Card do Lead */}
                        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                            <div className="flex items-start gap-4">
                                {/* Avatar */}
                                <div className="w-16 h-16 rounded-full bg-indigo-500 flex items-center justify-center text-2xl font-bold flex-shrink-0">
                                    {getInitial(lead.nome_completo)}
                                </div>

                                {/* Info */}
                                <div className="flex-1">
                                    <h2 className="text-xl font-bold text-white">{lead.nome_completo}</h2>
                                    <div className="flex flex-wrap items-center gap-4 mt-2 text-gray-400">
                                        <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:text-white transition">
                                            <Icons.Mail />
                                            {lead.email}
                                        </a>
                                        {lead.whatsapp && (
                                            <a
                                                href={`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-green-400 hover:text-green-300 transition"
                                            >
                                                <Icons.WhatsApp />
                                                {lead.whatsapp}
                                            </a>
                                        )}
                                    </div>
                                </div>

                                {/* Score */}
                                <div className="text-center">
                                    <div className="w-20 h-20 rounded-xl border-2 border-gray-600 flex flex-col items-center justify-center">
                                        <span className="text-3xl font-bold">{lead.score || 0}</span>
                                        <span className="text-xs text-gray-400 uppercase">Score</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Respostas do Formulário */}
                        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                            <h3 className="text-lg font-semibold mb-6">Respostas do Formulário</h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                                <FormField label="Empresa" value={lead.empresa} />
                                <FormField label="Fase da Empresa" value={lead.fase_empresa} />
                                <FormField label="Faturamento Anual" value={formatCurrency(lead.faturamento)} />
                                <FormField label="Já participou de mentoria?" value={lead.participou_mentoria} />
                                <div className="md:col-span-2">
                                    <FormField label="Tem recurso disponível?" value={lead.recurso_disponivel} />
                                </div>
                                <div className="md:col-span-2">
                                    <FormField label="Maior Desafio" value={lead.maior_desafio} />
                                </div>
                                <div className="md:col-span-2">
                                    <FormField label="O que atraiu na mentoria" value={lead.atraiu_mentoria} />
                                </div>
                                <div className="md:col-span-2">
                                    <FormField label="Por que devo escolher você?" value={lead.porque_escolher} />
                                </div>
                                <div className="md:col-span-2">
                                    <FormField label="Expectativa" value={lead.expectativa} />
                                </div>
                                <FormField label="Categoria Desejada" value={lead.categoria_desejada} />
                            </div>
                        </div>

                        {/* Histórico de Interações */}
                        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                            <h3 className="text-lg font-semibold mb-4">Histórico de Interações</h3>

                            {(!lead.interacoes || lead.interacoes.length === 0) ? (
                                <p className="text-gray-400 text-center py-8">Nenhuma interação registrada</p>
                            ) : (
                                <div className="space-y-4">
                                    {lead.interacoes.slice().reverse().map(interacao => (
                                        <div key={interacao.id} className="flex gap-4 p-3 bg-gray-700/50 rounded-lg">
                                            <div className="flex-1">
                                                {interacao.tipo === 'status_change' ? (
                                                    <p className="text-sm">
                                                        Status alterado de{' '}
                                                        <span className="text-yellow-400">{STATUS_CONFIG[interacao.de]?.label}</span>
                                                        {' '}para{' '}
                                                        <span className="text-green-400">{STATUS_CONFIG[interacao.para]?.label}</span>
                                                    </p>
                                                ) : (
                                                    <p className="text-sm">{interacao.texto}</p>
                                                )}
                                                <p className="text-xs text-gray-400 mt-1">
                                                    {formatDate(interacao.data)}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Coluna Lateral */}
                    <div className="space-y-6">
                        {/* Status */}
                        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                            <h3 className="text-lg font-semibold mb-4">Status</h3>

                            <span className={`${statusConfig.color} text-white px-4 py-2 rounded-full text-sm font-medium inline-block mb-6`}>
                                {statusConfig.label}
                            </span>

                            <div>
                                <label className="text-gray-400 text-xs uppercase tracking-wider block mb-2">
                                    Alterar Status
                                </label>
                                <select
                                    value={newStatus}
                                    onChange={(e) => setNewStatus(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white mb-3"
                                >
                                    {STATUS_OPTIONS.map(option => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={handleUpdateStatus}
                                    disabled={newStatus === lead.status}
                                    className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition"
                                >
                                    Atualizar Status
                                </button>
                            </div>
                        </div>

                        {/* Adicionar Nota */}
                        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                            <h3 className="text-lg font-semibold mb-4">Adicionar Nota</h3>

                            <textarea
                                value={newNote}
                                onChange={(e) => setNewNote(e.target.value)}
                                placeholder="Escreva uma nota..."
                                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500 text-white placeholder-gray-400 resize-none mb-3"
                                rows={4}
                            />
                            <button
                                onClick={handleAddNote}
                                disabled={!newNote.trim()}
                                className="w-full py-2.5 bg-gray-600 hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition"
                            >
                                Adicionar Nota
                            </button>

                            {/* Lista de Notas */}
                            {lead.notas && lead.notas.length > 0 && (
                                <div className="mt-4 space-y-2">
                                    {lead.notas.slice().reverse().map(nota => (
                                        <div key={nota.id} className="p-3 bg-gray-700/50 rounded-lg">
                                            <div className="flex justify-between items-start gap-2">
                                                <p className="text-sm text-gray-300">{nota.texto}</p>
                                                <button
                                                    onClick={() => handleDeleteNote(nota.id)}
                                                    className="text-gray-500 hover:text-red-400 transition p-1"
                                                    title="Excluir nota"
                                                >
                                                    <Icons.Trash />
                                                </button>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">{formatDate(nota.data)}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Informações */}
                        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                            <h3 className="text-lg font-semibold mb-4">Informações</h3>

                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Criado em</span>
                                    <span className="text-white">{formatDate(lead.created_at)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Navegador</span>
                                    <span className="text-gray-500">Desconhecido</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Sistema</span>
                                    <span className="text-gray-500">Desconhecido</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default LeadDetailPage;
