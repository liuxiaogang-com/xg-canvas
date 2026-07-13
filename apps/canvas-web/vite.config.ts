import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const packagesRoot = path.resolve(__dirname, '../../packages');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@xgcanvas/shared-types': path.join(packagesRoot, 'shared-types/src/index.ts'),
      '@xgcanvas/adapters-contract': path.join(packagesRoot, 'adapters-contract/src/index.ts'),
      '@xgcanvas/constraint-engine': path.join(packagesRoot, 'constraint-engine/src/index.ts'),
      '@xgcanvas/ui-kit': path.join(packagesRoot, 'ui-kit/src/index.ts'),
    },
  },
  server: {
    host: true,
    port: 5180,
    proxy: {
      '/api': {
        target: process.env.CANVAS_API_URL ?? 'http://localhost:5181',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: true,
  },
});
