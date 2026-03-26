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
    host: '0.0.0.0', // Lắng nghe tất cả network interfaces (bao gồm LAN)
    port: 5173,
    watch: {
      ignored: ['**/data/**', '**/*.log', '**/dist/**', '**/release/**']
    }
  }
})
