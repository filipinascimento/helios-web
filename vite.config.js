// vite.config.js

import { resolve } from 'path'
import { defineConfig } from 'vite'
import * as path from 'path';
import * as fs from 'fs';

function stripDocumentationFromBuild () {
	return {
	  name: 'strip-build-docs',
	  resolveId (source) {
		return source === 'virtual-module' ? source : null
	  },
	  renderStart (outputOptions, inputOptions) {
		const outDir = outputOptions.dir
		const docsDir = path.resolve(outDir, 'docs')
		fs.rm(docsDir, { recursive: true }, () => console.log(`Deleted ${docsDir}`))
	  }
	}
  }
  


/** @type {import('vite').UserConfig} */
export default defineConfig({
	// optimizeDeps: {
	//   esbuildOptions: { target: "es2020", supported: { bigint: true } },
	// },
	// esbuild: {
	//   target: "es2020"
	// },
	plugins: [stripDocumentationFromBuild()],
	build: {
		target: "esnext",
		sourcemap: true,
		lib: {
			entry: resolve(__dirname, 'src/helios.js'),
			name: 'helios',
			// the proper extensions will be added
			fileName: 'helios'
		},
		minify: true,
	},
	server: {
	  open: '/docs/example/index.html'
	},
	test: {
	/* for example, use global to avoid globals imports (describe, test, expect): */
	// globals: true,
	environment: "jsdom"
	},
});

