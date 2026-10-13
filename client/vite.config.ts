import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000', '/uploads': 'http://localhost:4000', '/sitemap.xml': 'http://localhost:4000', '/robots.txt': 'http://localhost:4000' } },
  build: { sourcemap: false, chunkSizeWarningLimit: 700 },
});
