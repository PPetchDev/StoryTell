// Runs the e2e suite as a few shards at once, each a whole stack of its own: its own PostgreSQL,
// API and Next.js on their own ports, so the fake Model Gateway's scripted replies never cross
// between tests. One stack runs its tests one at a time (playwright.config.ts), which took about
// 16 minutes for the whole suite; three at once share that out.
//
//   node apps/web/scripts/e2e-shards.mjs                 the whole suite in 3 shards
//   node apps/web/scripts/e2e-shards.mjs --shards 2      in 2 (each stack takes about 2 GB)
//   node apps/web/scripts/e2e-shards.mjs e2e/chat.spec.ts --grep Retry   anything else goes to Playwright
//
// The API is built once into dist-e2e for every shard. Each shard writes its output to
// e2e-shards/shard-<n>.log, its results to e2e-shards/shard-<n>/results/ and its report to
// e2e-shards/shard-<n>/report/: outside test-results/, which a single run empties. Ports: web 3301, 3311, …; API 4301, 4311, … (never dev's
// 3001/4001 or live's 3000/4000).
import { execSync, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(webDir, '..', 'api');

const args = process.argv.slice(2);
let shards = 3;
const at = args.indexOf('--shards');
if (at !== -1) {
    shards = Number(args[at + 1]);
    args.splice(at, 2);
}
if (!Number.isInteger(shards) || shards < 1) throw new Error('--shards takes a whole number of 1 or more');

const started = Date.now();
const elapsed = () => {
    const seconds = Math.round((Date.now() - started) / 1000);
    return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
};

// The same compile global setup runs (e2e/harness/api-server.ts, buildApi), once.
console.log('Building the API into dist-e2e…');
rmSync(path.join(apiDir, 'dist-e2e'), { recursive: true, force: true });
execSync('npx tsc -p tsconfig.build.json --outDir dist-e2e --incremental false', { cwd: apiDir, stdio: 'inherit' });

mkdirSync(path.join(webDir, 'e2e-shards'), { recursive: true });
const runs = [];
for (let n = 1; n <= shards; n++) {
    const nextDir = `.next-e2e/shard-${n}`;
    // Start cold, as a single run does (playwright.config.ts: a stale dev cache reloads pages in a loop).
    rmSync(path.join(webDir, nextDir), { recursive: true, force: true });
    const log = path.join(webDir, 'e2e-shards', `shard-${n}.log`);
    const out = createWriteStream(log);
    const quoted = args.map((arg) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg));
    const child = spawn(`npx playwright test --shard=${n}/${shards} --reporter=line ${quoted.join(' ')}`, {
        cwd: webDir,
        shell: true,
        env: {
            ...process.env,
            E2E_WEB_PORT: String(3301 + (n - 1) * 10),
            E2E_API_PORT: String(4301 + (n - 1) * 10),
            E2E_NEXT_DIR: nextDir,
            E2E_RESULTS_DIR: `e2e-shards/shard-${n}/results`,
            E2E_REPORT_DIR: `e2e-shards/shard-${n}/report`,
            E2E_API_PREBUILT: '1',
        },
    });
    child.stdout.pipe(out);
    child.stderr.pipe(out);
    runs.push({
        n,
        log,
        done: new Promise((resolve) => child.on('close', (code) => resolve({ code, at: elapsed() }))),
    });
}

/** The last "[done/total]" a shard's log shows, or what it is doing before its first test. */
function progress(log) {
    let text = '';
    try {
        text = readFileSync(log, 'utf8');
    } catch {
        return 'starting';
    }
    const counts = [...text.matchAll(/^\[(\d+)\/(\d+)\]/gm)];
    return counts.length ? `${counts.at(-1)[1]}/${counts.at(-1)[2]}` : 'starting';
}

const ticker = setInterval(() => {
    console.log(`${elapsed()}  ${runs.map((run) => `shard ${run.n}: ${progress(run.log)}`).join('   ')}`);
}, 30_000);

const results = await Promise.all(runs.map((run) => run.done));
clearInterval(ticker);

console.log(`\nAll shards done in ${elapsed()}.`);
let failed = false;
for (const [i, run] of runs.entries()) {
    const text = readFileSync(run.log, 'utf8');
    const summary = text
        .split('\n')
        .filter((line) => /^\s+\d+ (passed|failed|flaky|skipped|did not run)/.test(line))
        .map((line) => line.trim())
        .join(', ');
    const { code, at } = results[i];
    if (code !== 0) failed = true;
    console.log(`shard ${run.n}: ${summary || 'no summary'} (exit ${code}, at ${at}); log ${path.relative(process.cwd(), run.log)}`);
    if (code !== 0) {
        // The failures as Playwright listed them, so they read here without opening the log.
        const listed = text.split('\n').filter((line) => /^\s+\d+\) /.test(line));
        for (const line of listed) console.log(`  ${line.trim()}`);
    }
}
process.exit(failed ? 1 : 0);
