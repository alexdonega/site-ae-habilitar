// =============================================================================
//  /api/falazapp-contact — contato + mensagem na plataforma FalazApp
// =============================================================================
//  POST → quando um lead preenche o formulário de pré-matrícula (body:
//         { nome_completo, whatsapp, email, produto?, ...metadados }), este
//         endpoint em background:
//           1. cria o contato na FalazApp (suitehelpers);
//           2. envia a mensagem de confirmação via WhatsApp (abre ticket na
//              fila 155, status "aguardando").
//         O Bearer token da API fica apenas aqui no servidor.
//
//  Mapeamento (docs: principal.suitehelpers.com.br → "API Criar Contato" e
//  "API Mensagem de Texto"):
//    name ← nome_completo | number ← whatsapp (normalizado com DDI 55)
//    email ← email | estado/cidade/referencia/carteiraId fixos (Meteórico).
//    extraInfo ← produto, timestamps, página, UTMs, referrer, formulário.
// =============================================================================

import { createContactAndNotify } from './_falazapp.js';

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

        return res.status(200).json({ ok: true, ...resultado });
    } catch (err) {
        return res.status(err.statusCode || 502).json({ error: err.message });
    }
}
