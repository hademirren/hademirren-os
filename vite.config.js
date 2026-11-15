import { defineConfig } from 'vite'

export default defineConfig({
  // three.js is one big chunk, but it only loads when a project window opens
  build: { chunkSizeWarningLimit: 700 },
})
