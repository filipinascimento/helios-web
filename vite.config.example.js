// vite.config.js

import { resolve } from 'path'
import { defineConfig } from 'vite'
import { default as originalConfig } from './vite.config.js'

let build = {}

if ("build" in originalConfig){
	build = originalConfig.build;
	if("lib" in build){
		delete build.lib;
	}
}
build.outDir = "dist_example"
build.rollupOptions = {
	input: {
		main: resolve(__dirname, 'docs/example/index.html'),
	},
}
build.assetsDir = "assets"

/** @type {import('vite').UserConfig} */
export default defineConfig({
	base: '', // no base, always relative
	server: {
	  open: '/docs/example/index.html'
	},
	build: build
});

