import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createContactAndNotify } from './api/_falazapp.js'

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

                    // PATCH → atualiza contato_realizado de um lead
                    if (req.method === 'PATCH') {
                        const { id, contato_realizado } = JSON.parse(await readBody(req) || '{}')
                        if (!Number.isInteger(id) || typeof contato_realizado !== 'boolean') {
                            return send(400, { error: 'Envie { id: number, contato_realizado: boolean }' })
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
                                body: JSON.stringify({ contato_realizado }),
                            },
                        )
                        if (!rest.ok) throw new Error(`Supabase respondeu ${rest.status}`)
                        const rows = await rest.json()
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
function devApiFalazapp({ falazappApiUrl, falazappToken }) {
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
                    send(200, { ok: true, ...resultado })
                } catch (err) {
                    send(err.statusCode || 502, { error: err.message })
                }
            })
        },
    }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    // Prefixo vazio carrega TODAS as variáveis do .env (inclusive as sem
    // prefixo, como service_role) — mas só para uso do dev server acima.
    const env = loadEnv(mode, process.cwd(), '')

    return {
        plugins: [
            react(),
            devApiLeads({
                supabaseUrl: env.PUBLIC_SUPABASE_URL,
                serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || env.service_role,
            }),
            devApiFalazapp({
                falazappApiUrl: env.FALAZAPP_API_URL,
                falazappToken: env.FALAZAPP_API_TOKEN,
            }),
        ],
        // Aceita variáveis com prefixo VITE_ e PUBLIC_ (mesma convenção do
        // projeto alexdonega-website, que usa Astro). Lidas via import.meta.env.
        envPrefix: ['VITE_', 'PUBLIC_'],
    }
})
