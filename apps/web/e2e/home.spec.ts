import { expect, test } from '@playwright/test';

test('the home screen lists no Stories on a fresh install', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Stories' })).toBeVisible();
    await expect(page.getByText('No Stories yet.')).toBeVisible();
});
