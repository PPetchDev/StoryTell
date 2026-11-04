import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { startTestApp, TestApp } from './harness/test-app.js';

describe('Backup status', () => {
    let dir: string;
    // Recent times: a run older than three days counts as stopped.
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

    beforeAll(async () => {
        dir = await mkdtemp(path.join(os.tmpdir(), 'storytell-backup-status-'));
    });

    afterAll(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    async function withApp(statusFile: string | undefined, check: (t: TestApp) => Promise<void>) {
        const t = await startTestApp({ backupStatusFile: statusFile });
        try {
            await check(t);
        } finally {
            await t.close();
        }
    }

    it('reports nothing to show where no backup job runs (dev, tests)', async () => {
        await withApp(undefined, async (t) => {
            const { body } = await t.http.get('/api/backup').expect(200);
            expect(body).toEqual({ configured: false, attemptedAt: null, backup: null, targets: [], error: null, failed: false });
        });
    });

    it('reports no failure before the first run', async () => {
        await withApp(path.join(dir, 'not-written-yet.json'), async (t) => {
            const { body } = await t.http.get('/api/backup').expect(200);
            expect(body).toMatchObject({ configured: true, attemptedAt: null, targets: [], failed: false });
        });
    });

    it('reports a failed target while the other one completed', async () => {
        const [started, diskAt, driveAt] = [minutesAgo(10), minutesAgo(9), minutesAgo(8)];
        const file = path.join(dir, 'one-failed.json');
        await writeFile(
            file,
            JSON.stringify({
                attemptedAt: started,
                backup: 'storytell-20261104-141500',
                targets: {
                    disk: { ok: true, at: diskAt, error: null },
                    drive: { ok: false, at: driveAt, error: 'rclone: didn\'t find section in config file' },
                },
            }),
        );
        await withApp(file, async (t) => {
            const { body } = await t.http.get('/api/backup').expect(200);
            expect(body).toEqual({
                configured: true,
                attemptedAt: started,
                backup: 'storytell-20261104-141500',
                targets: [
                    { target: 'disk', ok: true, at: diskAt, error: null },
                    { target: 'drive', ok: false, at: driveAt, error: "rclone: didn't find section in config file" },
                ],
                error: null,
                failed: true,
            });
        });
    });

    it('reports a clean run as not failed', async () => {
        const [started, diskAt] = [minutesAgo(10), minutesAgo(9)];
        const file = path.join(dir, 'clean.json');
        await writeFile(
            file,
            JSON.stringify({
                attemptedAt: started,
                backup: 'storytell-20261104-141500',
                targets: { disk: { ok: true, at: diskAt, error: null } },
            }),
        );
        await withApp(file, async (t) => {
            const { body } = await t.http.get('/api/backup').expect(200);
            expect(body).toMatchObject({ configured: true, failed: false, targets: [{ target: 'disk', ok: true }] });
        });
    });

    it('reports a clean run more than three days old as stopped', async () => {
        const started = minutesAgo(3 * 24 * 60 + 5);
        const file = path.join(dir, 'stale.json');
        await writeFile(
            file,
            JSON.stringify({ attemptedAt: started, backup: 'storytell-20261101-090000', targets: { disk: { ok: true, at: started, error: null } } }),
        );
        await withApp(file, async (t) => {
            const { body } = await t.http.get('/api/backup').expect(200);
            expect(body).toMatchObject({ configured: true, failed: true, error: `No backup has run since ${started}.` });
        });
    });

    it('reports an unreadable status file as a failure, never as an error response', async () => {
        const file = path.join(dir, 'torn.json');
        await writeFile(file, '{"attemptedAt": "2026-11');
        await withApp(file, async (t) => {
            const { body } = await t.http.get('/api/backup').expect(200);
            expect(body).toMatchObject({ configured: true, failed: true, error: 'The backup status file is not valid JSON.' });
        });
    });
});
