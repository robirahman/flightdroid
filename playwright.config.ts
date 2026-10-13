import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:4173/flightdroid/',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/flightdroid/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
