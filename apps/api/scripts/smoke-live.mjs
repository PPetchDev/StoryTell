// Starts the live smoke run for candidate play models (.scratch/models-and-samplers ticket 05).
// It spends real OpenRouter credit (at most $0.50), so it refuses to start without --spend.
//
//   npm run smoke:live -- kimi-k2.6 --spend
//   npm run smoke:live -- all --spend
//
// The full report, with the played text, lands under .data/smoke-runs/ (gitignored).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const candidates = args.filter((arg) => !arg.startsWith('--'));
const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const child = spawn('npx', ['vitest', 'run', '--config', 'vitest.live.config.ts'], {
    cwd: apiDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
        ...process.env,
        SMOKE_SPEND: args.includes('--spend') ? 'yes' : '',
        SMOKE_CANDIDATES: candidates.join(','),
    },
});
child.on('exit', (code) => process.exit(code ?? 1));
