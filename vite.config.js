import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '',
  esbuild: {
    target: 'esnext',
  },
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['helios-network'],
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'HeliosWeb',
      fileName: (format) => {
        if (format === 'es') return 'helios-web.es.js';
        if (format === 'umd') return 'helios-web.umd.cjs';
        return `helios-web.${format}.js`;
      },
    },
    rollupOptions: {
      external: ['helios-network'],
      output: {
        exports: 'named',
        globals: {
          'helios-network': 'HeliosNetwork',
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
});
