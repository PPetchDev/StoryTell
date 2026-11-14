import { APIRequestContext, expect, test } from '@playwright/test';

// Home and the shell are used on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';

/** A playable Story made through the API, optionally with Scenes in that order. */
async function createPlayableStory(request: APIRequestContext, title: string, scenes: string[] = []): Promise<number> {
    const created = await request.post('/api/stories', {
        data: {
            title,
            setting: `${title} sits on a storm-cut island. Nobody has kept the light for years.`,
            opening: OPENING,
        },
    });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    for (const name of scenes) {
        await request.post(`/api/stories/${storyId}/scenes`, {
            data: { name, situation: `Ash is in ${name}.`, moveOnCondition: 'Ash leaves.' },
        });
    }
    return storyId;
}

async function startChat(request: APIRequestContext, storyId: number): Promise<number> {
    const created = await request.post(`/api/stories/${storyId}/chats`);
    expect(created.ok()).toBe(true);
    return (await created.json()).id as number;
}

/** Leaves the shared e2e database as it was found, Chats included. */
async function removeStories(request: APIRequestContext, storyIds: number[]) {
    for (const storyId of storyIds) await request.delete(`/api/stories/${storyId}`);
}

test('the home screen lists no Stories on a fresh install, and offers nothing to continue', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Stories' })).toBeVisible();
    await expect(page.getByText('No Stories yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Continue/ })).toHaveCount(0);
});

test('the Continue row opens the newest-played Chat, and the Chat screen has no bottom nav', async ({ page, request }) => {
    // Night Market is saved last, so it heads the Story list; The Lighthouse's Chat is played last.
    const lighthouse = await createPlayableStory(request, 'The Lighthouse', ['The lamp room']);
    const market = await createPlayableStory(request, 'Night Market');
    await startChat(request, market);
    const newestChat = await startChat(request, lighthouse);
    // A Draft's Chat is never offered, even when it was played last.
    const draft = await createPlayableStory(request, 'Saltwind');
    await startChat(request, draft);
    await request.patch(`/api/stories/${draft}`, { data: { opening: '' } });

    try {
        await page.goto('/');
        const row = page.getByRole('link', { name: /^Continue/ });
        await expect(row).toContainText('The Lighthouse');
        await expect(row).toContainText('The lamp room');

        await row.click();

        await expect(page).toHaveURL(`/stories/${lighthouse}/chats/${newestChat}`);
        await expect(page.getByRole('article', { name: 'Opening' })).toContainText('The lamp went out an hour ago.');
        await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    } finally {
        await removeStories(request, [lighthouse, market, draft]);
    }
});

test('Stories show as cards; a card opens a sheet to continue, start a new Chat or edit', async ({ page, request }) => {
    const playable = await createPlayableStory(request, 'The Lighthouse');
    const chatId = await startChat(request, playable);
    const draft = (await (await request.post('/api/stories', { data: { title: 'Saltwind' } })).json()).id as number;

    try {
        await page.goto('/');
        const cards = page.getByRole('list', { name: 'Stories' });
        const lighthouse = cards.getByRole('button', { name: /The Lighthouse/ });
        const saltwind = cards.getByRole('button', { name: /Saltwind/ });

        // Each card shows its hook and when it was last played; only the Draft has the badge.
        await expect(lighthouse).toContainText('The Lighthouse sits on a storm-cut island.');
        await expect(lighthouse).toContainText('Played');
        await expect(lighthouse).not.toContainText('Draft');
        await expect(saltwind).toContainText('Draft');
        await expect(saltwind).toContainText('Not played yet');

        // Two columns at phone width.
        const [first, second] = [await lighthouse.boundingBox(), await saltwind.boundingBox()];
        expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);

        // A Draft's sheet says how much is missing instead of offering play.
        await saltwind.click();
        let sheet = page.getByRole('dialog', { name: 'Saltwind' });
        await expect(sheet).toContainText(/\d+ things to fill in before you can play/);
        await expect(sheet.getByRole('button', { name: 'New Chat' })).toHaveCount(0);
        await expect(sheet.getByRole('link', { name: /^Continue/ })).toHaveCount(0);
        // Keyboard focus stays in the sheet while it is open.
        for (let i = 0; i < 4; i++) {
            await page.keyboard.press('Tab');
            expect(await sheet.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
        }
        await sheet.getByRole('button', { name: 'Close' }).click();
        await expect(sheet).toHaveCount(0);

        // A playable Story's sheet continues its Chat, starts a new one, or opens the editor.
        await lighthouse.click();
        sheet = page.getByRole('dialog', { name: 'The Lighthouse' });
        await expect(sheet.getByRole('link', { name: 'Edit Story' })).toHaveAttribute('href', `/stories/${playable}`);
        await sheet.getByRole('link', { name: /^Continue/ }).click();
        await expect(page).toHaveURL(`/stories/${playable}/chats/${chatId}`);

        await page.goto('/');
        await page.getByRole('list', { name: 'Stories' }).getByRole('button', { name: /The Lighthouse/ }).click();
        await page.getByRole('dialog', { name: 'The Lighthouse' }).getByRole('button', { name: 'New Chat' }).click();
        await expect(page).toHaveURL(new RegExp(`/stories/${playable}/chats/(?!${chatId}$)\\d+$`));
    } finally {
        await removeStories(request, [playable, draft]);
    }
});

test("a Story's Chat list shows each Chat's latest line and Scene", async ({ page, request }) => {
    const storyId = await createPlayableStory(request, 'The Lighthouse', ['The flooded archive']);
    await startChat(request, storyId);

    try {
        await page.goto(`/stories/${storyId}/chats`);
        const chat = page.getByRole('list', { name: 'Chats' }).getByRole('link', { name: /Chat 1/ });
        await expect(chat).toContainText('The flooded archive');
        await expect(chat).toContainText('The lamp went out an hour ago. Mira: Boots off, keeper.');
    } finally {
        await removeStories(request, [storyId]);
    }
});

test('the bottom nav reaches Stories, Gallery, Personas, Usage and Settings, and marks where you are', async ({ page }) => {
    await page.goto('/');

    for (const [label, path, heading] of [
        ['Gallery', '/gallery', 'Gallery'],
        ['Personas', '/personas', 'Personas'],
        ['Usage', '/usage', 'Usage'],
        ['Settings', '/settings', 'Settings'],
        ['Stories', '/', 'Stories'],
    ] as const) {
        const nav = page.getByRole('navigation', { name: 'Main' });
        await nav.getByRole('link', { name: label }).click();
        await expect(page).toHaveURL(path);
        await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
        await expect(nav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');

        // It sits at the bottom of the screen.
        const box = (await nav.boundingBox())!;
        expect(Math.round(box.y + box.height)).toBe(844);
    }

    // A page taller than the screen scrolls its end clear of the bar.
    await page.getByRole('main').evaluate((main) => {
        const filler = document.createElement('div');
        filler.style.height = '2000px';
        main.append(filler);
    });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const main = (await page.getByRole('main').boundingBox())!;
    const navTop = (await page.getByRole('navigation', { name: 'Main' }).boundingBox())!.y;
    expect(main.y + main.height).toBeLessThanOrEqual(navTop);
});
