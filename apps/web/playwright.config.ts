import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'pnpm exec sirv build --single --port 4173',
          port: 4173,
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
      }),
});
