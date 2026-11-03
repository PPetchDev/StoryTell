import { expect, test } from '@playwright/test';

test('changing the play model shows a Drift warning before saving', async ({ page }) => {
    await page.goto('/settings');
    const playModel = page.getByLabel('Play model');
    await expect(playModel).toHaveValue('glm-5.3');
    await expect(page.getByText('Drift warning.')).toHaveCount(0);

    await playModel.selectOption('deepseek-v4-pro');

    // Next.js adds its own role="alert" route announcer, so filter on the text.
    await expect(page.getByRole('alert').filter({ hasText: 'Drift warning.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
});
