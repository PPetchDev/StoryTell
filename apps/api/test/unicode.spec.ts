import pg from 'pg';

import { runMigrations } from '../src/store/db/run-migrations.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// Thai, emoji and other text outside Windows-1252 must store and read back unchanged. A cluster
// created by initdb with the machine's locale on Windows is WIN1252 and refused it (seen 2026-11-05).
describe('Text in any script', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    it('stores a Thai title, a Japanese setting and an emoji, and reads them back unchanged', async () => {
        const title = 'เผ่าพระจันทร์เสี้ยว 🌙';
        const setting = '草原の市場。テントが並ぶ。 Ünïcödé “quotes” — and ไทย';
        const created = await t.http.post('/api/stories').send({ title }).expect(201);
        await t.http.patch(`/api/stories/${created.body.id}`).send({ setting }).expect(200);

        const { body } = await t.http.get(`/api/stories/${created.body.id}`).expect(200);
        expect(body.title).toBe(title);
        expect(body.setting).toBe(setting);
    });

    it('refuses to migrate a database that is not UTF-8, so a live database made with the wrong encoding is caught at deploy', async () => {
        const admin = new pg.Client({ connectionString: t.databaseUrl.replace(/\/[^/]+$/, '/postgres') });
        await admin.connect();
        await admin.query(`CREATE DATABASE "win1252_check" ENCODING 'WIN1252' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);
        try {
            await expect(runMigrations(t.databaseUrl.replace(/\/[^/]+$/, '/win1252_check'))).rejects.toThrow(
                /The database is WIN1252, not UTF8/,
            );
        } finally {
            await admin.query('DROP DATABASE "win1252_check"');
            await admin.end();
        }
    });
});
