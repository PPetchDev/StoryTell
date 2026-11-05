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
