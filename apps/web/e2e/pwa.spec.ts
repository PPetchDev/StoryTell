import { expect, test } from '@playwright/test';

// localhost is a secure context, so Chrome applies the same installability rules it applies
// over HTTPS on the tailnet.
test('passes Chrome\'s PWA installability checks', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
    });

    const cdp = await page.context().newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    const { url, errors } = await cdp.send('Page.getAppManifest');

    expect(url).toMatch(/\/manifest\.webmanifest$/);
    expect(errors).toEqual([]);
    expect(installabilityErrors).toEqual([]);
});
