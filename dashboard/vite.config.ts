import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname),
  build: {
    outDir: resolve(__dirname, '../dist/dashboard-ui'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3737',
    },
  },
});
