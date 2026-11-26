// Starts the prompt eval run (.scratch/prompt-evals/spec.md): fixed scenes through the app's real
// prompts (the turn, the Judge, Memory extraction) and a real model, each answer checked, a
// scorecard printed.
// It spends real OpenRouter credit (at most $0.50), so it refuses to start without --spend; the
// refusal says how many calls the named scenes would send and what they would cost.
//
//   npm run eval:live -- all                      (spends nothing: says what the run would cost)
//   npm run eval:live -- all --spend
//   npm run eval:live -- facts repeats --spend --model deepseek-v4-pro
//   npm run eval:live -- all --spend --against last
//   npm run eval:live -- voice --spend --samples 6
//   npm run eval:live -- all --spend --model all      (each play model, one scorecard side by side)
//   npm run eval:live -- all --spend --parallel 1     (one call at a time; four unless told)
//
//   npm run eval:live -- --grade                   (the grader alone, on replies whose verdict is known; says its cost)
//   npm run eval:live -- --grade --spend
//   npm run eval:live -- --label-sheet             (free: the saved runs' replies, to label by hand)
//   npm run eval:live -- --grade --labels <file> --spend
//
//   npm run eval:live -- --memory                  (the long-term memory eval: says what its four layers would cost)
//   npm run eval:live -- --memory --spend
//   npm run eval:live -- --memory choice account --spend --against last
//   npm run eval:live -- --memory account-long            (the long-input account eval on copies of live Chats; says its cost)
//   npm run eval:live -- --memory account-long c d --spend (arms c and d; "now" alone when none is named)
//   npm run eval:live -- --memory account-long --rescore last   (free: the newest report scored again by the plan as it is now)
//
// The copies come from scripts/export-chat.mjs (repo root) into .data/eval-inputs/, with the plan of checks beside them.
// The full report, with the played text, lands under .data/eval-runs/ (gitignored).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const VALUED = ['--model', '--samples', '--against', '--parallel', '--labels', '--rescore'];
const options = {};
const scenes = [];
for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (VALUED.includes(arg)) options[arg] = args[++index] ?? '';
    else if (!arg.startsWith('--')) scenes.push(arg);
}
const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const child = spawn('npx', ['vitest', 'run', '--config', 'vitest.live.config.ts', 'test/live/eval.live.ts'], {
    cwd: apiDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
        ...process.env,
        EVAL_SPEND: args.includes('--spend') ? 'yes' : '',
        EVAL_SCENES: scenes.join(','),
        EVAL_MODEL: options['--model'] ?? '',
        EVAL_SAMPLES: options['--samples'] ?? '',
        EVAL_AGAINST: options['--against'] ?? '',
        EVAL_PARALLEL: options['--parallel'] ?? '',
        EVAL_MEMORY: args.includes('--memory') ? 'yes' : '',
        EVAL_GRADE: args.includes('--label-sheet') ? 'sheet' : args.includes('--grade') ? 'yes' : '',
        EVAL_LABELS: options['--labels'] ? path.resolve(options['--labels']) : '',
        EVAL_RESCORE: !options['--rescore'] ? '' : options['--rescore'] === 'last' ? 'last' : path.resolve(options['--rescore']),
    },
});
child.on('exit', (code) => process.exit(code ?? 1));
