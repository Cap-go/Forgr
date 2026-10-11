import { defineConfig } from 'vite';
import path from 'node:path';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  root: '.',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@capgo/oauth-loopback': path.resolve(import.meta.dirname, 'plugins/oauth-loopback/src/index.ts'),
    },
  },
});
