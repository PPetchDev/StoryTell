import { rmSync, writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { backupStatusFile } from './harness/api-server';

test.afterEach(() => {
    rmSync(backupStatusFile(), { force: true });
});

test('a failed backup target shows a banner on Usage and Settings, and play is not blocked', async ({ page }) => {
    // What scripts/backup.mjs writes when the Drive copy fails but the disk copy is saved.
    writeFileSync(
        backupStatusFile(),
        JSON.stringify({
            attemptedAt: new Date().toISOString(),
            backup: 'storytell-20261104-141500',
            targets: {
                disk: { ok: true, at: new Date().toISOString(), error: null },
                drive: { ok: false, at: new Date().toISOString(), error: "didn't find section in config file" },
            },
        }),
    );

    for (const route of ['/usage', '/settings']) {
        await page.goto(route);
        const banner = page.getByRole('status', { name: 'Backup' });
        await expect(banner).toContainText("The last backup");
        await expect(banner).toContainText('Second disk: saved');
        await expect(banner).toContainText("Google Drive: failed: didn't find section in config file");
    }

    // The Stories list (and so play) carries on, with no backup banner there.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Stories' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Backup' })).toHaveCount(0);
});

test('no banner when the last backup worked, or before the first one', async ({ page }) => {
    await page.goto('/usage');
    await expect(page.getByRole('heading', { name: 'Usage' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Backup' })).toHaveCount(0);

    writeFileSync(
        backupStatusFile(),
        JSON.stringify({
            attemptedAt: new Date().toISOString(),
            backup: 'storytell-20261104-141500',
            targets: { disk: { ok: true, at: new Date().toISOString(), error: null } },
        }),
    );
    // Wait for the banner's own fetch to land before asserting it stays away.
    const answered = page.waitForResponse((response) => response.url().endsWith('/api/backup'));
    await page.goto('/settings');
    await answered;
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Backup' })).toHaveCount(0);
});
