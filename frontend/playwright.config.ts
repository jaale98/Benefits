import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command:
        'cd ../backend && DB_PROVIDER=memory JWT_SECRET=test-jwt-secret-at-least-32-characters SEED_FULL_ADMIN_EMAIL=platform-admin@example.com SEED_FULL_ADMIN_PASSWORD=ChangeMe123! npm run start:e2e',
      url: 'http://127.0.0.1:4000/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
