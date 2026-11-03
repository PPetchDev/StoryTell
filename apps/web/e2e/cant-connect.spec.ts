import { expect, Page, test } from '@playwright/test';

import { startApi, stopApi } from './harness/api-server';

async function expectCantConnectScreen(page: Page) {
    await expect(page.getByRole('heading', { name: "Can't connect" })).toBeVisible();
    await expect(page.getByText('this device is connected to the internet')).toBeVisible();
    await expect(page.getByText('the PC is on')).toBeVisible();
    await expect(page.getByText('Tailscale is connected on this device')).toBeVisible();
}

test.afterEach(async ({ context }) => {
    // Leave the stack up for the next test even if this one failed midway.
    await context.setOffline(false);
    await startApi();
});

test('stopping the API shows the can\'t-connect screen, and Retry recovers once it is back', async ({
    page,
}) => {
    await page.goto('/');
    await expect(page.getByText('No Stories yet.')).toBeVisible();

    await stopApi();
    await page.reload();
    await expectCantConnectScreen(page);

    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText("Still can't connect.")).toBeVisible();

    await startApi();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('heading', { name: 'Stories' })).toBeVisible();
    await expect(page.getByText('No Stories yet.')).toBeVisible();
});

test('the service worker shows the same screen when the app itself can\'t be reached', async ({
    page,
    context,
}) => {
    await page.goto('/');
    await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
    });
    // The worker claims the page on activation; reload so this page is controlled by it.
    await page.reload();
    await expect(page.getByText('No Stories yet.')).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expectCantConnectScreen(page);

    await context.setOffline(false);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('No Stories yet.')).toBeVisible();
});
