import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const packageRoot = __dirname;

export default defineConfig({
  testDir: './tests/production',
  outputDir: 'run_results/production',
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [
    [process.env.CI ? 'github' : 'list'],
    ['./reporters/log-summary-reporter.ts'],
  ],
  use: {
    baseURL: process.env.FRONTEND_BASE_URL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'off',
    video: 'off',
    testIdAttribute: 'data-testid',
  },
  projects: [
    {
      name: 'production-contracts',
      testMatch: /.*\.contract\.spec\.ts/,
    },
    {
      name: 'production-authentication',
      testMatch: /.*\.production\.setup\.ts/,
    },
    {
      name: 'production-chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.resolve(
          packageRoot,
          '.auth',
          'production-user.json',
        ),
      },
      testIgnore: /.*\.contract\.spec\.ts/,
      dependencies: ['production-authentication'],
    },
  ],
});
