import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    fs: {
      // The renderer type-imports capability-artifact types straight from
      // the repo root's src/ (see build-specs/CONSOLE_BUILD_SPEC.md §1)
      // instead of redeclaring them.
      allow: [path.resolve(__dirname, '..'), path.resolve(__dirname, '.')],
    },
  },
})
