// Starts the prompt eval run (.scratch/prompt-evals/spec.md): fixed scenes through the real turn
// prompt and a real play model, each reply checked, a scorecard printed.
// It spends real OpenRouter credit (at most $0.50), so it refuses to start without --spend.
//
//   npm run eval:live -- all --spend
//   npm run eval:live -- facts repeats --spend --model deepseek-v4-pro
//   npm run eval:live -- all --spend --against last
//   npm run eval:live -- voice --spend --samples 6
//
// The full report, with the played text, lands under .data/eval-runs/ (gitignored).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const VALUED = ['--model', '--samples', '--against'];
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
    },
});
child.on('exit', (code) => process.exit(code ?? 1));
