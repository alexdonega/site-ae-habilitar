import { supabase } from './supabase';

// Coleta, no momento do envio, os mesmos metadados de rastreamento usados
// no projeto alexdonega-website: página de origem, UTMs da URL, referrer e
// dados de dispositivo/navegador. Colunas correspondentes na tabela "leads".
export function buildLeadMeta() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        page_url: window.location.href,
        page_path: window.location.pathname,
        page_title: document.title,
        referrer: document.referrer || null,
        utm_source: urlParams.get('utm_source') || null,
        utm_medium: urlParams.get('utm_medium') || null,
        utm_campaign: urlParams.get('utm_campaign') || null,
        utm_term: urlParams.get('utm_term') || null,
        utm_content: urlParams.get('utm_content') || null,
        user_agent: navigator.userAgent,
        language: navigator.language,
        screen_width: window.screen.width,
        screen_height: window.screen.height,
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
    };
}

// Insere o lead na tabela "leads" do Supabase. Retorna uma Promise real
// (o builder do supabase-js é apenas "thenable" e só executa a requisição
// quando .then() é chamado — por isso o Promise.resolve), permitindo ao
// chamador usar .catch() para disparar em background ou await se preferir.
export function captureLead(leadFields) {
    return Promise.resolve(
        supabase.from('leads').insert({ ...leadFields, ...buildLeadMeta() })
    );
}
