import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// Memory, Personas and Settings save as you type (spec: "Saving"), used on a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** The save status in a page's (or the drawer's) header. */
function saveStatus(scope: Page | Locator): Locator {
    return scope.getByRole('status').filter({ hasText: /Sav|save/ });
}

test('a Persona description saves as it is typed and is kept after a reload, with no Save button', async ({ page, request }) => {
    const created = await request.post('/api/personas', { data: { name: 'Rin', description: 'A drifter.' } });
    expect(created.ok()).toBe(true);
    const personaId = (await created.json()).id as number;

    try {
        await page.goto('/personas');
        const card = page.getByRole('list', { name: 'Personas' }).getByRole('listitem', { name: 'Rin' });
        await card.getByLabel('Description').fill('A drifter with salt in her hair.');
        await expect(saveStatus(page)).toHaveText('Saved');
        await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);

        await page.reload();
        await expect(
            page.getByRole('list', { name: 'Personas' }).getByRole('listitem', { name: 'Rin' }).getByLabel('Description'),
        ).toHaveValue('A drifter with salt in her hair.');
    } finally {
        await request.delete(`/api/personas/${personaId}`);
    }
});

test('when the API fails a save, "Couldn\'t save" shows with the reason and the typed text stays', async ({ page, request }) => {
    const created = await request.post('/api/personas', { data: { name: 'Rin', description: 'A drifter.' } });
    expect(created.ok()).toBe(true);
    const personaId = (await created.json()).id as number;

    try {
        await page.route(`**/api/personas/${personaId}`, (route) =>
            route.request().method() === 'PATCH'
                ? route.fulfill({ status: 500, json: { error: { code: 'INTERNAL', message: 'The database is busy.' } } })
                : route.continue(),
        );
        await page.goto('/personas');
        const description = page.getByRole('list', { name: 'Personas' }).getByRole('listitem', { name: 'Rin' }).getByLabel('Description');
        await description.fill('A drifter with salt in her hair.');
        await expect(saveStatus(page)).toHaveText("Couldn't save: The database is busy.");
        await expect(description).toHaveValue('A drifter with salt in her hair.');

        // Once the API answers again, the next edit saves.
        await page.unroute(`**/api/personas/${personaId}`);
        await description.fill('A drifter with salt in her hair, again.');
        await expect(saveStatus(page)).toHaveText('Saved');
        await page.reload();
        await expect(
            page.getByRole('list', { name: 'Personas' }).getByRole('listitem', { name: 'Rin' }).getByLabel('Description'),
        ).toHaveValue('A drifter with salt in her hair, again.');
    } finally {
        await request.delete(`/api/personas/${personaId}`);
    }
});

test('hiding the page sends a waiting edit at once, without waiting for a save still in flight', async ({ page, request }) => {
    const ids: number[] = [];
    for (const name of ['Rin', 'Tam']) {
        const created = await request.post('/api/personas', { data: { name, description: 'A drifter.' } });
        expect(created.ok()).toBe(true);
        ids.push((await created.json()).id as number);
    }
    const [rinId, tamId] = ids;

    try {
        // Rin's save is held, as if the network were slow, until the end of the test.
        let release = () => {};
        const held = new Promise<void>((resolve) => (release = resolve));
        await page.route(`**/api/personas/${rinId}`, async (route) => {
            if (route.request().method() === 'PATCH') await held;
            await route.continue();
        });
        await page.goto('/personas');
        const personas = page.getByRole('list', { name: 'Personas' });
        const rinSent = page.waitForRequest((sent) => sent.method() === 'PATCH' && sent.url().endsWith(`/api/personas/${rinId}`));
        await personas.getByRole('listitem', { name: 'Rin' }).getByLabel('Description').fill('Rin, held up.');
        await rinSent;

        // Tam's edit is still waiting out the typing pause when the tab is switched away.
        const tamSent = page.waitForRequest((sent) => sent.method() === 'PATCH' && sent.url().endsWith(`/api/personas/${tamId}`), {
            timeout: 3_000,
        });
        await personas.getByRole('listitem', { name: 'Tam' }).getByLabel('Description').fill('Tam, sent on the way out.');
        await page.evaluate(() => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await tamSent;
        await expect
            .poll(async () => (await (await request.get(`/api/personas/${tamId}`)).json()).description)
            .toBe('Tam, sent on the way out.');

        release();
        await expect
            .poll(async () => (await (await request.get(`/api/personas/${rinId}`)).json()).description)
            .toBe('Rin, held up.');
    } finally {
        for (const id of ids) await request.delete(`/api/personas/${id}`);
    }
});

/** A playable Story with one Chat and one hand-written Memory, made through the API. */
async function createChatWithMemory(request: APIRequestContext): Promise<{ storyId: number; chatId: number; memoryId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.' },
    });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;
    const memory = await request.post(`/api/stories/${storyId}/chats/${chatId}/memories`, {
        data: { text: '{user} left the horse at the ferry.' },
    });
    expect(memory.ok()).toBe(true);
    return { storyId, chatId, memoryId: (await memory.json()).id as number };
}

async function openMemory(page: Page): Promise<Locator> {
    await page.getByRole('button', { name: 'Chat menu' }).click();
    await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Memory' });
    await expect(drawer).toBeVisible();
    return drawer;
}

test('a Memory edit and a Memory add save as they are typed and are kept after a reload, with no Save button', async ({
    page,
    request,
}) => {
    const { storyId, chatId, memoryId } = await createChatWithMemory(request);

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        let drawer = await openMemory(page);

        // An edit.
        const memory = drawer.locator(`li[data-memory-id="${memoryId}"]`);
        await memory.getByRole('button', { name: 'Edit' }).click();
        await memory.getByRole('textbox', { name: 'Memory text' }).fill('{user} left the grey horse at the ferry.');
        await expect(saveStatus(drawer)).toHaveText('Saved');
        await expect(drawer.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
        await memory.getByRole('button', { name: 'Done' }).click();
        await expect(memory).toContainText('Ash left the grey horse at the ferry.');

        // An add: saved once it has text, with no Add button to press.
        await drawer.getByRole('button', { name: 'Add a Memory' }).click();
        await drawer.getByRole('group', { name: 'New Memory' }).getByRole('textbox', { name: 'Memory text' }).fill('{user} lost the lantern on the stairs.');
        await expect(saveStatus(drawer)).toHaveText('Saved');
        await expect(drawer.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);

        await page.reload();
        drawer = await openMemory(page);
        await expect(drawer.locator(`li[data-memory-id="${memoryId}"]`)).toContainText('Ash left the grey horse at the ferry.');
        const added = drawer.getByRole('listitem').filter({ hasText: 'Ash lost the lantern on the stairs.' });
        await expect(added).toHaveCount(1);
        await expect(added).toContainText('Written by you');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a Memory edit that fails to save keeps its text and its editor open until it saves', async ({ page, request }) => {
    const { storyId, chatId, memoryId } = await createChatWithMemory(request);
    const route = `**/api/stories/${storyId}/chats/${chatId}/memories/${memoryId}`;

    try {
        await page.route(route, (sent) =>
            sent.request().method() === 'PATCH'
                ? sent.fulfill({ status: 500, json: { error: { code: 'INTERNAL', message: 'The database is busy.' } } })
                : sent.continue(),
        );
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const drawer = await openMemory(page);
        const memory = drawer.locator(`li[data-memory-id="${memoryId}"]`);
        await memory.getByRole('button', { name: 'Edit' }).click();
        const text = memory.getByRole('textbox', { name: 'Memory text' });
        await text.fill('{user} left the grey horse at the ferry.');
        await expect(saveStatus(drawer)).toHaveText("Couldn't save: The database is busy.");

        // Done does not throw the text away while it is unsaved.
        await memory.getByRole('button', { name: 'Done' }).click();
        await expect(saveStatus(drawer)).toHaveText("Couldn't save: The database is busy.");
        await expect(text).toHaveValue('{user} left the grey horse at the ferry.');

        // Once the API answers again, Done tries once more, saves and closes.
        await page.unroute(route);
        await memory.getByRole('button', { name: 'Done' }).click();
        await expect(saveStatus(drawer)).toHaveText('Saved');
        await expect(text).toHaveCount(0);
        await expect(memory).toContainText('Ash left the grey horse at the ferry.');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a Settings change saves once it is valid and is kept after a reload; an invalid number shows its error and is not sent', async ({
    page,
    request,
}) => {
    const before = (await (await request.get('/api/settings')).json()).settings as { textLowCreditPercent: number; textCreditCapUsd: number };

    try {
        await page.goto('/settings');
        const warning = page.getByLabel('Text warning (%)');
        await warning.fill('35');
        await expect(saveStatus(page)).toHaveText('Saved');
        await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);

        // Typed one key at a time into an out-of-range value: the error shows at the field and the
        // typed value stays, but neither it nor the valid "4" and "40" on the way is sent.
        await warning.fill('4');
        await warning.fill('40');
        await warning.fill('400');
        await expect(page.getByText('Enter a whole number from 0 to 100.')).toBeVisible();
        await expect(warning).toHaveValue('400');
        await expect(saveStatus(page)).toHaveText('Saved');

        // A pool in USD takes cents, not fractions of a cent.
        const pool = page.getByLabel('Text pool (USD)');
        await pool.fill('12.345');
        await expect(page.getByText('Enter an amount of 0 or more, to the cent.')).toBeVisible();
        await pool.fill('12.07');
        await expect(page.getByText('Enter an amount of 0 or more, to the cent.')).toHaveCount(0);
        await expect(saveStatus(page)).toHaveText('Saved');

        await page.reload();
        await expect(page.getByLabel('Text warning (%)')).toHaveValue('35');
        await expect(page.getByLabel('Text pool (USD)')).toHaveValue('12.07');
    } finally {
        await request.put('/api/settings', {
            data: { textLowCreditPercent: before.textLowCreditPercent, textCreditCapUsd: before.textCreditCapUsd },
        });
    }
});
