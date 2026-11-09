import { defineConfig } from 'vitest/config';

/**
 * The live smoke run only (test/live/smoke.live.ts). It spends real OpenRouter credit, so the
 * normal `vitest run` (vitest.config.ts, `*.spec.ts` only) never collects it. Needs no database.
 */
export default defineConfig({
    test: {
        globals: true,
        root: './',
        include: ['test/live/**/*.live.ts'],
        testTimeout: 15 * 60_000,
    },
});
