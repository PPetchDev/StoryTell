import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        root: './',
        include: ['test/**/*.spec.ts'],
        // One PostgreSQL server for the whole run; each test file gets its own database.
        globalSetup: ['./test/harness/global-setup.ts'],
        testTimeout: 30_000,
        hookTimeout: 60_000,
    },
});
