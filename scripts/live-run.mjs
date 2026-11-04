// The live supervisor. Each deploy copies this file to <LIVE_HOME>/live-run.mjs, where the
// "Storytell Live" startup task runs it. It runs the release named in <LIVE_HOME>/current: the
// built API, then (once the API answers) `next start` on loopback for Tailscale serve to front,
// and restarts either one if it dies. It never builds or migrates: that is the deploy's job.
import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const home = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.join(home, 'logs');
const pidFile = path.join(home, 'run', 'live.pid');
mkdirSync(logDir, { recursive: true });
mkdirSync(path.dirname(pidFile), { recursive: true });

const log = createWriteStream(path.join(logDir, 'live.log'), { flags: 'a' });
function say(line) {
    log.write(`${new Date().toISOString()} ${line}\n`);
}
function quit(line) {
    say(line);
    log.end(() => process.exit(1));
}

/** True when `pid` is a running process whose command line contains `marker` (pids get reused). */
function isOurs(pid, marker) {
    if (!pid || pid === process.pid) return false;
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

// The task fires at startup and every few minutes; only one supervisor may run.
let previousPids = null;
try {
    previousPids = JSON.parse(readFileSync(pidFile, 'utf8'));
} catch {
    // No pid file, or a torn one: nobody to defer to.
}
if (isOurs(previousPids?.supervisor, 'live-run.mjs')) {
    log.end(() => process.exit(0));
} else {
    await supervise();
}

async function supervise() {
    // The deploy copies .env.live to live.env. The file wins over whatever environment the task
    // or a shell passed in, so live always runs on the settings the deploy checked and migrated.
    const envPath = path.join(home, 'live.env');
    if (!existsSync(envPath)) return quit(`no ${envPath}; run npm run live:deploy`);
    const env = { ...process.env, ...parseEnv(readFileSync(envPath, 'utf8')), NODE_ENV: 'production' };
    delete env.PORT;
    delete env.NEXT_DIST_DIR;

    const release = existsSync(path.join(home, 'current')) ? readFileSync(path.join(home, 'current'), 'utf8').trim() : '';
    const app = path.join(home, 'releases', release);
    if (!release || !existsSync(path.join(app, 'apps', 'api', 'dist', 'main.js'))) {
        return quit(`no built release at ${app}; run npm run live:deploy`);
    }
    if (!env.DATABASE_URL) return quit(`DATABASE_URL is not set in ${envPath}`);

    const webPort = Number(env.LIVE_WEB_PORT ?? 3000);
    const apiPort = Number(env.LIVE_API_PORT ?? 4000);
    const imageDir = path.resolve(env.LIVE_IMAGE_DIR ?? path.join(home, 'images'));
    mkdirSync(imageDir, { recursive: true });

    const services = {
        api: {
            cwd: path.join(app, 'apps', 'api'),
            args: ['dist/main.js'],
            // The fake gateway carries test-only control routes. Live always talks to the providers.
            env: { ...env, PORT: String(apiPort), IMAGE_DIR: imageDir, MODEL_GATEWAY: 'real' },
        },
        web: {
            cwd: path.join(app, 'apps', 'web'),
            // Loopback only: Tailscale serve proxies to 127.0.0.1, and nothing else should reach it.
            args: [path.join(app, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(webPort), '-H', '127.0.0.1'],
            env: { ...env, API_ORIGIN: `http://127.0.0.1:${apiPort}` },
        },
    };

    const running = {};
    let stopping = false;

    function writePids() {
        writeFileSync(
            pidFile,
            JSON.stringify({ supervisor: process.pid, api: running.api?.pid ?? null, web: running.web?.pid ?? null, release }),
        );
    }

    function start(name, attempt = 0) {
        const service = services[name];
        const out = createWriteStream(path.join(logDir, `${name}.log`), { flags: 'a' });
        out.write(`\n--- ${new Date().toISOString()} starting ${name} (${release}) ---\n`);
        const child = spawn(process.execPath, service.args, { cwd: service.cwd, env: service.env, windowsHide: true });
        child.stdout.pipe(out);
        child.stderr.pipe(out);
        const startedAt = Date.now();
        running[name] = child;
        writePids();
        say(`${name} started (pid ${child.pid})`);
        let restarted = false;
        const restart = (why) => {
            if (stopping || restarted) return;
            restarted = true;
            // A crash right after starting backs off longer each time; a long run resets the count.
            const next = Date.now() - startedAt > 5 * 60_000 ? 0 : attempt + 1;
            const delay = Math.min(60_000, 5_000 * 2 ** Math.max(0, next - 1));
            say(`${name} ${why}; restarting in ${delay / 1000} s`);
            setTimeout(() => start(name, next), delay);
        };
        child.on('error', (error) => restart(`failed to start (${error.message})`));
        child.on('exit', (code, signal) => restart(`exited (code ${code}, signal ${signal})`));
    }

    async function apiAnswers() {
        try {
            return (await fetch(`http://127.0.0.1:${apiPort}/api/health`, { signal: AbortSignal.timeout(2_000) })).ok;
        } catch {
            return false;
        }
    }

    function stop() {
        if (stopping) return;
        stopping = true;
        say('stopping');
        for (const child of Object.values(running)) {
            if (child.exitCode !== null) continue;
            try {
                if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
                else child.kill('SIGTERM');
            } catch {
                // Already gone.
            }
        }
        rmSync(pidFile, { force: true });
        log.end(() => process.exit(0));
    }

    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);

    say(`supervisor ${process.pid} up: release ${release}, web ${webPort}, API ${apiPort}, images ${imageDir}`);
    start('api');
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline && !(await apiAnswers())) await new Promise((resolve) => setTimeout(resolve, 500));
    if (!(await apiAnswers())) say('API health check still failing after 60 s; starting the frontend anyway');
    start('web');
}
