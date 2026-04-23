import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: 'app',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'app'),
    },
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/images': 'http://127.0.0.1:8787',
    },
  },
});
