import { defineConfig, devices } from '@playwright/test';

import { E2E_API_PORT, E2E_WEB_PORT } from './e2e/harness/ports';

export default defineConfig({
    testDir: './e2e',
    // One shared API that some tests stop and restart, so tests run one at a time.
    workers: 1,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    timeout: 60_000,
    expect: { timeout: 15_000 },
    reporter: [['list'], ['html', { open: 'never' }]],
    globalSetup: './e2e/harness/global-setup.ts',
    use: {
        // localhost counts as a secure context, so the service worker and install checks run.
        baseURL: `http://localhost:${E2E_WEB_PORT}`,
        trace: 'retain-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: `npx next dev --port ${E2E_WEB_PORT}`,
        url: `http://localhost:${E2E_WEB_PORT}/manifest.webmanifest`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
            API_ORIGIN: `http://127.0.0.1:${E2E_API_PORT}`,
            // Its own build folder, so E2E can run while `npm run dev` is up.
            NEXT_DIST_DIR: '.next-e2e',
            // Start cold each run; see next.config.ts.
            NEXT_DEV_FS_CACHE: 'off',
        },
    },
});
