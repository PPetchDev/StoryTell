import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

import { startGraderCheck } from './eval-grade.js';
import { startMemoryEval } from './eval-memory-run.js';
import { DEFAULT_EVAL_DIR, startEvalRun } from './eval-run.js';
import { REPO_ROOT } from './smoke-run.js';

/**
 * The prompt eval run's entry (.scratch/prompt-evals/spec.md). It spends real OpenRouter credit,
 * so it is not a `*.spec.ts` and the normal test run never collects it. Start it with
 * `npm run eval:live -- <scene|all> --spend` from apps/api.
 */
it(
    'runs the prompt eval run for the named scenes',
    async () => {
        const env: Record<string, string | undefined> = { ...process.env };
        // The key is read from the root .env only once the spend flag is set, and never printed.
        const envFile = path.join(REPO_ROOT, '.env');
        if (env.EVAL_SPEND === 'yes' && !env.OPENROUTER_API_KEY && existsSync(envFile)) {
            env.OPENROUTER_API_KEY = parseEnv(readFileSync(envFile, 'utf8')).OPENROUTER_API_KEY;
        }
        // --grade checks the grader alone (eval-grade.ts); --label-sheet writes the replies to label by hand.
        // --memory runs the long-term memory eval (eval-memory-run.ts) in place of the scenes.
        await (env.EVAL_MEMORY ? startMemoryEval : env.EVAL_GRADE ? startGraderCheck : startEvalRun)(env, {
            fetch: globalThis.fetch.bind(globalThis),
            reportDir: DEFAULT_EVAL_DIR,
            log: (line) => console.log(line),
        });
    },
    15 * 60_000,
);
