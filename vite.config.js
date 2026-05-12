import { defineConfig } from 'vite';
import fs from 'node:fs';
import { resolve } from 'node:path';

function getRealpathSafe(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

export default defineConfig(({ mode }) => {
  const useHttps = mode === 'https' || process.env.HTTPS === 'true';

  return {
    base: '/',
    plugins: [],
    resolve: {
      // When `helios-network` is brought in via `npm link`, it's a symlink to a
      // path outside this repo. Preserving symlinks keeps module URLs under
      // `node_modules/` so Vite can serve worker files without `/@fs/` escaping.
      preserveSymlinks: true,
      dedupe: ['helios-network'],
    },
    server: {
      https: useHttps ? true : undefined,
      fs: {
        // Keep the default root allow-list PLUS allow common linked-dep paths.
        // (Specifying `allow` overrides Vite defaults, so include the app root.)
        allow: [
          __dirname,
          getRealpathSafe(resolve(__dirname, 'node_modules/helios-network')),
          getRealpathSafe(resolve(__dirname, 'node_modules/vite/dist/client')),
        ].filter(Boolean),
      },
      watch: {
        ignored: ['**/for_reference/**'],
      },
    },
    esbuild: {
      target: 'esnext',
    },
    assetsInclude: ['**/*.wasm'],
    optimizeDeps: {
      // Needed so Vite rewrites helios-network's `runWorker()` helper to a served worker chunk.
      // If the dep is pre-bundled, Vite may not transform the worker URL and requests can hang.
      exclude: ['helios-network'],
      entries: [
        'tests/fixtures/**/*.html',
        'scripts/layout-calibration/calibration-page.html',
        'docs/examples/**/*.html',
      ],
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
  };
});
