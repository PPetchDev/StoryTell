import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startDisposablePostgres } from '../../../api/test/harness/postgres';
import { buildApi, currentApiPid, killApi, migrate, spawnApi, writeState } from './api-server';
import { E2E_API_PORT } from './ports';

const RESULTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-results');

/**
 * Brings up the same stack the API tests use, but as a real server: a throwaway PostgreSQL,
 * a temporary image folder, and the built API with the fake Model Gateway. Next.js (the
 * Playwright webServer) proxies /api to it.
 */
export default async function globalSetup() {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'storytell-e2e-'));
    process.env.E2E_STATE_FILE = path.join(tempDir, 'state.json');

    buildApi();
    const postgres = await startDisposablePostgres();
    await postgres.createDatabase('storytell_e2e');

    const env = {
        PORT: String(E2E_API_PORT),
        DATABASE_URL: postgres.url('storytell_e2e'),
        IMAGE_DIR: path.join(tempDir, 'images'),
        // No file there until a test writes one, so the backup banner stays hidden by default.
        BACKUP_STATUS_FILE: path.join(tempDir, 'backup-status.json'),
        MODEL_GATEWAY: 'fake',
    };
    migrate(env);
    writeState({ env, pid: await spawnApi(env) });

    return async () => {
        await killApi(currentApiPid());
        await postgres.stop();
        // Keep the API's output where the report lives, so a crash mid-run can be read.
        await mkdir(RESULTS_DIR, { recursive: true });
        await copyFile(path.join(tempDir, 'api.log'), path.join(RESULTS_DIR, 'api.log')).catch(() => {});
        await rm(tempDir, { recursive: true, force: true });
    };
}
