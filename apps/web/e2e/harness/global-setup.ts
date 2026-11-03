import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { startDisposablePostgres } from '../../../api/test/harness/postgres';
import { buildApi, currentApiPid, killApi, migrate, spawnApi, writeState } from './api-server';
import { E2E_API_PORT } from './ports';

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
        MODEL_GATEWAY: 'fake',
    };
    migrate(env);
    writeState({ env, pid: await spawnApi(env) });

    return async () => {
        await killApi(currentApiPid());
        await postgres.stop();
        await rm(tempDir, { recursive: true, force: true });
    };
}
