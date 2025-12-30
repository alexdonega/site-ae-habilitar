import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

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
const STATUS_CONFIG = {
    novo: { label: 'Novo', color: 'bg-blue-500', textColor: 'text-blue-500' },
    em_analise: { label: 'Em Análise', color: 'bg-yellow-500', textColor: 'text-yellow-500' },
    qualificado: { label: 'Qualificado', color: 'bg-green-500', textColor: 'text-green-500' },
    aprovado: { label: 'Aprovado', color: 'bg-emerald-500', textColor: 'text-emerald-500' },
    convertido: { label: 'Convertido', color: 'bg-purple-500', textColor: 'text-purple-500' },
    rejeitado: { label: 'Rejeitado', color: 'bg-red-500', textColor: 'text-red-500' }
};

// Ícones SVG
const Icons = {
    Users: () => (
        <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
    ),
    Clock: () => (
        <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
    CheckCircle: () => (
        <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
    Star: () => (
        <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
    ),
    Search: () => (
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
    ),
    ExternalLink: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
    ),
    Eye: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
    ),
    Filter: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
    )
};

// Componente de Card de Métrica
const MetricCard = ({ title, value, icon: Icon }) => (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div className="flex justify-between items-start mb-2">
            <span className="text-gray-400 text-sm">{title}</span>
            <Icon />
        </div>
        <div className="text-3xl font-bold text-white">{value}</div>
    </div>
);

// Componente de Badge de Status
const StatusBadge = ({ status }) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.novo;
    return (
        <span className={`${config.color} text-white text-xs px-3 py-1 rounded-full font-medium`}>
            {config.label}
        </span>
    );
};

function LeadsPage() {
    const navigate = useNavigate();
    const [leads, setLeads] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState('todos');
    const [sortBy, setSortBy] = useState('data');
    const [sortOrder, setSortOrder] = useState('desc');

    // Verificar autenticação
    useEffect(() => {
        if (!checkAuth()) {
            navigate('/login');
        }
    }, [navigate]);

    // Logout
    const handleLogout = () => {
        localStorage.removeItem('ae_habilitar_auth');
        navigate('/login');
    };

    // Carregar leads do localStorage
    useEffect(() => {
        const storedLeads = localStorage.getItem('ae_habilitar_leads');
        if (storedLeads) {
            setLeads(JSON.parse(storedLeads));
        } else {
            // Dados de exemplo se não houver leads
            const sampleLeads = [
                {
                    id: '1',
                    nome_completo: 'Alcides Medeiros',
                    email: 'alcidesmedeiros.ott@gmail.com',
                    whatsapp: '+5519998152223',
                    categoria_desejada: 'Carro [B]',
                    valor: 1890,
                    score: 45,
                    status: 'novo',
                    created_at: '2025-12-29T00:54:00',
                    notas: [],
                    interacoes: []
                },
                {
                    id: '2',
                    nome_completo: 'Jonathan Tebaldi',
                    email: 'tebaldi@naveo.com.br',
                    whatsapp: '+5511999887766',
                    categoria_desejada: 'Moto [A]',
                    valor: 1290,
                    score: 15,
                    status: 'novo',
                    created_at: '2025-12-29T00:54:00',
                    notas: [],
                    interacoes: []
                },
                {
                    id: '3',
                    nome_completo: 'Wagner',
                    email: 'wagner.piva@makeda.com.br',
                    whatsapp: '+5511888776655',
                    categoria_desejada: 'Carro e Moto [AB]',
                    valor: 2890,
                    score: 25,
                    status: 'novo',
                    created_at: '2025-12-29T00:54:00',
                    notas: [],
                    interacoes: []
                },
                {
                    id: '4',
                    nome_completo: 'Vinicius Ribeiro',
                    email: 'vinicius@atomicpay.com.br',
                    whatsapp: '+5521999665544',
                    categoria_desejada: 'Caminhão [C]',
                    valor: 2490,
                    score: 40,
                    status: 'novo',
                    created_at: '2025-12-29T00:54:00',
                    notas: [],
                    interacoes: []
                }
            ];
            setLeads(sampleLeads);
            localStorage.setItem('ae_habilitar_leads', JSON.stringify(sampleLeads));
        }
    }, []);

    // Calcular métricas
    const metrics = useMemo(() => {
        const total = leads.length;
        const novos = leads.filter(l => l.status === 'novo').length;
        const qualificados = leads.filter(l => l.status === 'qualificado').length;
        const convertidos = leads.filter(l => l.status === 'convertido').length;
        return { total, novos, qualificados, convertidos };
    }, [leads]);

    // Contagem por status para tabs
    const statusCounts = useMemo(() => {
        return {
            todos: leads.length,
            novo: leads.filter(l => l.status === 'novo').length,
            em_analise: leads.filter(l => l.status === 'em_analise').length,
            qualificado: leads.filter(l => l.status === 'qualificado').length,
            aprovado: leads.filter(l => l.status === 'aprovado').length,
            convertido: leads.filter(l => l.status === 'convertido').length,
            rejeitado: leads.filter(l => l.status === 'rejeitado').length
        };
    }, [leads]);

    // Filtrar e ordenar leads
    const filteredLeads = useMemo(() => {
        let result = [...leads];

        // Filtro por status
        if (activeFilter !== 'todos') {
            result = result.filter(l => l.status === activeFilter);
        }

        // Filtro por busca
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(l =>
                l.nome_completo?.toLowerCase().includes(term) ||
                l.email?.toLowerCase().includes(term) ||
                l.empresa?.toLowerCase().includes(term)
            );
        }

        // Ordenação
        result.sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case 'data':
                    comparison = new Date(b.created_at) - new Date(a.created_at);
                    break;
                case 'nome':
                    comparison = (a.nome_completo || '').localeCompare(b.nome_completo || '');
                    break;
                case 'score':
                    comparison = (b.score || 0) - (a.score || 0);
                    break;
                case 'valor':
                    comparison = (b.valor || 0) - (a.valor || 0);
                    break;
                default:
                    comparison = 0;
            }
            return sortOrder === 'desc' ? comparison : -comparison;
        });

        return result;
    }, [leads, activeFilter, searchTerm, sortBy, sortOrder]);

    const handleViewLead = (lead) => {
        navigate(`/lead/${lead.id}`);
    };

    const tabs = [
        { key: 'todos', label: 'Todos' },
        { key: 'novo', label: 'Novos' },
        { key: 'em_analise', label: 'Em Análise' },
        { key: 'qualificado', label: 'Qualificados' },
        { key: 'aprovado', label: 'Aprovados' },
        { key: 'convertido', label: 'Convertidos' },
        { key: 'rejeitado', label: 'Rejeitados' }
    ];

    const sortOptions = [
        { value: 'data', label: 'Data' },
        { value: 'score', label: 'Score' },
        { value: 'nome', label: 'Nome' },
        { value: 'valor', label: 'Valor' }
    ];

    return (
        <div className="min-h-screen bg-gray-900 text-white">
            {/* Header */}
            <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <h1 className="text-xl font-bold">Leads & CRM</h1>
                    <div className="flex items-center gap-3">
                        <a
                            href="/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 border border-gray-600 rounded-lg hover:bg-gray-800 transition"
                        >
                            <Icons.ExternalLink />
                            <span>Ver Formulário</span>
                        </a>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600/20 border border-red-600/50 text-red-400 rounded-lg hover:bg-red-600/30 transition"
                        >
                            Sair
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                {/* Métricas */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <MetricCard title="Total de Leads" value={metrics.total} icon={Icons.Users} />
                    <MetricCard title="Novos (aguardando)" value={metrics.novos} icon={Icons.Clock} />
                    <MetricCard title="Qualificados" value={metrics.qualificados} icon={Icons.CheckCircle} />
                    <MetricCard title="Convertidos" value={metrics.convertidos} icon={Icons.Star} />
                </div>

                {/* Busca e Ordenação */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="flex-1 relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Icons.Search />
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar por nome, email ou empresa..."
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 text-white placeholder-gray-400"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <button className="absolute inset-y-0 right-16 flex items-center px-3 text-red-400 hover:text-red-300">
                            <Icons.Filter />
                        </button>
                        <button className="absolute inset-y-0 right-0 px-4 bg-blue-600 hover:bg-blue-700 rounded-r-lg font-medium transition">
                            Buscar
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-sm">Ordenar:</span>
                        {sortOptions.map(option => (
                            <button
                                key={option.value}
                                onClick={() => {
                                    if (sortBy === option.value) {
                                        setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
                                    } else {
                                        setSortBy(option.value);
                                        setSortOrder('desc');
                                    }
                                }}
                                className={`px-3 py-1.5 rounded-lg text-sm transition ${sortBy === option.value
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                    }`}
                            >
                                {option.label}
                                {sortBy === option.value && (
                                    <span className="ml-1">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tabs de Status */}
                <div className="flex flex-wrap gap-2 mb-6">
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveFilter(tab.key)}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition ${activeFilter === tab.key
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                                }`}
                        >
                            {tab.label}
                            <span className="ml-2 px-1.5 py-0.5 bg-black/30 rounded text-xs">
                                {statusCounts[tab.key]}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Lista de Leads */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-700">
                        <h2 className="font-semibold">Lista de Leads</h2>
                        <p className="text-gray-400 text-sm">{filteredLeads.length} leads encontrados</p>
                    </div>

                    {/* Tabela */}
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-900/50">
                                <tr className="text-left text-gray-400 text-xs uppercase">
                                    <th className="px-6 py-3 font-medium">Nome</th>
                                    <th className="px-6 py-3 font-medium">Produto</th>
                                    <th className="px-6 py-3 font-medium">Valor</th>
                                    <th className="px-6 py-3 font-medium text-center">Score</th>
                                    <th className="px-6 py-3 font-medium">Status</th>
                                    <th className="px-6 py-3 font-medium text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {filteredLeads.map(lead => (
                                    <tr key={lead.id} className="hover:bg-gray-700/50 transition">
                                        <td className="px-6 py-4">
                                            <div>
                                                <div className="font-medium text-white">{lead.nome_completo}</div>
                                                <div className="text-gray-400 text-sm">{lead.email}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-300">
                                            {lead.categoria_desejada || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-gray-300">
                                            {formatCurrency(lead.valor)}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gray-700 text-white font-medium">
                                                {lead.score || 0}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={lead.status} />
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => handleViewLead(lead)}
                                                className="p-2 hover:bg-gray-600 rounded-lg transition text-gray-400 hover:text-white"
                                                title="Ver detalhes"
                                            >
                                                <Icons.Eye />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredLeads.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                                            Nenhum lead encontrado
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default LeadsPage;
