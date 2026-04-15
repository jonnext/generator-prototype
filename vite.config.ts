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
    },
  },
})
