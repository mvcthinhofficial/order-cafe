import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  base: './',
  server: {
    host: '0.0.0.0', // Lắng nghe tất cả network interfaces
    port: 5173,
    allowedHosts: true, // Cho phép tất cả Host (cần thiết cho Cloudflare Tunnel)
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/data': 'http://127.0.0.1:3001'
    },
    watch: {
      ignored: ['**/data/**', '**/*.log', '**/dist/**', '**/release/**']
    }
  }
})
