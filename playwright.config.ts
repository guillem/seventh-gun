import { defineConfig } from '@playwright/test';
import { softwareGl } from './tests/helpers/softwareGl';

const gl = softwareGl();
// Runners have no GPU and vary about 2x between runs, and the one test that
// boots without debug flags needs more than 30 s there. Local limits stay
// tight so a genuine hang is reported quickly.
const ci = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/helpers/globalSetup.ts',
  timeout: ci ? 120000 : 30000,
  expect: { timeout: ci ? 20000 : 5000 },
  retries: 1,
  // A stray test.only would leave the other shards green with nothing run.
  forbidOnly: ci,
  // Stop a broken run early, and end a slow one from inside Playwright (under
  // the workflow's 20-minute step limit) so its failure report is printed.
  maxFailures: ci ? 10 : 0,
  globalTimeout: ci ? 17 * 60000 : 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    // Optional local hardware browser; E2E_GL (CI) picks the software
    // rasterizer, see tests/helpers/softwareGl.ts.
    channel: process.env.PLAYWRIGHT_CHANNEL || gl.channel,
    launchOptions: { args: gl.args },
  },
  projects: [
    {
      name: 'desktop',
      use: {
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
