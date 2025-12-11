import { defineConfig } from '@playwright/test';

const isLinux = process.platform === 'linux';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  projects: [
    {
      name: 'chromium',
      grepInvert: /@webgpu/,
      use: { browserName: 'chromium' },
    },
    {
      name: 'chromium-webgpu-headed',
      grep: /@webgpu/,
      use: {
        browserName: 'chromium',
        headless: false,
        launchOptions: {
          args: [
            '--enable-unsafe-webgpu',
            '--disable-dawn-features=disallow_unsafe_apis',
            '--use-angle=metal',
            ...(isLinux ? ['--enable-features=Vulkan,UseSkiaRenderer'] : []),
          ],
        },
      },
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_HOST: '127.0.0.1',
      VITE_NODE_COUNT: '2000',
    },
  },
});
