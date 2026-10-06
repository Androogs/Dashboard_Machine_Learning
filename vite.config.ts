import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Configuración de Vite. El alias "@" apunta a /src para imports limpios.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 1600 },
})
