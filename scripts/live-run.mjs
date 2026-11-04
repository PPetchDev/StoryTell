// The live supervisor. The "Storytell Live" startup task runs this from <LIVE_HOME>/app, the
// release that `npm run live:deploy` built. It starts the built API, waits for its health check,
// then `next start` on loopback (Tailscale serve fronts it), and restarts either one if it dies.
// It never builds or migrates: that is the deploy step's job.
import { execSync, spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = path.dirname(app);

// The deploy step copies .env.live here. Real environment variables win over the file.
process.loadEnvFile(path.join(home, 'live.env'));

const webPort = Number(process.env.LIVE_WEB_PORT ?? 3000);
const apiPort = Number(process.env.LIVE_API_PORT ?? 4000);
const imageDir = path.resolve(process.env.LIVE_IMAGE_DIR ?? path.join(home, 'images'));
const logDir = path.join(home, 'logs');
const pidFile = path.join(home, 'run', 'live.pid');
if (!process.env.DATABASE_URL) throw new Error(`DATABASE_URL is not set in ${path.join(home, 'live.env')}`);

mkdirSync(imageDir, { recursive: true });
mkdirSync(logDir, { recursive: true });
mkdirSync(path.dirname(pidFile), { recursive: true });

const log = createWriteStream(path.join(logDir, 'live.log'), { flags: 'a' });
function say(line) {
    log.write(`${new Date().toISOString()} ${line}\n`);
}

const base = { ...process.env, NODE_ENV: 'production' };
delete base.PORT;
const services = {
    api: {
        cwd: path.join(app, 'apps', 'api'),
        args: ['dist/main.js'],
        env: {
            ...base,
            PORT: String(apiPort),
            IMAGE_DIR: imageDir,
            // The fake gateway carries test-only control routes. Live always talks to the providers.
            MODEL_GATEWAY: 'real',
        },
    },
    web: {
        cwd: path.join(app, 'apps', 'web'),
        // Loopback only: Tailscale serve proxies to 127.0.0.1, and nothing else should reach it.
        args: [path.join(app, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(webPort), '-H', '127.0.0.1'],
        env: { ...base, API_ORIGIN: `http://127.0.0.1:${apiPort}` },
    },
};

const running = {};
let stopping = false;

function writePids() {
    writeFileSync(
        pidFile,
        JSON.stringify({ supervisor: process.pid, api: running.api?.pid ?? null, web: running.web?.pid ?? null }),
    );
}

function start(name, attempt = 0) {
    const service = services[name];
    const out = createWriteStream(path.join(logDir, `${name}.log`), { flags: 'a' });
    out.write(`\n--- ${new Date().toISOString()} starting ${name} ---\n`);
    const child = spawn(process.execPath, service.args, { cwd: service.cwd, env: service.env, windowsHide: true });
    child.stdout.pipe(out);
    child.stderr.pipe(out);
    const startedAt = Date.now();
    running[name] = child;
    writePids();
    say(`${name} started (pid ${child.pid})`);
    child.on('exit', (code, signal) => {
        if (stopping) return;
        // A crash right after starting backs off longer each time; a long run resets the count.
        const next = Date.now() - startedAt > 5 * 60_000 ? 0 : attempt + 1;
        const delay = Math.min(60_000, 5_000 * 2 ** Math.max(0, next - 1));
        say(`${name} exited (code ${code}, signal ${signal}); restarting in ${delay / 1000} s`);
        setTimeout(() => start(name, next), delay);
    });
}

async function waitForApi() {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        try {
            if ((await fetch(`http://127.0.0.1:${apiPort}/api/health`)).ok) return true;
        } catch {
            // Not listening yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
}

function stop() {
    if (stopping) return;
    stopping = true;
    say('stopping');
    for (const child of Object.values(running)) {
        if (child.exitCode !== null) continue;
        try {
            if (process.platform === 'win32') execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
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

say(`supervisor ${process.pid} up: web ${webPort}, API ${apiPort}, images ${imageDir}`);
start('api');
if (!(await waitForApi())) say('API health check still failing after 60 s; starting the frontend anyway');
start('web');
