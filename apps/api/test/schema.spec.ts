import pg from 'pg';

import { startTestApp, TestApp } from './harness/test-app.js';

// The tailnet is the only lock (spec: "No auth layer"). This guards the migrated schema
// against an auth table creeping in.
describe('Database schema', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    it('has no user, account or session tables', async () => {
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        const { rows } = await client.query<{ table_name: string }>(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
        );
        await client.end();

        const tables = rows.map((row) => row.table_name);
        expect(tables).toContain('story');
        expect(tables.filter((name) => /user|account|session|login/i.test(name))).toEqual([]);
    });
});
