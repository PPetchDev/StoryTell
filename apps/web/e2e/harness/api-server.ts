import { execFileSync, execSync, spawn } from 'node:child_process';
import { openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { E2E_API_PORT } from './ports';

export const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../api');
const HEALTH_URL = `http://127.0.0.1:${E2E_API_PORT}/api/health`;

/** What global setup hands to the test workers, through process.env. */
interface ApiServerState {
    env: Record<string, string>;
    /** Where global setup takes the tests' requests to stop and start the API (see runApi). */
    controlUrl: string;
}

function stateFile(): string {
    const file = process.env.E2E_STATE_FILE;
    if (!file) throw new Error('E2E_STATE_FILE is not set. Run through `npm run test:e2e`.');
    return file;
}

function readState(): ApiServerState {
    return JSON.parse(readFileSync(stateFile(), 'utf8')) as ApiServerState;
}

export function writeState(state: ApiServerState): void {
    writeFileSync(stateFile(), JSON.stringify(state));
}

/** Where the running API reads the backup job's status (the job itself doesn't run in E2E). */
export function backupStatusFile(): string {
    return readState().env.BACKUP_STATUS_FILE;
}

async function isUp(): Promise<boolean> {
    try {
        return (await fetch(HEALTH_URL)).ok;
    } catch {
        return false;
    }
}

async function waitFor(condition: () => Promise<boolean>, what: string): Promise<void> {
    const deadline = Date.now() + 30_000;
    while (!(await condition())) {
        if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
}

/**
 * The E2E API's own build folder. `npm run dev` serves the API from `dist` and `nest build`
 * empties that folder first, so building there took the dev API down mid-run ("Cannot find
 * module dist/main"). E2E builds here instead and never touches `dist`.
 */
export const API_BUILD_DIR = 'dist-e2e';

export function buildApi(): void {
    rmSync(path.join(API_DIR, API_BUILD_DIR), { recursive: true, force: true });
    // The same compile `nest build` runs (tsc on tsconfig.build.json), into the E2E folder, and
    // in full every time: an incremental build record says "nothing changed" once the folder is
    // emptied, so nothing was emitted on a second run, and it is the record `npm run dev` uses.
    // A shell resolves npx on Windows (npx.cmd), so pass the command as one string.
    execSync(`npx tsc -p tsconfig.build.json --outDir ${API_BUILD_DIR} --incremental false`, {
        cwd: API_DIR,
        stdio: 'inherit',
    });
}

export function migrate(env: Record<string, string>): void {
    execFileSync(process.execPath, [`${API_BUILD_DIR}/migrate.js`], {
        cwd: API_DIR,
        env: { ...process.env, ...env },
        stdio: 'inherit',
    });
}

/**
 * Starts the built API with the fake Model Gateway and waits until it answers. Its output
 * goes to `api.log` beside the state file, so a crash mid-run can be read afterwards.
 */
async function spawnApi(env: Record<string, string>): Promise<number> {
    const log = openSync(path.join(path.dirname(stateFile()), 'api.log'), 'a');
    const child = spawn(process.execPath, [`${API_BUILD_DIR}/main.js`], {
        cwd: API_DIR,
        env: { ...process.env, ...env },
        stdio: ['ignore', log, log],
    });
    child.unref();
    await waitFor(isUp, 'the API to start');
    return child.pid!;
}

async function killApi(pid: number): Promise<void> {
    try {
        process.kill(pid);
    } catch {
        // Already gone.
    }
    await waitFor(async () => !(await isUp()), 'the API to stop');
}

/** The API that global setup keeps for the whole run. */
export interface RunningApi {
    /** Where tests ask for the API to stop and start (stopApi, startApi). */
    controlUrl: string;
    /** Stops the API for good, at the end of the run. */
    close(): Promise<void>;
}

/**
 * Starts the API from global setup and keeps it for the whole run. Tests that stop and start
 * it (cant-connect.spec) ask for that over a local port rather than spawning it themselves:
 * Playwright replaces the worker after a failed test, and an API a worker had started died
 * with that worker, so one failure turned every later test into ECONNREFUSED. Global setup
 * runs in the Playwright runner, which outlives every worker.
 */
export async function runApi(env: Record<string, string>): Promise<RunningApi> {
    let pid: number | undefined = await spawnApi(env);
    // `/start` may carry extra environment as a JSON body (the sign-in spec starts it with a password).
    const actions: Record<string, (extra: Record<string, string>) => Promise<void>> = {
        '/stop': async () => {
            if (pid !== undefined) await killApi(pid);
            pid = undefined;
        },
        '/start': async (extra) => {
            if (await isUp()) return;
            // It died on its own: make sure that process is gone before the port is taken again.
            if (pid !== undefined) await killApi(pid);
            pid = await spawnApi({ ...env, ...extra });
        },
    };
    // One request at a time, in order, so a stop and a start never overlap.
    let queue = Promise.resolve();
    const server = createServer((request, response) => {
        const action = request.method === 'POST' ? actions[request.url ?? ''] : undefined;
        if (!action) {
            response.writeHead(404).end();
            return;
        }
        let body = '';
        request.on('data', (chunk: Buffer) => (body += chunk.toString()));
        const extra = new Promise<Record<string, string>>((resolve) => request.on('end', () => resolve(body ? JSON.parse(body) : {})));
        queue = queue.then(async () => action(await extra)).then(
            () => void response.writeHead(204).end(),
            (error: unknown) => void response.writeHead(500).end(String(error)),
        );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    // Never the thing that keeps the runner alive; teardown closes it as well.
    server.unref();
    return {
        controlUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        async close() {
            server.close();
            await queue;
            if (pid !== undefined) await killApi(pid);
        },
    };
}

async function askGlobalSetup(action: 'stop' | 'start', extra: Record<string, string> = {}): Promise<void> {
    const response = await fetch(`${readState().controlUrl}/${action}`, { method: 'POST', body: JSON.stringify(extra) });
    if (!response.ok) throw new Error(`Global setup could not ${action} the API: ${await response.text()}`);
}

/** Stops the API mid-test, as if its process died. */
export async function stopApi(): Promise<void> {
    await askGlobalSetup('stop');
}

/**
 * Starts the API again after stopApi(), against the same database and image folder. `extra` is
 * environment for this start only, e.g. `LOGIN_PASSWORD`; the next plain start drops it.
 */
export async function startApi(extra: Record<string, string> = {}): Promise<void> {
    await askGlobalSetup('start', extra);
}
