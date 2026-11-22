import { defineConfig } from 'vitest/config';

/**
 * The live runs only: the smoke run (test/live/smoke.live.ts) and the prompt eval run
 * (test/live/eval.live.ts), each started by its own script, which names its file. They spend real
 * OpenRouter credit, so the normal `vitest run` (vitest.config.ts, `*.spec.ts` only) never collects
 * them. Needs no database.
 */
export default defineConfig({
    test: {
        globals: true,
        root: './',
        include: ['test/live/**/*.live.ts'],
        testTimeout: 15 * 60_000,
    },
});
