// =============================================================================
//  /api/falazapp-contact — contato + mensagem na plataforma FalazApp
// =============================================================================
//  POST → quando um lead preenche o formulário de pré-matrícula (body:
//         { nome_completo, whatsapp, email, produto?, ...metadados }), este
//         endpoint em background:
//           1. cria o contato na FalazApp (suitehelpers);
//           2. envia a mensagem de confirmação via WhatsApp (abre ticket na
//              fila 155, status "aguardando");
//           3. grava o ID do contato FalazApp na coluna "contact_falazapp"
//              do lead correspondente no Supabase (service role).
//         O Bearer token da API fica apenas aqui no servidor.
//
//  Mapeamento (docs: principal.suitehelpers.com.br → "API Criar Contato" e
//  "API Mensagem de Texto"):
//    name ← nome_completo | number ← whatsapp (normalizado com DDI 55)
//    email ← email | estado/cidade/referencia/carteiraId fixos (Meteórico).
//    extraInfo ← produto, timestamps, página, UTMs, referrer, formulário.
//
//  Correlação com o Supabase: o insert do lead é client-side com anon key e
//  o RLS não devolve o id da linha, então o update é por "whatsapp" (mesma
//  string mascarada gravada no lead). Só preenche linhas com a coluna vazia,
//  preservando o primeiro ID caso o lead reenvie o formulário.
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { createContactAndNotify } from './_falazapp.js';

const SUPABASE_URL =
    process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role;

async function salvarContactFalazapp(whatsapp, contactId) {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !contactId) {
        return { ok: false, error: 'Supabase ou contactId ausente' };
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase
        .from('leads')
        .update({ contact_falazapp: String(contactId) })
        .eq('whatsapp', whatsapp)
        .is('contact_falazapp', null);
    return { ok: !error, error: error ? error.message : null };
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const { nome_completo, whatsapp, email, ...tracking } = body;

        const resultado = await createContactAndNotify({
            nome_completo,
            whatsapp,
            email,
            tracking,
            token: process.env.FALAZAPP_API_TOKEN,
            apiUrl: process.env.FALAZAPP_API_URL,
        });

        // Contato criado → grava o ID dele no lead do Supabase. Falha aqui
        // não derruba nada do que já aconteceu (contato/mensagem/tags).
        let leadUpdate = null;
        if (resultado?.contact?.id) {
            leadUpdate = await salvarContactFalazapp(whatsapp, resultado.contact.id);
        }

        return res.status(200).json({ ok: true, ...resultado, leadUpdate });
    } catch (err) {
        return res.status(err.statusCode || 502).json({ error: err.message });
    }
}
