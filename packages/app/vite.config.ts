import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages de proyecto sirve en /<repo>/: se pasa por VITE_BASE en el
// workflow de despliegue. En local y en Pages de usuario, la raíz.
export default defineConfig({
  base: process.env['VITE_BASE'] ?? '/',
  plugins: [react()],
  build: {
    // Un teléfono en campo puede ser viejo; no vale la pena apuntar a lo último.
    target: 'es2020',
    sourcemap: true,
  },
})
