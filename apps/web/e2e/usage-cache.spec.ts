import { expect, test } from '@playwright/test';

// .scratch/prompt-cache/spec.md: the Usage page says how much of the month's text prompts the host read from its cache.
const pool = (cache: { promptTokens: number; cachedTokens: number } | null) => ({
    spentUsd: 1.234,
    calls: 41,
    byKind: [{ kind: 'turn', spentUsd: 1.1, calls: 30 }],
    remainingUsd: 6,
    capUsd: 8,
    lowCreditPercent: 20,
    lowCredit: false,
    host: 'openrouter',
    cache,
});

const usage = (text: ReturnType<typeof pool>) => ({
    month: '2026-11',
    monthlyCap: null,
    pools: { text, image: { ...pool(null), host: null } },
});

test('the text pool shows the share of its prompt tokens read from the cache', async ({ page }) => {
    await page.route('**/api/usage', (route) => route.fulfill({ json: usage(pool({ promptTokens: 1_200_000, cachedTokens: 744_000 })) }));
    await page.goto('/usage');

    const text = page.getByRole('region', { name: /^Text/ });
    await expect(text.getByRole('term').filter({ hasText: 'Read from cache' })).toBeVisible();
    await expect(text.getByRole('definition').filter({ hasText: '62% of prompt tokens' })).toContainText('744K of 1.2M');
    // Images report no cache: no line there.
    await expect(page.getByRole('region', { name: /^Images/ }).getByText('Read from cache')).toHaveCount(0);
});

test('no cache line while no call reported one', async ({ page }) => {
    await page.route('**/api/usage', (route) => route.fulfill({ json: usage(pool(null)) }));
    await page.goto('/usage');

    await expect(page.getByRole('region', { name: /^Text/ }).getByText('Spent this month')).toBeVisible();
    await expect(page.getByText('Read from cache')).toHaveCount(0);
});
