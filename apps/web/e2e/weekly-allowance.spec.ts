import { expect, test } from '@playwright/test';

// .scratch/nanogpt-provider/spec.md: NanoGPT's Weekly allowance on the Usage page, and the banner
// while it is used up and text runs on OpenRouter, which costs credit.
const RESET_AT = '2026-11-30T00:00:00.000Z';

const pool = (over: Record<string, unknown>) => ({
    spentUsd: 0.5,
    calls: 41,
    byKind: [{ kind: 'turn', spentUsd: 0.5, calls: 30 }],
    remainingUsd: null,
    capUsd: 8,
    lowCreditPercent: 20,
    lowCredit: false,
    host: 'nanogpt',
    cache: null,
    weeklyAllowance: null,
    ...over,
});

const usage = (text: ReturnType<typeof pool>) => ({
    month: '2026-11',
    monthlyCap: null,
    pools: { text, image: { ...pool({ remainingUsd: 6, host: null }) } },
});

test('the Usage page says how much of the Weekly allowance is left, while NanoGPT serves', async ({ page }) => {
    const allowance = { host: 'nanogpt', usedTokens: 18_800_000, limitTokens: 60_000_000, resetAt: RESET_AT, usedUp: false };
    await page.route('**/api/usage', (route) => route.fulfill({ json: usage(pool({ weeklyAllowance: allowance })) }));
    await page.goto('/usage');

    const text = page.getByRole('region', { name: /^Text/ });
    await expect(text.getByRole('heading', { name: 'Text (NanoGPT)' })).toBeVisible();
    await expect(text.getByRole('definition').filter({ hasText: 'subscription' })).toContainText("Text is on NanoGPT's subscription, which charges nothing per call.");
    await expect(text.getByRole('term').filter({ hasText: 'Weekly allowance' })).toBeVisible();
    await expect(text.getByRole('definition').filter({ hasText: 'input tokens left this week' })).toContainText('41.2M of 60M input tokens left this week');
    // No banner while the allowance lasts.
    await page.goto('/');
    await expect(page.getByText(/Weekly allowance is used up/)).toHaveCount(0);
});

test('once the Weekly allowance is used up, the Usage page and a banner say text runs on OpenRouter', async ({ page }) => {
    const allowance = { host: 'nanogpt', usedTokens: 60_000_000, limitTokens: 60_000_000, resetAt: RESET_AT, usedUp: true };
    await page.route('**/api/usage', (route) => route.fulfill({ json: usage(pool({ host: 'openrouter', remainingUsd: 6, weeklyAllowance: allowance })) }));
    await page.goto('/usage');

    const text = page.getByRole('region', { name: /^Text/ });
    await expect(text.getByRole('heading', { name: 'Text (OpenRouter)' })).toBeVisible();
    await expect(text.getByText(/^Used up: text runs on OpenRouter until \w+ \d\d:\d\d$/)).toBeVisible();

    await page.goto('/');
    await expect(page.getByText(/^NanoGPT's Weekly allowance is used up\. Text runs on OpenRouter, which costs credit, until it resets on \w+ \d\d:\d\d\.$/)).toBeVisible();
});
