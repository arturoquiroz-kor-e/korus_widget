import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Un solo archivo IIFE, sin dependencias en tiempo de ejecución. Los SFC se
// compilan como custom elements: sus <style> viajan en el bundle y Vue los
// inyecta en el shadow root, así que el CSS del portal anfitrión no nos toca
// ni lo tocamos.
export default defineConfig({
  plugins: [vue({ customElement: true })],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    lib: {
      entry: 'src/main.js',
      name: 'KorusChat',
      formats: ['iife'],
      fileName: () => 'widget.js'
    },
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } }
  },
  server: { port: 5175, strictPort: true }
})
