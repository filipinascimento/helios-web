// vite.config.js

import { resolve } from 'path'
import { defineConfig } from 'vite'

/** @type {import('vite').UserConfig} */
export default defineConfig({
	// optimizeDeps: {
	//   esbuildOptions: { target: "es2020", supported: { bigint: true } },
	// },
	// esbuild: {
	//   target: "es2020"
	// },
	build: {
		target: "esnext",
		sourcemap: true,
		lib: {
			entry: resolve(__dirname, 'src/helios.js'),
			name: 'helios-web-dev',
			// the proper extensions will be added
			fileName: 'helios'
		},
		minify:true
	},
	server: {
	  open: '/docs/example/index.html'
	}
});
