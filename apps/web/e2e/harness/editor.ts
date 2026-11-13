import { expect, Locator, Page } from '@playwright/test';

/**
 * Taps `toggle` (a button with aria-expanded) until it reads open. A tap that lands before the
 * page has hydrated does nothing, so the tap is tried again, but only while it still reads closed:
 * a tap that did land is never undone by a second one.
 */
async function expand(toggle: Locator): Promise<void> {
    await toggle.waitFor();
    await expect(async () => {
        if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 2_000 });
    }).toPass();
}

/**
 * Story editor cards start folded (docs/ui-audit-2026-11-13.md, H2; .scratch/desktop-and-folds/spec.md):
 * opens the card named `name` (its section's label, e.g. "Character 1", "Starting Bonds from Mira",
 * "Lore 1", "Saved replies") when it is folded, and returns it.
 */
export async function openCard(scope: Page | Locator, name: string | RegExp): Promise<Locator> {
    const card = scope.getByRole('region', { name, exact: typeof name === 'string' }).first();
    await expand(card.locator('[aria-expanded]').first());
    return card;
}

/**
 * Expressions are a grid of tiles; a tile's actions show once it is tapped (.scratch/expressions/spec.md,
 * "In the Story editor"). Opens the Character card and the tile for `label` ("Happy"), and returns the
 * tile's actions (the group "<label> Expression").
 */
export async function openExpression(scope: Page | Locator, character: string, label: string): Promise<Locator> {
    const card = await openCard(scope, character);
    await expand(expressionTile(card, label));
    return card.getByRole('group', { name: `${label} Expression` });
}

/** The tile of the Expression `label` ("Happy") in a Character card: its thumbnail and label. */
export function expressionTile(card: Locator, label: string): Locator {
    return card.getByRole('button', { name: new RegExp(`^${label} Expression`) });
}
