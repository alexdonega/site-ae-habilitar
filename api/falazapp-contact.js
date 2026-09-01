// =============================================================================
//  /api/falazapp-contact — criação de contato na plataforma FalazApp
// =============================================================================
//  POST → cria um contato na FalazApp (suitehelpers) quando um lead preenche
//         o formulário de pré-matrícula (body: { nome_completo, whatsapp,
//         email }). O cliente chama este endpoint em background após o
//         submit — o Bearer token da API fica apenas aqui no servidor.
//
//  Mapeamento (docs: principal.suitehelpers.com.br → "API Criar Contato"):
//    name ← nome_completo | number ← whatsapp (normalizado com DDI 55)
//    email ← email | estado/cidade/referencia fixos da campanha Meteórico.
// =============================================================================

import { createFalazappContact } from './_falazapp.js';

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const { nome_completo, whatsapp, email, ...tracking } = body;

        const contact = await createFalazappContact({
            nome_completo,
            whatsapp,
            email,
            tracking,
            token: process.env.FALAZAPP_API_TOKEN,
            apiUrl: process.env.FALAZAPP_API_URL,
        });

        return res.status(200).json({ ok: true, contact });
    } catch (err) {
        return res.status(err.statusCode || 502).json({ error: err.message });
    }
}
