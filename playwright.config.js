import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
    {
      name: 'chromium-webgpu-headed',
      use: {
        browserName: 'chromium',
        headless: false,
        launchOptions: {
          args: [
            '--enable-unsafe-webgpu',
            '--disable-dawn-features=disallow_unsafe_apis',
            '--use-angle=metal',
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
    },
  },
});
