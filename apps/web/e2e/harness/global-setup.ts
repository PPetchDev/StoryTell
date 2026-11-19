import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startDisposablePostgres } from '../../../api/test/harness/postgres';
import { buildApi, migrate, runApi, writeState } from './api-server';
import { E2E_API_PORT } from './ports';

// A shard of scripts/e2e-shards.mjs keeps its results in its own folder.
const RESULTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', process.env.E2E_RESULTS_DIR ?? 'test-results');

/**
 * Brings up the same stack the API tests use, but as a real server: a throwaway PostgreSQL,
 * a temporary image folder, and the built API with the fake Model Gateway. Next.js (the
 * Playwright webServer) proxies /api to it.
 */
export default async function globalSetup() {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'storytell-e2e-'));
    process.env.E2E_STATE_FILE = path.join(tempDir, 'state.json');

    // scripts/e2e-shards.mjs builds the API once for all its shards; they only read the folder.
    if (process.env.E2E_API_PREBUILT !== '1') buildApi();
    const postgres = await startDisposablePostgres();
    await postgres.createDatabase('storytell_e2e');

    const env = {
        PORT: String(E2E_API_PORT),
        DATABASE_URL: postgres.url('storytell_e2e'),
        IMAGE_DIR: path.join(tempDir, 'images'),
        // No file there until a test writes one, so the backup banner stays hidden by default.
        BACKUP_STATUS_FILE: path.join(tempDir, 'backup-status.json'),
        MODEL_GATEWAY: 'fake',
        // A failed background call is retried once on its own; here at once, so tests script both tries.
        BACKGROUND_RETRY_MS: '0',
    };
    migrate(env);
    // Owned here, not by a test worker, so it lives through worker restarts (see runApi).
    const api = await runApi(env);
    writeState({ env, controlUrl: api.controlUrl });

    return async () => {
        await api.close();
        await postgres.stop();
        // Keep the API's output where the report lives, so a crash mid-run can be read.
        await mkdir(RESULTS_DIR, { recursive: true });
        await copyFile(path.join(tempDir, 'api.log'), path.join(RESULTS_DIR, 'api.log')).catch(() => {});
        await rm(tempDir, { recursive: true, force: true });
    };
}
