import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { buildCsp } from './src/lib/csp.ts'

// Adds the Content Security Policy to the built index.html only. The dev server needs inline
// scripts for hot reload, so it is left alone (ADR-0014).
function contentSecurityPolicy(): Plugin {
  return {
    name: 'axor-content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp() },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  server: {
    // WEB_ORIGIN في الباك الافتراضي http://localhost:5173، فالبورت ثابت.
    port: 5173,
    strictPort: true,
    // نفس الأصل (same-origin): كوكي الـ refresh بيشتغل (SameSite=Strict) ومفيش CORS في التطوير.
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: false },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
