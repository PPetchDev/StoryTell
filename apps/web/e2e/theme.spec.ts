import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// Colour tokens and the theme (.scratch/chat-looks/spec.md, "Colour tokens" and "Light theme"), on a
// phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** A Story whose Opening has Kai speak, then Mira; Mira comes first in the cast. */
async function createStory(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: 'The door bangs open.\n\n@Kai: Welcome, keeper!\n\n@Mira: Hush.' },
    });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    let mira = 0;
    for (const name of ['Mira', 'Kai']) {
        const made = await request.post(`/api/stories/${storyId}/characters`, {
            data: { name, appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
        });
        const story = (await made.json()) as { characters: { id: number; name: string }[] };
        if (name === 'Mira') mira = story.characters.find((each) => each.name === name)!.id;
    }
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    const chatId = (await chat.json()).id as number;
    await request.post(`/api/stories/${storyId}/chats/${chatId}/memories`, { data: { text: 'Mira keeps the lamp.', knownBy: [mira] } });
    return { storyId, chatId };
}

const css = (locator: Locator, property: string) => locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

/** The name and initial of a speech line in the Opening. */
function speech(page: Page, name: string): { name: Locator; initial: Locator } {
    const group = page.getByRole('article', { name: 'Opening' }).getByRole('group', { name, exact: true });
    return { name: group.locator('p').first(), initial: group.locator('span[aria-hidden="true"]').first() };
}

/** The Memory graph's ring around a person. */
async function graphRing(page: Page, person: RegExp): Promise<Locator> {
    await page.getByRole('button', { name: 'Chat menu' }).click();
    await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Memory' });
    await drawer.getByRole('radio', { name: 'Graph' }).tap();
    return drawer.getByRole('group', { name: 'Memory graph' }).getByRole('button', { name: person }).locator('circle').first();
}

test('Character colours come from the theme: the dark palette on names, initials and the Memory graph', async ({ page, request }) => {
    const { storyId, chatId } = await createStory(request);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const mira = speech(page, 'Mira');
        const kai = speech(page, 'Kai');
        // --character-1 and --character-2, with the dark page colour on the initial.
        await expect(mira.name).toHaveCSS('color', 'rgb(242, 183, 102)');
        await expect(mira.initial).toHaveCSS('background-color', 'rgb(242, 183, 102)');
        await expect(mira.initial).toHaveCSS('color', 'rgb(22, 19, 31)');
        await expect(kai.name).toHaveCSS('color', 'rgb(95, 208, 197)');
        await expect(kai.initial).toHaveCSS('background-color', 'rgb(95, 208, 197)');

        const ring = await graphRing(page, /^Mira,/);
        expect(await css(ring, 'stroke')).toBe('rgb(242, 183, 102)');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

/** The theme on <html>, the page colour and the browser chrome's colour. */
async function expectTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('body')).toHaveCSS('background-color', theme === 'dark' ? 'rgb(22, 19, 31)' : 'rgb(246, 244, 250)');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', theme === 'dark' ? '#16131f' : '#f6f4fa');
}

/**
 * Records data-theme as the page is parsed: when <body> first exists (the head, with its inline
 * script, is parsed, and no app script has run) and at DOMContentLoaded.
 */
async function recordEarlyTheme(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const record = window as unknown as { themeAtBody?: string | null; themeAtLoaded?: string | null };
        const observer = new MutationObserver(() => {
            if (document.body && record.themeAtBody === undefined) {
                record.themeAtBody = document.documentElement.getAttribute('data-theme');
                observer.disconnect();
            }
        });
        observer.observe(document, { childList: true, subtree: true });
        document.addEventListener('DOMContentLoaded', () => {
            record.themeAtLoaded = document.documentElement.getAttribute('data-theme');
        });
    });
}

const earlyTheme = (page: Page) =>
    page.evaluate(() => {
        const record = window as unknown as { themeAtBody?: string | null; themeAtLoaded?: string | null };
        return [record.themeAtBody, record.themeAtLoaded];
    });

test('Dark is the default theme, from the first frame', async ({ page }) => {
    await recordEarlyTheme(page);
    await page.goto('/settings');
    const themes = page.getByRole('radiogroup', { name: 'Theme' });
    await expect(themes.getByRole('radio', { name: 'Dark' })).toBeChecked();
    await expectTheme(page, 'dark');
    expect(await earlyTheme(page)).toEqual(['dark', 'dark']);
});

test('choosing Light applies at once and after a reload, set before hydration so no dark frame shows', async ({ page, request }) => {
    const { storyId, chatId } = await createStory(request);
    try {
        await recordEarlyTheme(page);
        await page.goto('/settings');
        const themes = page.getByRole('radiogroup', { name: 'Theme' });
        await themes.getByRole('radio', { name: 'Light' }).check();
        await expectTheme(page, 'light');

        await page.reload();
        await expect(page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Light' })).toBeChecked();
        await expectTheme(page, 'light');
        expect(await earlyTheme(page)).toEqual(['light', 'light']);

        // The whole app follows, Character colours too: the light palette, with a white initial.
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        expect(await earlyTheme(page)).toEqual(['light', 'light']);
        await expectTheme(page, 'light');
        const mira = speech(page, 'Mira');
        await expect(mira.name).toHaveCSS('color', 'rgb(122, 80, 0)');
        await expect(mira.initial).toHaveCSS('background-color', 'rgb(122, 80, 0)');
        await expect(mira.initial).toHaveCSS('color', 'rgb(255, 255, 255)');
        const ring = await graphRing(page, /^Mira,/);
        expect(await css(ring, 'stroke')).toBe('rgb(122, 80, 0)');

        // And back to Dark.
        await page.goto('/settings');
        await page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Dark' }).check();
        await expectTheme(page, 'dark');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test("Match phone follows the phone's light or dark setting, both ways, as it changes", async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await recordEarlyTheme(page);
    await page.goto('/settings');
    await expectTheme(page, 'dark');
    await page.getByRole('radiogroup', { name: 'Theme' }).getByRole('radio', { name: 'Match phone' }).check();
    await expectTheme(page, 'light');

    await page.emulateMedia({ colorScheme: 'dark' });
    await expectTheme(page, 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expectTheme(page, 'light');

    // From the first frame after a reload, too.
    await page.reload();
    await expectTheme(page, 'light');
    expect(await earlyTheme(page)).toEqual(['light', 'light']);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    await expectTheme(page, 'dark');
    expect(await earlyTheme(page)).toEqual(['dark', 'dark']);
});
