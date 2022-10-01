// web-test-runner-config.js
import { jasmineTestRunnerConfig } from 'web-test-runner-jasmine';
import viteWebTestRunnerPlugin from './vite-web-test-runner-plugin.mjs';

const testMatch = ['src/**/*.test.ts'];

export default {
    ...jasmineTestRunnerConfig(),
    files: testMatch,
    nodeResolve: true,
    plugins: [
        viteWebTestRunnerPlugin({ testMatch })
    ],
};