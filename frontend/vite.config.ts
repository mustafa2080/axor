import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
