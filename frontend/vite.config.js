import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/auth': { target: 'http://localhost:5000', changeOrigin: true },
      '/api':  { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
  build: {
    // Split heavy vendor libraries into separate chunks so visitors
    // only download what each route actually needs.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':     ['react', 'react-dom', 'react-router-dom'],
          'vendor-charts':    ['recharts'],
          'vendor-3d':        ['three'],
          'vendor-motion':    ['framer-motion'],
          'vendor-icons':     ['lucide-react'],
          'vendor-http':      ['axios'],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
});