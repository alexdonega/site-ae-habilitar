// =============================================================================
//  Helper compartilhado da integração FalazApp (criação de contatos)
// =============================================================================
//  Este arquivo NÃO é um endpoint: arquivos com prefixo "_" no diretório api/
//  são ignorados pelo builder da Vercel, então ele só existe para ser importado
//  pela função real (falazapp-contact.js) e pelo middleware de dev do Vite
//  (vite.config.js), que não executa as funções da Vercel.
//
//  API: POST {FALAZAPP_API_URL}/api/contacts — docs em
//  principal.suitehelpers.com.br → "API Criar Contato". Autenticação via
//  Authorization: Bearer.
//
//  Segurança: a FALAZAPP_API_TOKEN vive apenas em process.env (server-side).
//  Ela nunca recebe prefixo VITE_/PUBLIC_ e por isso nunca vai para o bundle
//  do cliente.
// =============================================================================

export const FALAZAPP_DEFAULT_API_URL = 'https://back.falazapp.com.br';

// Campos fixos da campanha "Meteórico": os leads do formulário de pré-matrícula
// são todos de Sorriso/MT e caem na carteira do atendente responsável pelo
// atendimento (sem carteiraId o contato "some" da listagem padrão do painel).
const FIXED_FIELDS = {
    estado: 'MT',
    cidade: 'Sorriso',
    referencia: 'Meteórico Setembro/2026',
    carteiraId: '254',
};

// O formulário grava o WhatsApp mascarado, ex. "(65) 99999-9999" (DDD + 8/9
// dígitos, sem DDI). A FalazApp espera apenas dígitos com DDI, ex.
// "5565999999999", então normalizamos aqui.
export function normalizeWhatsapp(whatsapp) {
    const digits = String(whatsapp || '').replace(/\D/g, '');
    return digits.length >= 12 ? digits : `55${digits}`;
}

// Metadados de rastreamento enviados junto com o lead e gravados no contato
// como "informações extras" (extraInfo). Campos vazios/nulos são ignorados.
const EXTRA_INFO_FIELDS = [
    'produto',
    'created_at',
    'updated_at',
    'page_url',
    'page_title',
    'referrer',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'formulario',
];

export function buildExtraInfo(tracking = {}) {
    return EXTRA_INFO_FIELDS
        .filter((field) => {
            const value = tracking[field];
            return value !== undefined && value !== null && String(value).trim() !== '';
        })
        .map((field) => ({ name: field, value: String(tracking[field]) }));
}

// Cria o contato na FalazApp a partir dos campos do lead (mesmos valores que
// vão para a tabela "leads" do Supabase). Devolve o corpo da resposta já
// parseado; erros viram exceção com statusCode.
export async function createFalazappContact({ nome_completo, whatsapp, email, tracking, token, apiUrl }) {
    if (!nome_completo || !whatsapp || !email) {
        const err = new Error('Envie { nome_completo, whatsapp, email }');
        err.statusCode = 400;
        throw err;
    }
    if (!token) {
        const err = new Error('FALAZAPP_API_TOKEN não configurada no ambiente');
        err.statusCode = 500;
        throw err;
    }

    const base = (apiUrl || FALAZAPP_DEFAULT_API_URL).replace(/\/$/, '');

    let response;
    try {
        response = await fetch(`${base}/api/contacts`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: nome_completo,
                number: normalizeWhatsapp(whatsapp),
                email,
                extraInfo: buildExtraInfo(tracking),
                ...FIXED_FIELDS,
            }),
        });
    } catch {
        const err = new Error('Falha de comunicação com a API da FalazApp');
        err.statusCode = 502;
        throw err;
    }

    const text = await response.text();
    let data;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { message: text };
    }

    if (!response.ok) {
        const err = new Error(data.message || data.error || `FalazApp respondeu ${response.status}`);
        err.statusCode = response.status;
        err.falazappStatus = response.status;
        throw err;
    }
    return data;
}
