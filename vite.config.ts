import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Dev-time proxy: forwards /api/claude to the local node proxy.mjs on 3456.
      // In production this route is served by api/claude.js as a Vercel serverless function.
      '/api/claude': {
        target: 'http://localhost:3456',
        changeOrigin: true,
        rewrite: () => '/',
      },
      // /api/research path is preserved so dev-proxy can route it.
      // In production this is served by api/research.js as a Vercel serverless function.
      '/api/research': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
      // DP1.5.C — per-tool dispatch (exa | perplexity | firecrawl-search |
      // firecrawl-scrape | context7). Served by api/research-tool.js in
      // production; dev-proxy.mjs mirrors the route locally.
      '/api/research-tool': {
        target: 'http://localhost:3456',
        changeOrigin: true,
      },
      // DP1.6.B — Phase D architecture diagram (Gemini Nano Banana Pro).
      // Served by api/diagram.js in production; dev-proxy.mjs mirrors locally.
      // Long timeout (60s) because Pro model can take 20-25s end-to-end.
      '/api/diagram': {
        target: 'http://localhost:3456',
        changeOrigin: true,
        timeout: 60_000,
        proxyTimeout: 60_000,
      },
    },
  },
})
