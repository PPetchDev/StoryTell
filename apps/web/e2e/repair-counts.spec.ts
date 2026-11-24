import { expect, test } from '@playwright/test';

// .scratch/reply-repair/spec.md, "6. Repair counts": the Usage page says what the app mended in replies this month.
const pool = () => ({
    spentUsd: 1.234,
    calls: 41,
    byKind: [{ kind: 'turn', spentUsd: 1.1, calls: 30 }],
    remainingUsd: 6,
    capUsd: 8,
    lowCreditPercent: 20,
    lowCredit: false,
    host: 'openrouter',
    cache: null,
});

const usage = (repairs: unknown) => ({
    month: '2026-11',
    monthlyCap: null,
    pools: { text: pool(), image: { ...pool(), host: null } },
    ...(repairs === undefined ? {} : { repairs }),
});

const REPAIRS = [
    { kind: 'line', model: 'deepseek-v4-pro', made: 12, refused: 3 },
    { kind: 'line', model: 'glm-5.3', made: 40, refused: 9 },
    { kind: 'pressing_note', model: 'glm-5.3', made: 7, refused: 0 },
    { kind: 'speech_lines', model: 'glm-5.3', made: 2, refused: 1 },
];

test('the Usage page counts the replies mended this month, by kind and play model', async ({ page }) => {
    await page.route('**/api/usage', (route) => route.fulfill({ json: usage(REPAIRS) }));
    await page.goto('/usage');

    const card = page.getByRole('region', { name: 'Replies mended' });
    const rows = card.getByRole('row');
    // A heading row and one a count.
    await expect(rows).toHaveCount(5);
    await expect(rows.nth(1)).toContainText('A line said again more plainly');
    await expect(rows.nth(1)).toContainText('deepseek-v4-pro');
    await expect(rows.nth(1).getByRole('cell')).toHaveText(['12', '3']);
    await expect(rows.nth(3)).toContainText('A Character told not to ask again');
    await expect(rows.nth(4)).toContainText('Quoted speech given back to its Character');
    await expect(rows.nth(4).getByRole('cell')).toHaveText(['2', '1']);
});

test('it says so in a line when no reply needed mending, and when the API sends no counts', async ({ page }) => {
    await page.route('**/api/usage', (route) => route.fulfill({ json: usage([]) }));
    await page.goto('/usage');
    const card = page.getByRole('region', { name: 'Replies mended' });
    await expect(card.getByText('No reply needed mending this month.')).toBeVisible();
    await expect(card.getByRole('table')).toHaveCount(0);

    await page.route('**/api/usage', (route) => route.fulfill({ json: usage(undefined) }));
    await page.reload();
    await expect(page.getByRole('region', { name: 'Replies mended' }).getByText('No reply needed mending this month.')).toBeVisible();
});

test('a Member sees the counts by kind alone, with no play model named', async ({ page }) => {
    await page.route('**/api/usage', (route) => route.fulfill({ json: usage([{ kind: 'line', model: null, made: 52, refused: 12 }]) }));
    await page.goto('/usage');

    const row = page.getByRole('region', { name: 'Replies mended' }).getByRole('row').nth(1);
    await expect(row.getByRole('rowheader')).toHaveText('A line said again more plainly');
    await expect(row.getByRole('cell')).toHaveText(['52', '12']);
});

for (const width of [360, 320]) {
    test(`the counts read on a phone ${width} pixels wide: nothing runs off the side`, async ({ page }) => {
        await page.setViewportSize({ width, height: 740 });
        await page.route('**/api/usage', (route) => route.fulfill({ json: usage(REPAIRS) }));
        await page.goto('/usage');

        const card = page.getByRole('region', { name: 'Replies mended' });
        await expect(card.getByRole('table')).toBeVisible();
        const box = (await card.getByRole('table').boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
}
