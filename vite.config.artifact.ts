import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Standalone single-file build used only to preview the app as a Claude Artifact.
// The real deployable PWA build uses vite.config.ts (with vite-plugin-pwa).
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      'virtual:pwa-register': fileURLToPath(
        new URL('./src/pwa-register-stub.ts', import.meta.url),
      ),
    },
  },
  build: {
    outDir: 'dist-artifact',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
  },
})
