import type { TestProject } from 'vitest/node';

import { runMigrations } from '../../src/store/db/run-migrations.js';
import { startDisposablePostgres } from './postgres.js';

export const TEMPLATE_DATABASE = 'storytell_template';

declare module 'vitest' {
    export interface ProvidedContext {
        /** Connection URL of the test server's `postgres` database, for admin commands. */
        postgresAdminUrl: string;
        /** A migrated, empty database that each test file copies (see test-app.ts). */
        templateDatabase: string;
    }
}

/**
 * Starts one throwaway PostgreSQL server for the whole run and migrates a template
 * database once. Each test file then gets a fresh copy of it, which takes milliseconds.
 */
export default async function setup(project: TestProject) {
    const postgres = await startDisposablePostgres();
    await postgres.createDatabase(TEMPLATE_DATABASE);
    await runMigrations(postgres.url(TEMPLATE_DATABASE));

    project.provide('postgresAdminUrl', postgres.url('postgres'));
    project.provide('templateDatabase', TEMPLATE_DATABASE);

    return () => postgres.stop();
}
