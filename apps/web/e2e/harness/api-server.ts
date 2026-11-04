import { execFileSync, execSync, spawn } from 'node:child_process';
import { openSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { E2E_API_PORT } from './ports';

export const API_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../api');
const HEALTH_URL = `http://127.0.0.1:${E2E_API_PORT}/api/health`;

/** What global setup hands to the test workers, through process.env. */
interface ApiServerState {
    env: Record<string, string>;
    pid: number;
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

export function buildApi(): void {
    // A shell resolves npm on Windows (npm.cmd), so pass the command as one string.
    execSync('npm run build', { cwd: API_DIR, stdio: 'inherit' });
}

export function migrate(env: Record<string, string>): void {
    execFileSync(process.execPath, ['dist/migrate.js'], {
        cwd: API_DIR,
        env: { ...process.env, ...env },
        stdio: 'inherit',
    });
}

/**
 * Starts the built API with the fake Model Gateway and waits until it answers. Its output
 * goes to `api.log` beside the state file, so a crash mid-run can be read afterwards.
 */
export async function spawnApi(env: Record<string, string>): Promise<number> {
    const log = openSync(path.join(path.dirname(stateFile()), 'api.log'), 'a');
    const child = spawn(process.execPath, ['dist/main.js'], {
        cwd: API_DIR,
        env: { ...process.env, ...env },
        stdio: ['ignore', log, log],
    });
    child.unref();
    await waitFor(isUp, 'the API to start');
    return child.pid!;
}

export async function killApi(pid: number): Promise<void> {
    try {
        process.kill(pid);
    } catch {
        // Already gone.
    }
    await waitFor(async () => !(await isUp()), 'the API to stop');
}

/** Stops the API mid-test, as if its process died. */
export async function stopApi(): Promise<void> {
    await killApi(readState().pid);
}

/** Starts the API again after stopApi(), against the same database and image folder. */
export async function startApi(): Promise<void> {
    if (await isUp()) return;
    const state = readState();
    writeState({ ...state, pid: await spawnApi(state.env) });
}

export function currentApiPid(): number {
    return readState().pid;
}
