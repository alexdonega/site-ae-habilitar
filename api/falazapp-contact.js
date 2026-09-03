// =============================================================================
//  /api/falazapp-contact — contato + mensagem na plataforma FalazApp
// =============================================================================
//  POST  → quando um lead preenche o formulário de pré-matrícula (body:
//          { nome_completo, whatsapp, email, produto?, ...metadados }), este
//          endpoint em background:
//            1. localiza o id do lead na tabela "leads" do Supabase (por
//               whatsapp) e o envia para a FalazApp como extraInfo
//               "supabase_id" — correlação direta contato ↔ lead no CRM;
//            2. cria o contato na FalazApp (suitehelpers);
//            3. envia a mensagem de confirmação via WhatsApp (abre ticket na
//               fila 155, status "aguardando");
//            4. grava o ID do contato FalazApp na coluna "contact_falazapp"
//               do lead correspondente no Supabase (service role) — por id
//               quando encontrado, senão por whatsapp.
//          O Bearer token da API fica apenas aqui no servidor.
//
//  PATCH → atualiza um contato existente ("API Atualizar Contato" da Suite
//          Helpers). Body: { id, patch: { name?, email?, ...campos,
//          extraInfo?: [{name,value}] (lista completa — substitui a atual) } }.
//          Vive AQUI (e não em função própria) porque o plano Hobby da Vercel
//          limita o deployment a 12 Serverless Functions.
//
//  Mapeamento (docs: principal.suitehelpers.com.br → "API Criar Contato" e
//  "API Mensagem de Texto"):
//    name ← nome_completo | number ← whatsapp (normalizado com DDI 55)
//    email ← email | estado/cidade/referencia/carteiraId fixos (Meteórico).
//    extraInfo ← supabase_id, produto, timestamps, página, UTMs, referrer.
//
//  Correlação com o Supabase: o insert do lead é client-side com anon key e
//  o RLS não devolve o id da linha, então a busca é server-side (service
//  role). O cliente chama este endpoint depois do insert commitar, e a
//  busca abaixo ainda retenta para cobrir corridas curtas. O update usa
//  .is('contact_falazapp', null), preservando o primeiro ID caso o lead
//  reenvie o formulário.
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { createContactAndNotify, updateFalazappContact } from './_falazapp.js';

const SUPABASE_URL =
    process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.service_role;

function supabaseAdmin() {
    return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

// Busca o id do lead mais recente com este whatsapp. Retenta algumas vezes
// porque, apesar do cliente ordenar insert → chamada deste endpoint, a
// replicação/latência pode atrasar alguns milissegundos.
async function buscarLeadSupabaseId(whatsapp) {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !whatsapp) return null;
    const supabase = supabaseAdmin();
    for (let tentativa = 0; tentativa < 3; tentativa++) {
        const { data } = await supabase
            .from('leads')
            .select('id')
            .eq('whatsapp', whatsapp)
            .order('created_at', { ascending: false })
            .limit(1);
        if (data && data.length > 0) return data[0].id;
        await new Promise((resolve) => setTimeout(resolve, 600));
    }
    return null;
}

async function salvarContactFalazapp(leadId, whatsapp, contactId) {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !contactId) {
        return { ok: false, error: 'Supabase ou contactId ausente' };
    }
    const supabase = supabaseAdmin();
    // Por id quando temos (linha exata), senão pelo whatsapp da máscara antiga.
    // Grava os dois: a flag booleana (contact_falazapp = "sim") e o ID real do
    // contato na coluna de texto falazapp_contact_id. O filtro contact_falazapp
    // = false preserva o primeiro ID caso o lead reenvie o formulário.
    let query = supabase
        .from('leads')
        .update({ contact_falazapp: true, falazapp_contact_id: String(contactId) })
        .eq('contact_falazapp', false);
    query = leadId ? query.eq('id', leadId) : query.eq('whatsapp', whatsapp);
    const { error } = await query;
    return { ok: !error, error: error ? error.message : null, leadId };
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'PATCH') {
        // Atualização de contato existente — ver cabeçalho do arquivo.
        try {
            const body = req.body && typeof req.body === 'object' ? req.body : {};
            const { id, patch } = body;
            if (!id || !patch || typeof patch !== 'object') {
                return res.status(400).json({ error: 'Envie { id, patch: { ...campos } }' });
            }
            const resultado = await updateFalazappContact({
                contactId: id,
                patch,
                token: process.env.FALAZAPP_API_TOKEN,
                apiUrl: process.env.FALAZAPP_API_URL,
            });
            return res.status(200).json({ ok: true, resultado });
        } catch (err) {
            return res.status(err.statusCode || 502).json({ error: err.message });
        }
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const { nome_completo, whatsapp, email, ...tracking } = body;

        // Id do lead no Supabase → vai junto no extraInfo do contato FalazApp.
        const supabaseId = await buscarLeadSupabaseId(whatsapp);
        if (supabaseId) tracking.supabase_id = supabaseId;

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
            leadUpdate = await salvarContactFalazapp(supabaseId, whatsapp, resultado.contact.id);
        }

        return res.status(200).json({ ok: true, supabaseId, ...resultado, leadUpdate });
    } catch (err) {
        return res.status(err.statusCode || 502).json({ error: err.message });
    }
}
