import { defineConfig } from '@playwright/test';
import { randomBytes } from 'node:crypto';
process.env.RELIC_TEST_PASSWORD ??= randomBytes(24).toString('hex');
export default defineConfig({
  testDir: './frontend/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3333',
    headless: true,
    actionTimeout: 15000,
    navigationTimeout: 20000,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && node --import tsx scripts/e2e-server.ts',
    url: 'http://127.0.0.1:3333/health',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
