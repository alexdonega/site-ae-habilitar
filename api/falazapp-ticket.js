// =============================================================================
//  /api/falazapp-ticket — abre o ticket do lead no painel da FalazApp
// =============================================================================
//  GET /api/falazapp-ticket?whatsapp=(65) 99999-9999
//    → 302 para https://app.falazapp.com.br/tickets/{uuid} do ticket mais
//      recente do contato (coluna WhatsApp do /dash).
//    → sem ticket (ou qualquer falha): 302 para o wa.me do número, que era o
//      comportamento antigo do link — o clique nunca abre página quebrada.
// =============================================================================

import { findLatestTicketUrl, normalizeWhatsapp } from './_falazapp.js';

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    const whatsapp = (req.query && (req.query.whatsapp || req.query.number)) || '';

    const ticketUrl = await findLatestTicketUrl({
        whatsapp,
        token: process.env.FALAZAPP_API_TOKEN,
        apiUrl: process.env.FALAZAPP_API_URL,
        panelUrl: process.env.FALAZAPP_PANEL_URL,
    });

    const fallback = `https://wa.me/${normalizeWhatsapp(whatsapp)}`;
    return res.redirect(302, ticketUrl || fallback);
}
