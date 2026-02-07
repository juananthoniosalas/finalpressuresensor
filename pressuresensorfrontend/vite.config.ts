import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

// ⬇️ pengganti __dirname untuk ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },

  server: {
    // ⬇️ WAJIB untuk akses via ngrok
    allowedHosts: [
      '.ngrok-free.app',
    ],

    // ⬇️ opsional tapi sering bantu WS & hot reload
    host: true,
    port: 5173,
    strictPort: true,
  },
})
