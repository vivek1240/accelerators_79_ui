import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // In dev, /api is forwarded to local backend so signup/login and all routes work locally.
      // Set VITE_API_PROXY_TARGET to use another backend (e.g. Railway URL).
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        proxyTimeout: 300000,  // 5 min for long-running /query, /upload
        timeout: 300000,
      },
    },
  },
})
