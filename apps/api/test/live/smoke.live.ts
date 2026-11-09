import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

import { DEFAULT_REPORT_DIR, REPO_ROOT, startSmokeRun } from './smoke-run.js';

/**
 * The live smoke run's entry (ticket 05 runs it; nothing else may). It spends real OpenRouter
 * credit, so it is not a `*.spec.ts` and the normal test run never collects it. Start it with
 * `npm run smoke:live -- <candidate|all> --spend` from apps/api.
 */
it(
    'runs the live smoke run for the named candidates',
    async () => {
        const env: Record<string, string | undefined> = { ...process.env };
        // The key is read from the root .env only once the spend flag is set, and never printed.
        const envFile = path.join(REPO_ROOT, '.env');
        if (env.SMOKE_SPEND === 'yes' && !env.OPENROUTER_API_KEY && existsSync(envFile)) {
            env.OPENROUTER_API_KEY = parseEnv(readFileSync(envFile, 'utf8')).OPENROUTER_API_KEY;
        }
        await startSmokeRun(env, {
            fetch: globalThis.fetch.bind(globalThis),
            reportDir: DEFAULT_REPORT_DIR,
            log: (line) => console.log(line),
        });
    },
    15 * 60_000,
);
