import { expect, test } from '@playwright/test';

import { startApi, stopApi } from './harness/api-server';

// .scratch/sign-in/spec.md: "e2e". The shared API restarts with a password for this file only.
const PASSWORD = 'lantern-keeper-1890';

test.beforeAll(async () => {
    await stopApi();
    await startApi({ LOGIN_PASSWORD: PASSWORD });
});

test.afterAll(async () => {
    // Back to the plain API for the files after this one.
    await stopApi();
    await startApi();
});

test('a signed-out page asks for the password, keeps the page, and Sign out asks again', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
    // Nothing of the app shows while signed out, the bottom nav neither.
    await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0);
    await expect(page.getByRole('navigation')).toHaveCount(0);

    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'That password is wrong.' })).toBeVisible();

    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    // The same page, now signed in.
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/\/settings$/);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
});

test('a session that is gone mid-use brings the sign-in screen back', async ({ page, context }) => {
    await page.goto('/');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Stories', level: 1 })).toBeVisible();

    await context.clearCookies();
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
});
