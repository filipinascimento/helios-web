// vite-web-test-runner-plugin.js
import { createServer } from 'vite';
import { join, relative } from 'node:path';
import koaConnect from 'koa-connect';
import minimatch from 'minimatch';


/** @typedef { import('@web/test-runner').TestRunnerPlugin } RunnerPlugin */

/**
 * @return { RunnerPlugin }
*/
export default function viteWebTestRunnerPlugin({ testMatch, testRoot = process.cwd(), viteConfigFile } = {}) {
    let viteServer;
    let viteRoot;
    let relativeRoot;

    return {
        name: 'vite-wtr-plugin',
        async serverStart({ app, fileWatcher }) {
            viteServer = await createServer({
                clearScreen: true,
                server: { middlewareMode: true, hmr: false },
                appType: 'custom',
                configFile: viteConfigFile || join(testRoot, 'vite.config.ts')
            });

            viteRoot = viteServer.config.root;

            // This path represents the diff beween the test root and the vite root
            // viteRoot should always be a relative path from the root (ex. testRoot: /root/test vs viteRoot: /root/test/src/module)
            relativeRoot = `/${relative(testRoot, viteRoot)}`;

            // Allow vite to take over most requests
            app.use(koaConnect(viteServer.middlewares));

            // Vite is taking over the handling of URLs, hence we need to forward the watching to the runner
            viteServer.watcher.on('change', (...args) => fileWatcher.emit('change', ...args));

        },
        async transformImport({ source }) {
            const [absSource, ] = source.split('?'); // Remove the queryString otherwise vite will fail resolving
            const relativeSource = absSource.at(0) === '/' ? absSource.substring(1) : absSource;
            for (const match of testMatch) {
                if (minimatch(relativeSource, match)) {
                    const newPath = absSource.replace(relativeRoot, '');
                    return newPath;
                }
            }
        },
        async serverStop() {
            return viteServer.close();
        },
    }
}