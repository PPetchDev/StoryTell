import { expect, test } from '@playwright/test';

test('changing the play model shows a Drift warning and saves it at once', async ({ page, request }) => {
    await page.goto('/settings');
    const playModel = page.getByLabel('Play model');
    await expect(playModel).toHaveValue('glm-5.3');
    await expect(page.getByText('Drift warning.')).toHaveCount(0);

    try {
        await playModel.selectOption('deepseek-v4-pro');

        // Next.js adds its own role="alert" route announcer, so filter on the text.
        await expect(page.getByRole('alert').filter({ hasText: 'Drift warning.' })).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: /Sav/ })).toHaveText('Saved');
        await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
        expect((await (await request.get('/api/settings')).json()).settings.playModel).toBe('deepseek-v4-pro');

        // Back to the model the page opened with: no Drift risk left to warn about.
        await playModel.selectOption('glm-5.3');
        await expect(page.getByText('Drift warning.')).toHaveCount(0);
    } finally {
        // Leaves the shared e2e database as it was found.
        await request.put('/api/settings', { data: { playModel: 'glm-5.3' } });
    }
});
