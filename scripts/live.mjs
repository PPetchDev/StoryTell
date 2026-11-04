// The live instance, from this checkout: `npm run live:deploy [-- <ref>]`, `live:start`,
// `live:stop`, `live:status`. Settings come from .env.live (git-ignored; see .env.example).
//
// A deploy builds the ref (default master) in a fresh worktree at <LIVE_HOME>/next while the
// current release keeps serving, then stops it, migrates the live database with the new build,
// swaps the folders (<LIVE_HOME>/app becomes <LIVE_HOME>/previous) and starts the new release.
// Migrations run only here, never from `npm run dev`.
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const TASK_NAME = 'Storytell Live';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.resolve(process.env.LIVE_ENV_FILE ?? path.join(root, '.env.live'));
if (!existsSync(envFile)) {
    fail(`No ${envFile}. Copy the live section of .env.example into .env.live and fill it in (README: "Running live").`);
}
const live = parseEnv(readFileSync(envFile, 'utf8'));
const home = path.resolve(live.LIVE_HOME ?? 'C:\\StorytellLive');
const webPort = Number(live.LIVE_WEB_PORT ?? 3000);
const apiPort = Number(live.LIVE_API_PORT ?? 4000);
const imageDir = path.resolve(live.LIVE_IMAGE_DIR ?? path.join(home, 'images'));
const appDir = path.join(home, 'app');
const nextDir = path.join(home, 'next');
const previousDir = path.join(home, 'previous');
const pidFile = path.join(home, 'run', 'live.pid');

const [command = 'status', ref = 'master'] = process.argv.slice(2);
switch (command) {
    case 'deploy':
        await deploy(ref);
        break;
    case 'start':
        await startApp();
        await reportHealth();
        break;
    case 'stop':
        await stopApp();
        console.log('Live is stopped.');
        break;
    case 'status':
        await status();
        break;
    default:
        fail(`Unknown command "${command}". Use deploy [ref], start, stop or status.`);
}

function fail(message) {
    console.error(`\n${message}\n`);
    process.exit(1);
}

function step(message) {
    console.log(`\n== ${message}`);
}

/** Refuses settings that would let live share anything with dev. */
function checkApartFromDev() {
    if (!live.DATABASE_URL) fail(`DATABASE_URL is not set in ${envFile}.`);
    const devEnv = existsSync(path.join(root, '.env')) ? parseEnv(readFileSync(path.join(root, '.env'), 'utf8')) : {};
    const devPg = Number(devEnv.DEV_PG_PORT ?? 54321);
    const url = new URL(live.DATABASE_URL);
    if (Number(url.port || 5432) === devPg || url.pathname.replace(/^\//, '') === 'storytell_dev') {
        fail(`DATABASE_URL points at the dev database (${url.host}${url.pathname}). Live needs its own.`);
    }
    const devPorts = [Number(devEnv.DEV_WEB_PORT ?? 3001), Number(devEnv.DEV_API_PORT ?? 4001)];
    if (devPorts.includes(webPort) || devPorts.includes(apiPort)) {
        fail(`LIVE_WEB_PORT/LIVE_API_PORT (${webPort}/${apiPort}) clash with dev's ports (${devPorts.join('/')}).`);
    }
    const devData = path.join(root, '.data');
    if (path.resolve(imageDir).startsWith(devData) || home.startsWith(root)) {
        fail(`LIVE_HOME and LIVE_IMAGE_DIR must be outside this checkout (${root}).`);
    }
}

function git(...args) {
    // Long paths: node_modules inside a worktree outgrow Windows' 260-character limit.
    return execFileSync('git', ['-c', 'core.longpaths=true', ...args], { cwd: root, encoding: 'utf8' }).trim();
}

function run(cmd, args, cwd, env = process.env) {
    // npm is a .cmd shim on Windows, so it needs a shell; node itself (a path with a space) must not.
    execFileSync(cmd, args, { cwd, env, stdio: 'inherit', shell: cmd === 'npm' && process.platform === 'win32' });
}

function removeWorktree(dir) {
    if (!existsSync(dir)) return;
    try {
        git('worktree', 'remove', '--force', dir);
    } catch {
        fail(`${dir} exists but is not a worktree of this repository. Look at it, move it away, and deploy again.`);
    }
    git('worktree', 'prune');
}

async function deploy(target) {
    checkApartFromDev();
    const sha = git('rev-parse', '--verify', `${target}^{commit}`);
    console.log(`Deploying ${target} (${sha.slice(0, 7)}) to ${home}`);
    mkdirSync(home, { recursive: true });

    step('Building the new release beside the running one');
    removeWorktree(nextDir);
    git('worktree', 'add', '--detach', nextDir, sha);
    run('npm', ['ci', '--no-audit', '--no-fund'], nextDir);
    run('npm', ['run', 'build', '-w', 'apps/api'], nextDir);
    const webEnv = { ...process.env, API_ORIGIN: `http://127.0.0.1:${apiPort}`, NODE_ENV: 'production' };
    // The live PWA is plain "Storytell AI", and next build writes to the default .next.
    delete webEnv.INSTANCE_LABEL;
    delete webEnv.NEXT_DIST_DIR;
    run('npm', ['run', 'build', '-w', 'apps/web'], nextDir, webEnv);

    step('Stopping the running release');
    await stopApp();

    step('Migrating the live database');
    const migrateEnv = { ...process.env, PORT: String(apiPort), DATABASE_URL: live.DATABASE_URL, IMAGE_DIR: imageDir };
    delete migrateEnv.ENV_FILE;
    try {
        run(process.execPath, ['dist/migrate.js'], path.join(nextDir, 'apps', 'api'), migrateEnv);
    } catch {
        if (existsSync(appDir)) {
            console.error('Migration failed; starting the previous release again.');
            await startApp();
        }
        fail('Migration failed. The new release is left at LIVE_HOME/next for a look.');
    }

    step('Swapping in the new release');
    removeWorktree(previousDir);
    if (existsSync(appDir)) git('worktree', 'move', appDir, previousDir);
    git('worktree', 'move', nextDir, appDir);
    copyFileSync(envFile, path.join(home, 'live.env'));

    step('Starting the new release');
    await startApp();
    await reportHealth();
}

function taskExists() {
    if (process.platform !== 'win32') return false;
    try {
        execFileSync('powershell', ['-NoProfile', '-Command', `if (Get-ScheduledTask -TaskName '${TASK_NAME}' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }`], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function readPids() {
    try {
        return JSON.parse(readFileSync(pidFile, 'utf8'));
    } catch {
        return null;
    }
}

function alive(pid) {
    if (!pid) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function stopApp() {
    // Ending the task first means Task Scheduler sees a stop, not a failure to restart.
    if (taskExists()) {
        execFileSync('powershell', ['-NoProfile', '-Command', `Stop-ScheduledTask -TaskName '${TASK_NAME}'`], { stdio: 'ignore' });
    }
    const pids = readPids();
    for (const pid of [pids?.supervisor, pids?.api, pids?.web]) {
        if (!alive(pid)) continue;
        try {
            if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
            else process.kill(pid, 'SIGTERM');
        } catch {
            // Gone in the meantime.
        }
    }
    rmSync(pidFile, { force: true });
    // Wait until the ports are free, so the next start can bind them.
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && ((await ok(apiPort, '/api/health')) || (await ok(webPort, '/manifest.webmanifest')))) {
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
}

async function startApp() {
    if (!existsSync(path.join(appDir, 'scripts', 'live-run.mjs'))) fail(`No release at ${appDir}. Run npm run live:deploy first.`);
    if (alive(readPids()?.supervisor)) {
        console.log('Live is already running.');
        return;
    }
    if (taskExists()) {
        execFileSync('powershell', ['-NoProfile', '-Command', `Start-ScheduledTask -TaskName '${TASK_NAME}'`], { stdio: 'ignore' });
        return;
    }
    // No startup task registered yet: run the supervisor detached, so it outlives this command.
    const child = spawn(process.execPath, [path.join(appDir, 'scripts', 'live-run.mjs')], {
        cwd: appDir,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
    });
    child.unref();
}

async function ok(port, route) {
    try {
        return (await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(2_000) })).ok;
    } catch {
        return false;
    }
}

async function reportHealth() {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
        // Through the frontend's proxy, so this checks both processes and the rewrite.
        if (await ok(webPort, '/api/health')) {
            console.log(`\nLive is up: http://127.0.0.1:${webPort} (logs in ${path.join(home, 'logs')})\n`);
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    fail(`Live did not answer on http://127.0.0.1:${webPort}/api/health within 90 s. See ${path.join(home, 'logs')}.`);
}

async function status() {
    const pids = readPids();
    const release = existsSync(appDir) ? execFileSync('git', ['-C', appDir, 'log', '-1', '--format=%h %s'], { encoding: 'utf8' }).trim() : 'none';
    console.log(`Live home:      ${home}`);
    console.log(`Release:        ${release}`);
    console.log(`Startup task:   ${taskExists() ? `"${TASK_NAME}" registered` : 'not registered'}`);
    console.log(`Supervisor:     ${alive(pids?.supervisor) ? `running (pid ${pids.supervisor})` : 'not running'}`);
    console.log(`API ${apiPort}:       ${(await ok(apiPort, '/api/health')) ? 'healthy' : 'not answering'}`);
    console.log(`Frontend ${webPort}:  ${(await ok(webPort, '/api/health')) ? 'healthy (proxy to the API works)' : 'not answering'}`);
}
