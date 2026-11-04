// The live instance, from this checkout: `npm run live:deploy [-- <ref>]`, `live:rollback`,
// `live:start`, `live:stop`, `live:status`. Settings come from .env.live (git-ignored; see
// .env.example and README "Running live").
//
// A deploy builds the ref (default master) as a new release in <LIVE_HOME>/releases/<commit>-<time>
// while the current one keeps serving, then stops live, migrates the live database with the new
// build, points <LIVE_HOME>/current at the new release and starts it. The release before stays
// on disk for `live:rollback`; older ones are removed. Migrations run only here, never in dev.
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const TASK_NAME = 'Storytell Live';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.resolve(process.env.LIVE_ENV_FILE ?? path.join(root, '.env.live'));
if (!existsSync(envFile)) {
    fail(`No ${envFile}. Copy the live block of .env.example into .env.live and fill it in (README: "Running live").`);
}
const live = parseEnv(readFileSync(envFile, 'utf8'));
const home = path.resolve(live.LIVE_HOME ?? 'C:\\StorytellLive');
const webPort = Number(live.LIVE_WEB_PORT ?? 3000);
const apiPort = Number(live.LIVE_API_PORT ?? 4000);
const imageDir = path.resolve(live.LIVE_IMAGE_DIR ?? path.join(home, 'images'));
const releasesDir = path.join(home, 'releases');
const currentFile = path.join(home, 'current');
const previousFile = path.join(home, 'previous');
const pidFile = path.join(home, 'run', 'live.pid');

const [command = 'status', ref = 'master'] = process.argv.slice(2);
switch (command) {
    case 'deploy':
        await deploy(ref);
        break;
    case 'rollback':
        await rollback();
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
    case 'backup':
        backupNow();
        break;
    case 'home':
        // For scripts/live-task.ps1, so LIVE_HOME is read in one place.
        console.log(home);
        break;
    default:
        fail(`Unknown command "${command}". Use deploy [ref], rollback, start, stop, status or backup.`);
}

function fail(message) {
    console.error(`\n${message}\n`);
    process.exit(1);
}

function step(message) {
    console.log(`\n== ${message}`);
}

/** Is `child` the folder `parent` or inside it? Case-insensitive on Windows, like the file system. */
function inside(child, parent) {
    const rel = path.relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Refuses settings that would let live share anything with dev or lose its images. */
function checkSettings() {
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
    if (inside(home, root)) fail(`LIVE_HOME (${home}) must be outside this checkout (${root}).`);
    if (inside(imageDir, root)) fail(`LIVE_IMAGE_DIR (${imageDir}) must be outside this checkout (${root}).`);
    // Releases are deleted on later deploys; images kept there would go with them.
    if (inside(imageDir, releasesDir)) fail(`LIVE_IMAGE_DIR (${imageDir}) must not be inside ${releasesDir}.`);
}

function git(...args) {
    // Long paths: node_modules inside a release outgrow Windows' 260-character limit.
    return execFileSync('git', ['-c', 'core.longpaths=true', ...args], { cwd: root, encoding: 'utf8' }).trim();
}

function run(cmd, args, cwd, env = process.env) {
    // npm is a .cmd shim on Windows, so it needs a shell; node itself (a path with a space) must not.
    execFileSync(cmd, args, { cwd, env, stdio: 'inherit', shell: cmd === 'npm' && process.platform === 'win32' });
}

function readName(file) {
    return existsSync(file) ? readFileSync(file, 'utf8').trim() || null : null;
}

function releaseDir(name) {
    return path.join(releasesDir, name);
}

/** Removes a release folder: its worktree registration, then whatever git leaves (npm's junctions). */
function removeRelease(dir) {
    if (!inside(dir, releasesDir) || dir === releasesDir) throw new Error(`Refusing to remove ${dir}`);
    try {
        git('worktree', 'remove', '--force', dir);
    } catch {
        // Not a registered worktree (any more); the folder is removed below either way.
    }
    // rmSync removes junctions without following them, so the targets are safe.
    rmSync(dir, { recursive: true, force: true });
    git('worktree', 'prune');
}

async function deploy(target) {
    checkSettings();
    const sha = git('rev-parse', '--verify', `${target}^{commit}`);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
    const name = `${sha.slice(0, 7)}-${stamp}`;
    const dir = releaseDir(name);
    const current = readName(currentFile);
    console.log(`Deploying ${target} (${sha.slice(0, 7)}) to ${home}${current ? `, replacing ${current}` : ''}`);
    mkdirSync(releasesDir, { recursive: true });

    step(`Building release ${name} while live keeps running`);
    try {
        git('worktree', 'add', '--detach', dir, sha);
        run('npm', ['ci', '--no-audit', '--no-fund'], dir);
        run('npm', ['run', 'build', '-w', 'apps/api'], dir);
        const webEnv = { ...process.env, API_ORIGIN: `http://127.0.0.1:${apiPort}`, NODE_ENV: 'production' };
        // The live PWA is plain "Storytell AI", and next build writes to the default .next.
        delete webEnv.INSTANCE_LABEL;
        delete webEnv.NEXT_DIST_DIR;
        run('npm', ['run', 'build', '-w', 'apps/web'], dir, webEnv);
    } catch (error) {
        removeRelease(dir);
        fail(`The build failed (${error.message.split('\n')[0]}). Live was not touched.`);
    }

    step('Stopping live');
    await stopApp();

    step('Migrating the live database');
    const migrateEnv = { ...process.env, PORT: String(apiPort), DATABASE_URL: live.DATABASE_URL, IMAGE_DIR: imageDir };
    delete migrateEnv.ENV_FILE;
    try {
        run(process.execPath, ['dist/migrate.js'], path.join(dir, 'apps', 'api'), migrateEnv);
    } catch {
        // Each migration runs in its own transaction: the ones before the failing one stay applied.
        if (current) {
            console.error('A migration failed; starting the current release again.');
            await startApp();
            await reportHealth();
        }
        fail(`A migration failed. Migrations before it in this deploy stay applied. The new build stays at ${dir} for a look.`);
    }

    step('Switching to the new release');
    if (current) writeFileSync(previousFile, current);
    writeFileSync(currentFile, name);
    copyScripts(dir);
    copyFileSync(envFile, path.join(home, 'live.env'));

    step('Starting live');
    await startApp();
    await reportHealth('If the new release misbehaves, npm run live:rollback goes back to the one before.');

    // Keep the running release and the one before it; older ones only take space.
    const keep = new Set([name, current].filter(Boolean));
    for (const entry of readdirSync(releasesDir)) {
        if (!keep.has(entry)) removeRelease(releaseDir(entry));
    }
}

async function rollback() {
    checkSettings();
    const current = readName(currentFile);
    const previous = readName(previousFile);
    if (!previous || !existsSync(path.join(releaseDir(previous), 'apps', 'api', 'dist', 'main.js'))) {
        fail('There is no previous release to go back to.');
    }
    console.log(`Rolling back from ${current} to ${previous}. The database is not rolled back.`);
    await stopApp();
    writeFileSync(currentFile, previous);
    if (current) writeFileSync(previousFile, current);
    copyScripts(releaseDir(previous));
    await startApp();
    await reportHealth();
}

/** The supervisor and the backup job run from LIVE_HOME, so the startup task's path never changes. */
function copyScripts(dir) {
    for (const script of ['live-run.mjs', 'backup.mjs']) {
        const source = path.join(dir, 'scripts', script);
        // Releases from before the backup job have no backup.mjs; keep whatever is there.
        if (existsSync(source)) copyFileSync(source, path.join(home, script));
    }
}

function backupNow() {
    if (!existsSync(path.join(home, 'backup.mjs'))) fail(`No backup job in ${home}. Run npm run live:deploy first.`);
    try {
        run(process.execPath, [path.join(home, 'backup.mjs'), '--force'], home);
    } catch {
        fail(`The backup finished with a failure. See ${path.join(home, 'logs', 'backup.log')}.`);
    }
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

/** True when `pid` is a running process whose command line contains `marker` (pids get reused). */
function isOurs(pid, marker) {
    if (!pid) return false;
    try {
        process.kill(pid, 0);
    } catch {
        return false;
    }
    if (process.platform !== 'win32') return true;
    try {
        const line = execFileSync(
            'powershell',
            ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").CommandLine`],
            { encoding: 'utf8' },
        );
        return line.includes(marker);
    } catch {
        return false;
    }
}

async function stopApp() {
    // Ending the task first means Task Scheduler sees a stop, not a failure to restart.
    if (taskExists()) {
        execFileSync('powershell', ['-NoProfile', '-Command', `Stop-ScheduledTask -TaskName '${TASK_NAME}'`], { stdio: 'ignore' });
    }
    // Only processes that are still ours: a stale pid file can name a pid Windows gave to another program.
    const pids = readPids();
    const ours = [
        [pids?.supervisor, 'live-run.mjs'],
        [pids?.api, 'dist/main.js'],
        [pids?.web, path.join('next', 'dist', 'bin', 'next')],
    ].filter(([pid, marker]) => isOurs(pid, marker));
    for (const [pid] of ours) {
        try {
            if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
            else process.kill(pid, 'SIGTERM');
        } catch {
            // Gone in the meantime.
        }
    }
    rmSync(pidFile, { force: true });
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        if (!(await answers(apiPort, '/api/health')) && !(await answers(webPort, '/manifest.webmanifest'))) return;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    fail(`Something still answers on port ${apiPort} or ${webPort} after stopping live. Find and stop it, then try again.`);
}

async function startApp() {
    if (!readName(currentFile) || !existsSync(path.join(home, 'live-run.mjs'))) fail(`No release in ${home}. Run npm run live:deploy first.`);
    if (isOurs(readPids()?.supervisor, 'live-run.mjs')) {
        console.log('Live is already running.');
        return;
    }
    if (taskExists()) {
        execFileSync('powershell', ['-NoProfile', '-Command', `Start-ScheduledTask -TaskName '${TASK_NAME}'`], { stdio: 'ignore' });
        return;
    }
    // No startup task registered yet: run the supervisor detached, so it outlives this command.
    const child = spawn(process.execPath, [path.join(home, 'live-run.mjs')], {
        cwd: home,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
    });
    child.unref();
}

async function answers(port, route) {
    try {
        return (await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(2_000) })).ok;
    } catch {
        return false;
    }
}

async function reportHealth(hint = '') {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
        // Through the frontend's proxy, so this checks both processes and the rewrite.
        if (await answers(webPort, '/api/health')) {
            console.log(`\nLive is up: http://127.0.0.1:${webPort} (release ${readName(currentFile)}; logs in ${path.join(home, 'logs')})\n`);
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    fail(`Live did not answer on http://127.0.0.1:${webPort}/api/health within 90 s. See ${path.join(home, 'logs')}. ${hint}`);
}

async function status() {
    const pids = readPids();
    const current = readName(currentFile);
    const release = current && existsSync(releaseDir(current))
        ? `${current}: ${execFileSync('git', ['-C', releaseDir(current), 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()}`
        : 'none';
    console.log(`Live home:      ${home}`);
    console.log(`Release:        ${release}`);
    console.log(`Previous:       ${readName(previousFile) ?? 'none'}`);
    console.log(`Startup task:   ${taskExists() ? `"${TASK_NAME}" registered` : 'not registered'}`);
    console.log(`Supervisor:     ${isOurs(pids?.supervisor, 'live-run.mjs') ? `running (pid ${pids.supervisor})` : 'not running'}`);
    console.log(`API ${apiPort}:       ${(await answers(apiPort, '/api/health')) ? 'healthy' : 'not answering'}`);
    console.log(`Frontend ${webPort}:  ${(await answers(webPort, '/api/health')) ? 'healthy (proxy to the API works)' : 'not answering'}`);
}
