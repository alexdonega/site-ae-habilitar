import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    // Aceita variáveis com prefixo VITE_ e PUBLIC_ (mesma convenção do
    // projeto alexdonega-website, que usa Astro). Lidas via import.meta.env.
    envPrefix: ['VITE_', 'PUBLIC_'],
})
