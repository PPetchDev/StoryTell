import { expect, test } from '@playwright/test';

// Settings and Usage on a phone (docs/ui-audit-2026-11-13.md, M14-M15): Settings in groups that say
// whose a setting is, and Usage's figures with the card's width, by kind in a table, in words.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('Settings come in groups: this device, your writing, then the Owner\'s for everyone', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Credit' })).toBeVisible();
    // M14: a group heading over each set of cards, the cards' titles a level under it.
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['This device', 'Your writing', 'Owner · for everyone']);
    const titles = (group: string) => page.getByRole('region', { name: group }).getByRole('heading', { level: 3 });
    await expect(titles('This device')).toHaveText(['Theme', 'Text size']);
    await expect(titles('Your writing')).toHaveText(['Saved replies', 'Replace rules']);
    await expect(titles('Owner · for everyone')).toHaveText(['Models', 'People', 'Credit']);
    await expect(page.getByRole('region', { name: 'Owner · for everyone' })).toContainText('They apply to everyone who plays.');
});

test('Usage figures have the card\'s width, spend by kind is a table, and nothing is in code words', async ({ page }) => {
    const pool = (remainingUsd: number | null, byKind: object[]) => ({
        spentUsd: 1.234,
        calls: 41,
        byKind,
        remainingUsd,
        capUsd: 8,
        lowCreditPercent: 20,
        lowCredit: false,
    });
    await page.route('**/api/usage', (route) =>
        route.fulfill({
            json: {
                month: '2026-11',
                monthlyCap: null,
                pools: {
                    text: pool(6, [
                        { kind: 'turn', spentUsd: 1.1, calls: 30 },
                        { kind: 'judge', spentUsd: 0.12, calls: 10 },
                        { kind: 'memory_extraction', spentUsd: 0.014, calls: 1 },
                    ]),
                    image: pool(null, [{ kind: 'snapshot_image', spentUsd: 0.05, calls: 1 }]),
                },
            },
        }),
    );
    await page.goto('/usage');

    const text = page.getByRole('region', { name: /^Text/ });
    await expect(text).toBeVisible();
    // M15: under 480px each label sits over its value, which has the card's width.
    const card = (await text.boundingBox())!;
    const label = text.getByRole('term').filter({ hasText: 'Remaining credit' });
    const value = text.getByRole('definition').filter({ hasText: '$6.00 of $8.00' });
    const labelBox = (await label.boundingBox())!;
    const valueBox = (await value.boundingBox())!;
    expect(valueBox.y).toBeGreaterThanOrEqual(labelBox.y + labelBox.height - 1);
    expect(valueBox.width).toBeGreaterThan(card.width * 0.8);

    // The kinds: a row each, amount and calls in their own columns.
    const kinds = text.getByRole('table', { name: 'Text spend by kind' });
    await expect(kinds.getByRole('columnheader')).toHaveText(['Spent on', 'Amount', 'Calls']);
    await expect(kinds.getByRole('rowheader')).toHaveText(['Turns', 'Bond, Arc and Scene checks', 'Memory keeping']);
    await expect(kinds.getByRole('cell')).toHaveText(['$1.10', '30', '$0.12', '10', '$0.01', '1']);
    await expect(text.getByRole('definition').first()).toHaveText('$1.23 · 41 calls');

    // Why the Venice balance is unknown, in words; the setting's name is for README.
    const image = page.getByRole('region', { name: 'Images and audio (Venice)' });
    await expect(image).toContainText('Unknown. Venice tells its balance only to an admin key');
    await expect(page.getByText('VENICE_ADMIN_KEY')).toHaveCount(0);

    // One way to Settings for both pools, not one under each.
    await expect(page.getByRole('link', { name: /in Settings$/ })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
