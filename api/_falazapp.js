// =============================================================================
//  Helper compartilhado da integração FalazApp (contato + mensagem)
// =============================================================================
//  Este arquivo NÃO é um endpoint: arquivos com prefixo "_" no diretório api/
//  são ignorados pelo builder da Vercel, então ele só existe para ser importado
//  pela função real (falazapp-contact.js) e pelo middleware de dev do Vite
//  (vite.config.js), que não executa as funções da Vercel.
//
//  APIs usadas (docs em principal.suitehelpers.com.br):
//    • POST {FALAZAPP_API_URL}/api/contacts      → "API Criar Contato"
//    • POST {FALAZAPP_API_URL}/api/messages/send → "API Mensagem de Texto"
//  Autenticação das duas: Authorization: Bearer.
//
//  Segurança: a FALAZAPP_API_TOKEN vive apenas em process.env (server-side).
//  Ela nunca recebe prefixo VITE_/PUBLIC_ e por isso nunca vai para o bundle
//  do cliente.
// =============================================================================

import https from 'https';

export const FALAZAPP_DEFAULT_API_URL = 'https://back.falazapp.com.br';
export const FALAZAPP_DEFAULT_PANEL_URL = 'https://app.falazapp.com.br';

// Campos fixos da campanha "Meteórico": os leads do formulário de pré-matrícula
// são todos de Sorriso/MT e caem na carteira do atendente responsável pelo
// atendimento (sem carteiraId o contato "some" da listagem padrão do painel).
const FIXED_FIELDS = {
    estado: 'MT',
    cidade: 'Sorriso',
    referencia: 'Meteórico Setembro/2026',
    carteiraId: '254',
};

// Envio da mensagem de confirmação: openTicket 1 abre um ticket na fila 155 e
// joga a conversa em "aguardando" (comportamento documentado da API).
const MESSAGE_SEND = {
    openTicket: '1',
    queueId: '155',
};

// Tags aplicadas ao ticket do lead após o envio da mensagem (POST /api/tags/add
// — semântica de SUBSTITUIÇÃO, por isso enviamos o conjunto completo). IDs
// obtidos em GET /api/tags ("API Obter Tags da Empresa").
const CATEGORY_TAG_IDS = {
    // Valores do <select> do formulário → tag correspondente na FalazApp
    // (IDs confirmados pelo time em 2026-09-01). "Carreta [E]" ainda não é
    // opção do formulário — mapeada por garantia para quando entrar.
    'Moto [A]': 595,
    'Carro [B]': 579,
    'Carro e Moto [AB]': 572,
    'Adição Moto [A]': 584,
    'Adição Carro [B]': 583,
    'Carreta [E]': 582,
};

// Normaliza a categoria para o lookup da tag: NFC (acentos canônicos),
// espaços colapsados e caixa baixa — tolera variações de encoding/espaço
// entre o que chega do cliente e as chaves do mapa.
const normalizeCategoria = (value) =>
    String(value || '')
        .normalize('NFC')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

const CATEGORY_TAG_LOOKUP = Object.fromEntries(
    Object.entries(CATEGORY_TAG_IDS).map(([categoria, id]) => [normalizeCategoria(categoria), id])
);

const CAMPAIGN_TAG_IDS = [
    674, // meteorico-2026 — espelha a referencia fixa "Meteórico Setembro/2026"
    673, // setembro (mês de captação)
    573, // Negociando — status inicial do lead após o formulário
];

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
    'supabase_id', // id do lead na tabela "leads" — correlação direta com o CRM
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
        .map((field) => ({ name: field, value: truncateExtraInfoValue(tracking[field]) }));
}

// A API da FalazApp rejeita (HTTP 500 "erro inesperado") valores de extraInfo
// acima de ~255 caracteres — típico das page_url com fbclid longos. A versão
// completa continua gravada na tabela "leads" do Supabase.
export function truncateExtraInfoValue(value) {
    return String(value).slice(0, 255);
}

// Mensagem de confirmação enviada ao lead logo após a criação do contato.
// As duas últimas linhas são preenchidas com os dados do formulário.
export function buildConfirmationMessage(nome_completo, produto) {
    return [
        '✅ *PRÉ-INSCRIÇÃO CONFIRMADA!*',
        '',
        'Agora falta pouco! Serão apenas *50 vagas* e nesta *sexta-feira, dia 04 de setembro*, entrarei em contato para te passar o valor da *MEGA OFERTA*, o menor preço da história de Sorriso para você tirar sua CNH.',
        '',
        '⚠️ *Importante:* falta só mais um passo. Salve este contato no seu WhatsApp agora mesmo para garantir que você receba minha mensagem na sexta.',
        '',
        '✏️ Para finalizar, confirme rapidinho:',
        '',
        `Seu nome completo: ${nome_completo}`,
        `Categoria da CNH desejada: ${produto}`,
    ].join('\n');
}

// POST JSON genérico para a API da FalazApp: injeta o Bearer, trata erro HTTP
// e devolve o JSON já parseado. Erros viram exceção com statusCode.
async function falazappPost(path, payload, token, base, erroComunicacao) {
    let response;
    try {
        response = await fetch(`${base}${path}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
    } catch {
        const err = new Error(erroComunicacao);
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

// Envia a mensagem de texto de confirmação (POST /api/messages/send) para o
// número do lead, abrindo ticket na fila configurada.
export async function sendFalazappTextMessage({ whatsapp, nome_completo, produto, token, apiUrl }) {
    if (!token) {
        const err = new Error('FALAZAPP_API_TOKEN não configurada no ambiente');
        err.statusCode = 500;
        throw err;
    }
    const base = (apiUrl || FALAZAPP_DEFAULT_API_URL).replace(/\/$/, '');
    return falazappPost(
        '/api/messages/send',
        {
            number: normalizeWhatsapp(whatsapp),
            ...MESSAGE_SEND,
            body: buildConfirmationMessage(nome_completo, produto),
        },
        token,
        base,
        'Falha de comunicação com a API da FalazApp (mensagem)',
    );
}

// Lista TODOS os contatos da empresa (GET /api/contacts/all — "API Obter
// Contatos", sem payload/paginação). Devolve o array puro; cada contato traz
// id, number, name, email, campos de endereço e extraInfo.
export async function getFalazappContacts({ token, apiUrl }) {
    if (!token) {
        const err = new Error('FALAZAPP_API_TOKEN não configurada no ambiente');
        err.statusCode = 500;
        throw err;
    }
    const base = (apiUrl || FALAZAPP_DEFAULT_API_URL).replace(/\/$/, '');

    let response;
    try {
        response = await fetch(`${base}/api/contacts/all`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        });
    } catch {
        const err = new Error('Falha de comunicação com a API da FalazApp (lista de contatos)');
        err.statusCode = 502;
        throw err;
    }
    if (!response.ok) {
        const err = new Error(`FalazApp respondeu ${response.status} ao listar contatos`);
        err.statusCode = response.status;
        throw err;
    }
    const data = await response.json();
    return Array.isArray(data) ? data : (data.contacts || []);
}

// Campos aceitos pelo POST /api/contact/update ("API Atualizar Contato").
// O id é a chave de atualização; os demais são passados como enviados.
// ATENÇÃO: a API trata o extraInfo como lista completa (substitui a atual),
// então quem chama deve enviar o array já mesclado com o que existia.
export const UPDATEABLE_CONTACT_FIELDS = [
    'name',
    'number',
    'email',
    'cpfcnpj',
    'genero',
    'estado',
    'cidade',
    'referencia',
    'aniversario',
    'endereco',
    'carteiraId',
    'extraInfo',
];

export async function updateFalazappContact({ contactId, patch = {}, token, apiUrl }) {
    if (!contactId) {
        const err = new Error('contactId (id do contato na FalazApp) é obrigatório');
        err.statusCode = 400;
        throw err;
    }
    if (!token) {
        const err = new Error('FALAZAPP_API_TOKEN não configurada no ambiente');
        err.statusCode = 500;
        throw err;
    }

    const body = { id: String(contactId) };
    for (const field of UPDATEABLE_CONTACT_FIELDS) {
        if (patch[field] === undefined) continue;
        if (field === 'extraInfo' && Array.isArray(patch[field])) {
            // Trunca cada valor: valores >255 chars derrubam a API (HTTP 500).
            body[field] = patch[field].map((item) => ({
                name: item.name,
                value: truncateExtraInfoValue(item.value ?? ''),
            }));
        } else {
            body[field] = patch[field];
        }
    }

    const base = (apiUrl || FALAZAPP_DEFAULT_API_URL).replace(/\/$/, '');
    return falazappPost(
        '/api/contact/update',
        body,
        token,
        base,
        'Falha de comunicação com a API da FalazApp (atualizar contato)',
    );
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

    return falazappPost(
        '/api/contacts',
        {
            name: nome_completo,
            number: normalizeWhatsapp(whatsapp),
            email,
            extraInfo: buildExtraInfo(tracking),
            ...FIXED_FIELDS,
        },
        token,
        base,
        'Falha de comunicação com a API da FalazApp',
    );
}

// Define as tags do ticket do lead: tag da categoria escolhida no formulário
// + tags fixas da campanha. IDs desconhecidos seriam ignorados pela plataforma,
// mas filtramos aqui mesmo para não enviar lixo.
export async function setTicketTags({ ticketId, produto, token, apiUrl }) {
    if (!ticketId) {
        const err = new Error('ticketId obrigatório para aplicar tags');
        err.statusCode = 400;
        throw err;
    }
    if (!token) {
        const err = new Error('FALAZAPP_API_TOKEN não configurada no ambiente');
        err.statusCode = 500;
        throw err;
    }

    const ids = [...CAMPAIGN_TAG_IDS];
    const categoriaTagId = CATEGORY_TAG_LOOKUP[normalizeCategoria(produto)];
    if (categoriaTagId) ids.unshift(categoriaTagId);

    const base = (apiUrl || FALAZAPP_DEFAULT_API_URL).replace(/\/$/, '');
    return falazappPost(
        '/api/tags/add',
        { ticketId, tags: ids.map((id) => ({ id })) },
        token,
        base,
        'Falha de comunicação com a API da FalazApp (tags)',
    );
}

// Requisição HTTPS com JSON. Necessária porque a API "Obter Tickets do
// Contato" (GET /api/contacts/alltickets) exige o número no CORPO da requisição
// GET — o fetch/undici do Node recusa GET com body, o módulo https aceita.
function httpsJsonRequest(url, { method, headers, body }) {
    return new Promise((resolve, reject) => {
        const payload = body !== undefined ? JSON.stringify(body) : undefined;
        const req = https.request(url, {
            method,
            headers: {
                ...headers,
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
            },
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                let parsed;
                try {
                    parsed = data ? JSON.parse(data) : {};
                } catch {
                    parsed = { message: data };
                }
                resolve({ status: res.statusCode, data: parsed });
            });
        });
        req.on('error', reject);
        req.end(payload);
    });
}

// Descobre a URL do ticket mais recente do lead no painel da FalazApp
// (https://app.falazapp.com.br/tickets/{uuid}). Devolve null se não houver
// ticket (ou em qualquer falha) — o chamador decide o fallback.
export async function findLatestTicketUrl({ whatsapp, token, apiUrl, panelUrl }) {
    if (!whatsapp || !token) return null;

    const base = (apiUrl || FALAZAPP_DEFAULT_API_URL).replace(/\/$/, '');
    const panel = (panelUrl || FALAZAPP_DEFAULT_PANEL_URL).replace(/\/$/, '');

    let resposta;
    try {
        resposta = await httpsJsonRequest(`${base}/api/contacts/alltickets`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: { number: normalizeWhatsapp(whatsapp) },
        });
    } catch {
        return null;
    }
    if (resposta.status !== 200) return null;

    const tickets = Array.isArray(resposta.data) ? resposta.data : (resposta.data.tickets || []);
    const maisRecente = tickets
        .filter((t) => t && t.uuid)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];

    return maisRecente ? `${panel}/tickets/${maisRecente.uuid}` : null;
}

// Fluxo completo do lead: cria o contato e, se der certo, envia a mensagem de
// confirmação. Se a mensagem falhar, o contato já criado é preservado e o
// erro volta em `messageError` (o lead não pode parecer perdido).
export async function createContactAndNotify({ nome_completo, whatsapp, email, tracking, token, apiUrl }) {
    const contact = await createFalazappContact({ nome_completo, whatsapp, email, tracking, token, apiUrl });

    let message = null;
    let messageError = null;
    let tags = null;
    let tagsError = null;
    try {
        message = await sendFalazappTextMessage({
            whatsapp,
            nome_completo,
            produto: tracking?.produto,
            token,
            apiUrl,
        });

        // A resposta do envio traz o ticketId dentro de "retorno".
        const ticketId = message?.retorno?.ticketId ?? message?.ticketId ?? null;
        if (ticketId) {
            try {
                tags = await setTicketTags({ ticketId, produto: tracking?.produto, token, apiUrl });
            } catch (err) {
                tagsError = err.message;
            }
        } else {
            tagsError = 'ticketId ausente na resposta da mensagem';
        }
    } catch (err) {
        messageError = err.message;
    }

    return { contact, message, messageError, tags, tagsError };
}
