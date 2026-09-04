import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createContactAndNotify, findLatestTicketUrl, normalizeWhatsapp } from './api/_falazapp.js'
import { syncMarketingPerformance } from './api/_windsor.js'
import produtosHandler from './api/produtos.js'
import fotosPerfilHandler from './api/fotos-perfil.js'
import criativosHandler from './api/criativos.js'
import mensagensHandler from './api/mensagens.js'

// Lê o corpo da requisição no middleware de desenvolvimento (connect não
// faz parse de JSON sozinho).
function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = ''
        req.on('data', (chunk) => { data += chunk })
        req.on('end', () => resolve(data))
        req.on('error', reject)
    })
}

// Middleware de desenvolvimento que replica a função serverless /api/leads
// (api/leads.js) quando o dev server do Vite está rodando (`npm run dev`).
// Sem ele, o /dash no localhost ficaria sem dados, pois o Vite não executa
// as funções da Vercel. A service_role nunca vai para o bundle — ela só é
// usada aqui, no processo do dev server.
function devApiLeads({ supabaseUrl, serviceRoleKey }) {
    return {
        name: 'dev-api-leads',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use('/api/leads', async (req, res) => {
                const send = (status, payload) => {
                    res.statusCode = status
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify(payload))
                }
                try {
                    if (!supabaseUrl || !serviceRoleKey) {
                        throw new Error('PUBLIC_SUPABASE_URL ou service_role ausente no .env')
                    }

                    // PATCH → atualiza o status de atendimento de um lead
                    // (mesmo contrato do PATCH de api/leads.js: ?id= + {status})
                    if (req.method === 'PATCH') {
                        const url = new URL(req.url || '/', 'http://localhost')
                        const id = Number(url.searchParams.get('id'))
                        const body = JSON.parse(await readBody(req) || '{}')
                        const status =
                            body.status === null || body.status === undefined || body.status === ''
                                ? null
                                : String(body.status)
                        const VALIDOS = ['Pagou', 'Passou documento', 'Vai passar dados', 'Vai na Autoescola']
                        if (!Number.isInteger(id) || id <= 0) {
                            return send(400, { error: '?id= é obrigatório' })
                        }
                        if (status !== null && !VALIDOS.includes(status)) {
                            return send(400, { error: `Status inválido — use um destes: ${VALIDOS.join(', ')}` })
                        }
                        const rest = await fetch(
                            `${supabaseUrl}/rest/v1/leads?id=eq.${id}`,
                            {
                                method: 'PATCH',
                                headers: {
                                    apikey: serviceRoleKey,
                                    Authorization: `Bearer ${serviceRoleKey}`,
                                    'Content-Type': 'application/json',
                                    Prefer: 'return=representation',
                                },
                                body: JSON.stringify({ status }),
                            },
                        )
                        if (!rest.ok) throw new Error(`Supabase respondeu ${rest.status}`)
                        const rows = await rest.json()
                        if (!rows.length) return send(404, { error: 'Lead não encontrado' })
                        return send(200, { lead: rows[0] })
                    }

                    // GET → lista todos os leads
                    const rest = await fetch(
                        `${supabaseUrl}/rest/v1/leads?select=*&order=created_at.desc&limit=5000`,
                        {
                            headers: {
                                apikey: serviceRoleKey,
                                Authorization: `Bearer ${serviceRoleKey}`,
                            },
                        },
                    )
                    if (!rest.ok) throw new Error(`Supabase respondeu ${rest.status}`)
                    const leads = await rest.json()
                    send(200, { leads, updatedAt: new Date().toISOString() })
                } catch (err) {
                    send(502, { error: 'Falha ao consultar o Supabase', detail: err.message })
                }
            })
        },
    }
}

// Middleware de desenvolvimento que replica a função serverless
// /api/falazapp-contact (api/falazapp-contact.js) no dev server do Vite —
// mesmo motivo do devApiLeads acima. Reusa o helper api/_falazapp.js para
// garantir comportamento idêntico entre dev e produção.
function devApiFalazapp({ falazappApiUrl, falazappToken, supabaseUrl, serviceRoleKey }) {
    return {
        name: 'dev-api-falazapp',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use('/api/falazapp-contact', async (req, res) => {
                const send = (status, payload) => {
                    res.statusCode = status
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify(payload))
                }
                try {
                    if (req.method !== 'POST') {
                        return send(405, { error: 'Método não permitido' })
                    }
                    const { nome_completo, whatsapp, email, ...tracking } = JSON.parse(await readBody(req) || '{}')
                    const resultado = await createContactAndNotify({
                        nome_completo,
                        whatsapp,
                        email,
                        tracking,
                        token: falazappToken,
                        apiUrl: falazappApiUrl,
                    })

                    // Grava o ID do contato FalazApp no lead do Supabase
                    // (mesma lógica da função /api/falazapp-contact).
                    let leadUpdate = null
                    if (resultado?.contact?.id && supabaseUrl && serviceRoleKey) {
                        try {
                            const rest = await fetch(
                                `${supabaseUrl}/rest/v1/leads?whatsapp=eq.${encodeURIComponent(whatsapp)}&contact_falazapp=is.null`,
                                {
                                    method: 'PATCH',
                                    headers: {
                                        apikey: serviceRoleKey,
                                        Authorization: `Bearer ${serviceRoleKey}`,
                                        'Content-Type': 'application/json',
                                        Prefer: 'return=minimal',
                                    },
                                    body: JSON.stringify({ contact_falazapp: String(resultado.contact.id) }),
                                },
                            )
                            leadUpdate = { ok: rest.ok, error: rest.ok ? null : `Supabase respondeu ${rest.status}` }
                        } catch (err) {
                            leadUpdate = { ok: false, error: err.message }
                        }
                    }

                    send(200, { ok: true, ...resultado, leadUpdate })
                } catch (err) {
                    send(err.statusCode || 502, { error: err.message })
                }
            })
        },
    }
}

// Middleware de desenvolvimento que replica a função serverless
// /api/marketing (api/marketing.js) no dev server do Vite — mesmo motivo do
// devApiLeads acima. O painel de mídia do /dash lê a tabela
// "marketing_performance" (destino do Windsor.ai) via service_role.
function devApiMarketing({ supabaseUrl, serviceRoleKey, windsorApiKey }) {
    // Throttle do ?sync=1 — mesmo comportamento de api/marketing.js em produção.
    let lastSyncAt = 0
    return {
        name: 'dev-api-marketing',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use('/api/marketing', async (req, res) => {
                const send = (status, payload) => {
                    res.statusCode = status
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify(payload))
                }
                try {
                    if (!supabaseUrl || !serviceRoleKey) {
                        throw new Error('PUBLIC_SUPABASE_URL ou service_role ausente no .env')
                    }
                    if (req.method !== 'GET') {
                        return send(405, { error: 'Método não permitido' })
                    }
                    const query = new URL(req.url || '', 'http://localhost').searchParams
                    if (query.get('sync') === '1' && Date.now() - lastSyncAt > 10 * 60 * 1000) {
                        lastSyncAt = Date.now()
                        try {
                            await syncMarketingPerformance({
                                days: 1,
                                timeoutMs: 20000,
                                config: { apiKey: windsorApiKey, supabaseUrl, serviceRoleKey },
                            })
                        } catch { /* Windsor offline — segue com o que há no banco */ }
                    }
                    // PostgREST entrega no máx. 1000 linhas por resposta —
                    // pagina até esgotar (mesma lógica de api/marketing.js).
                    let rows = []
                    for (let offset = 0; offset < 20000; offset += 1000) {
                        const rest = await fetch(
                            `${supabaseUrl}/rest/v1/marketing_performance?select=*&order=date.desc&limit=1000&offset=${offset}`,
                            {
                                headers: {
                                    apikey: serviceRoleKey,
                                    Authorization: `Bearer ${serviceRoleKey}`,
                                },
                            },
                        )
                        if (!rest.ok) throw new Error(`Supabase respondeu ${rest.status}`)
                        const page = await rest.json()
                        rows = rows.concat(page)
                        if (!page || page.length < 1000) break
                    }
                    send(200, { rows, updatedAt: new Date().toISOString() })
                } catch (err) {
                    send(502, { error: 'Falha ao consultar o Supabase', detail: err.message })
                }
            })
        },
    }
}

// Middleware de desenvolvimento que replica a função serverless
// /api/falazapp-ticket (api/falazapp-ticket.js) — mesmo motivo dos três
// acima. O clique da coluna WhatsApp do /dash redireciona para o ticket no
// painel da FalazApp (fallback: wa.me).
function devApiFalazappTicket({ falazappApiUrl, falazappPanelUrl, falazappToken }) {
    return {
        name: 'dev-api-falazapp-ticket',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use('/api/falazapp-ticket', async (req, res) => {
                const redirect = (url) => {
                    res.statusCode = 302
                    res.setHeader('Location', url)
                    res.end()
                }
                const query = new URL(req.url || '', 'http://localhost').searchParams
                const whatsapp = query.get('whatsapp') || query.get('number') || ''
                try {
                    const ticketUrl = await findLatestTicketUrl({
                        whatsapp,
                        token: falazappToken,
                        apiUrl: falazappApiUrl,
                        panelUrl: falazappPanelUrl,
                    })
                    redirect(ticketUrl || `https://wa.me/${normalizeWhatsapp(whatsapp)}`)
                } catch {
                    redirect(`https://wa.me/${normalizeWhatsapp(whatsapp)}`)
                }
            })
        },
    }
}

// Middleware de desenvolvimento que replica a função serverless
// /api/windsor-sync (api/windsor-sync.js) — sincroniza Windsor → Supabase no
// dev server. Roda sem segredo de autenticação porque escuta apenas em
// localhost (em produção o endpoint exige WINDSOR_SYNC_SECRET/CRON_SECRET).
function devApiWindsorSync({ supabaseUrl, serviceRoleKey, windsorApiKey }) {
    return {
        name: 'dev-api-windsor-sync',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use('/api/windsor-sync', async (req, res) => {
                const send = (status, payload) => {
                    res.statusCode = status
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify(payload))
                }
                try {
                    if (req.method !== 'GET' && req.method !== 'POST') {
                        return send(405, { error: 'Método não permitido' })
                    }
                    const query = new URL(req.url || '', 'http://localhost').searchParams
                    const days = Math.min(Math.max(Number(query.get('days')) || 3, 1), 7)
                    const result = await syncMarketingPerformance({
                        days,
                        from: query.get('from') || undefined,
                        to: query.get('to') || undefined,
                        timeoutMs: 25000,
                        config: {
                            apiKey: windsorApiKey,
                            supabaseUrl,
                            serviceRoleKey,
                        },
                    })
                    send(200, { ok: true, ...result })
                } catch (err) {
                    send(err.invalidKey || err.config ? 500 : 502, { ok: false, error: err.message })
                }
            })
        },
    }
}

// Middleware de desenvolvimento que replica os endpoints de CRUD com imagem
// (/api/produtos e /api/fotos-perfil). Em vez de duplicar a lógica (Storage +
// PostgREST), ele chama o próprio handler da Vercel (api/*.js) com um shim
// mínimo: o handler estilo Express só precisa de res.status/res.json e do
// body JSON já parseado em req.body. As credenciais do .env (carregadas via
// loadEnv, que não popula process.env) são injetadas antes da chamada.
function devApiImagens({ name, path, handler, env }) {
    return {
        name,
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use(path, async (req, res) => {
                for (const key of ['PUBLIC_SUPABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'service_role']) {
                    if (env[key] && !process.env[key]) process.env[key] = env[key]
                }
                res.status = (code) => { res.statusCode = code; return res }
                res.json = (payload) => {
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify(payload))
                }
                try {
                    if (req.method === 'POST' || req.method === 'PATCH') {
                        const raw = await readBody(req)
                        req.body = raw ? JSON.parse(raw) : {}
                    }
                    await handler(req, res)
                } catch (err) {
                    if (!res.writableEnded) {
                        res.statusCode = 500
                        res.setHeader('Content-Type', 'application/json')
                        res.end(JSON.stringify({ error: 'Erro interno', detail: err.message }))
                    }
                }
            })
        },
    }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {    // Prefixo vazio carrega TODAS as variáveis do .env (inclusive as sem
    // prefixo, como service_role) — mas só para uso do dev server acima.
    const env = loadEnv(mode, process.cwd(), '')

    return {
        plugins: [
            react(),
            devApiLeads({
                supabaseUrl: env.PUBLIC_SUPABASE_URL,
                serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || env.service_role,
            }),
            devApiMarketing({
                supabaseUrl: env.PUBLIC_SUPABASE_URL,
                serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || env.service_role,
                windsorApiKey: env.WINDSOR_API_KEY,
            }),
            devApiFalazapp({
                falazappApiUrl: env.FALAZAPP_API_URL,
                falazappToken: env.FALAZAPP_API_TOKEN,
                supabaseUrl: env.PUBLIC_SUPABASE_URL,
                serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || env.service_role,
            }),
            devApiFalazappTicket({
                falazappApiUrl: env.FALAZAPP_API_URL,
                falazappPanelUrl: env.FALAZAPP_PANEL_URL,
                falazappToken: env.FALAZAPP_API_TOKEN,
            }),
            devApiWindsorSync({
                supabaseUrl: env.PUBLIC_SUPABASE_URL,
                serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || env.service_role,
                windsorApiKey: env.WINDSOR_API_KEY,
            }),
            devApiImagens({
                name: 'dev-api-mensagens',
                path: '/api/mensagens',
                handler: mensagensHandler,
                env,
            }),
            devApiImagens({
                name: 'dev-api-produtos',
                path: '/api/produtos',
                handler: produtosHandler,
                env,
            }),
            devApiImagens({
                name: 'dev-api-fotos-perfil',
                path: '/api/fotos-perfil',
                handler: fotosPerfilHandler,
                env,
            }),
            devApiImagens({
                name: 'dev-api-criativos',
                path: '/api/criativos',
                handler: criativosHandler,
                env,
            }),
        ],
        // Aceita variáveis com prefixo VITE_ e PUBLIC_ (mesma convenção do
        // projeto alexdonega-website, que usa Astro). Lidas via import.meta.env.
        envPrefix: ['VITE_', 'PUBLIC_'],
    }
})
