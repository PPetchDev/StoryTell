import { expect, test } from '@playwright/test';

// Used on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('changing the play model shows a Drift warning and saves it at once', async ({ page, request }) => {
    await page.goto('/settings');
    const playModel = page.getByLabel('Play model');
    await expect(playModel).toHaveValue('glm-5.3');
    await expect(page.getByText('Drift warning.')).toHaveCount(0);

    try {
        await playModel.selectOption('deepseek-v4-pro');

        // Next.js adds its own role="alert" route announcer, so filter on the text.
        await expect(page.getByRole('alert').filter({ hasText: 'Drift warning.' })).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: /Sav|save/ })).toHaveText('Saved');
        await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);

        // Kept after a reload; the page now opens on that model, so there is nothing to warn about.
        await page.reload();
        await expect(page.getByLabel('Play model')).toHaveValue('deepseek-v4-pro');
        await expect(page.getByText('Drift warning.')).toHaveCount(0);
    } finally {
        // Leaves the shared e2e database as it was found.
        await request.put('/api/settings', { data: { playModel: 'glm-5.3' } });
    }
});

test('Snapshot size: 2K only for a model drawn at 2K, each size with its price', async ({ page, request }) => {
    await page.goto('/settings');
    const model = page.getByLabel('Snapshot model');
    const size = page.getByLabel('Snapshot size');
    await expect(model).toHaveValue('seedream-v4-edit');
    await expect(size).toHaveValue('1K');
    // Seedream V4.5 edit is drawn at 1K only.
    await expect(size.locator('option')).toHaveText(['1K · $0.05']);

    try {
        await model.selectOption('seedream-v5-pro-edit');
        await expect(size.locator('option')).toHaveText(['1K · $0.06', '2K · $0.11']);
        await size.selectOption('2K');
        await expect(page.getByRole('status').filter({ hasText: /Sav|save/ })).toHaveText('Saved');

        await page.reload();
        await expect(page.getByLabel('Snapshot model')).toHaveValue('seedream-v5-pro-edit');
        await expect(page.getByLabel('Snapshot size')).toHaveValue('2K');

        // A model without 2K goes back to 1K, here and in what is saved.
        await page.getByLabel('Snapshot model').selectOption('qwen-edit-uncensored');
        await expect(page.getByLabel('Snapshot size')).toHaveValue('1K');
        await expect(page.getByLabel('Snapshot size').locator('option')).toHaveText(['1K · $0.04']);
        await expect(page.getByRole('status').filter({ hasText: /Sav|save/ })).toHaveText('Saved');
        const saved = await (await request.get('/api/settings')).json();
        expect(saved.settings).toMatchObject({ imageModel: 'qwen-edit-uncensored', snapshotSize: '1K' });
    } finally {
        await request.put('/api/settings', { data: { imageModel: 'seedream-v4-edit', snapshotSize: '1K' } });
    }
});
