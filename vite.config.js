import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Middleware de desenvolvimento que replica a função serverless
// GET /api/leads (api/leads.js) quando o dev server do Vite está rodando
// (`npm run dev`). Sem ele, o /dash no localhost ficaria sem dados, pois o
// Vite não executa as funções da Vercel. A service_role nunca vai para o
// bundle — ela só é usada aqui, no processo do dev server.
function devApiLeads({ supabaseUrl, serviceRoleKey }) {
    return {
        name: 'dev-api-leads',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use('/api/leads', async (_req, res) => {
                try {
                    if (!supabaseUrl || !serviceRoleKey) {
                        throw new Error('PUBLIC_SUPABASE_URL ou service_role ausente no .env')
                    }
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
                    res.statusCode = 200
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify({ leads, updatedAt: new Date().toISOString() }))
                } catch (err) {
                    res.statusCode = 502
                    res.setHeader('Content-Type', 'application/json')
                    res.end(JSON.stringify({ error: 'Falha ao consultar o Supabase', detail: err.message }))
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
        ],
        // Aceita variáveis com prefixo VITE_ e PUBLIC_ (mesma convenção do
        // projeto alexdonega-website, que usa Astro). Lidas via import.meta.env.
        envPrefix: ['VITE_', 'PUBLIC_'],
    }
})
