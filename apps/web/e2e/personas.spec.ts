import { APIRequestContext, expect, test } from '@playwright/test';

// Used on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';

/** A playable Story with one Chat, made through the API, so the browser test covers only the swap. */
async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING },
    });
    await request.patch(`/api/stories/${storyId}/role`, {
        data: { name: 'Ash', description: 'The new keeper, arrived this morning.' },
    });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

/** Scripts one turn whose background calls change nothing. */
async function scriptTurn(request: APIRequestContext, reply: string): Promise<void> {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: reply, model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'judge', replies: ['{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}'] },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: ['{"operations":[]}'] } });
}

test('makes a Persona, swaps to it mid-Chat, and sees the next User Message under its name', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await request.delete('/api/testing/fake-gateway');
    let personaId: number | null = null;

    try {
        // The Personas page, from the nav.
        await page.goto('/');
        await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Personas' }).click();
        await expect(page.getByRole('heading', { name: 'Personas', level: 1 })).toBeVisible();
        // "New Persona" makes one at once; its Name and Description save as they are typed.
        await page.getByRole('button', { name: 'New Persona' }).click();
        const fresh = page.getByRole('list', { name: 'Personas' }).getByRole('listitem', { name: 'New Persona' });
        await expect(fresh.getByLabel('Name')).toBeFocused();
        await fresh.getByLabel('Description').fill('A drifter with salt in her hair.');
        await fresh.getByLabel('Name').fill('Rin');
        await expect(page.getByRole('status').filter({ hasText: /Sav|save/ })).toHaveText('Saved');
        const card = page.getByRole('list', { name: 'Personas' }).getByRole('listitem', { name: 'Rin' });
        await expect(card.getByLabel('Description')).toHaveValue('A drifter with salt in her hair.');
        const personas = (await (await request.get('/api/personas')).json()).personas as Array<{ id: number; name: string }>;
        personaId = personas.find((persona) => persona.name === 'Rin')!.id;

        // A turn as the Role.
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        // The identity swap lives in the top bar's ⋯ menu, and the bar names the worn identity.
        const menu = page.getByRole('dialog', { name: 'Chat menu' });
        const swap = menu.getByRole('combobox', { name: /Playing as/ });
        await expect(page.getByText('as Ash', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Chat menu' }).click();
        await expect(swap).toHaveValue('');
        await menu.getByRole('button', { name: 'Close' }).click();
        await expect(menu).toHaveCount(0);
        await scriptTurn(request, '@Mira: Took you long enough.');
        await page.getByLabel('Write as Ash').fill('I pull my boots off.');
        await page.getByRole('button', { name: 'Send' }).click();
        await expect(page.getByRole('article', { name: 'Ash said' })).toContainText('I pull my boots off.');
        await expect(page.getByRole('article', { name: 'AI reply' })).toContainText('Took you long enough.');

        // Swap to the Persona mid-Chat: the next User Message goes under its name, the old one keeps Ash.
        await page.getByRole('button', { name: 'Chat menu' }).click();
        await swap.selectOption({ label: 'Rin' });
        // The menu stays open, so a keyboard user can arrow through the list; the bar follows.
        await expect(page.getByText('as Rin', { exact: true })).toBeVisible();
        await menu.getByRole('button', { name: 'Close' }).click();
        await expect(page.getByLabel('Write as Rin')).toBeVisible();
        await scriptTurn(request, '@Mira: And who are you, then?');
        await page.getByLabel('Write as Rin').fill('I shake the salt out of my hair.');
        await page.getByRole('button', { name: 'Send' }).click();
        const asRin = page.getByRole('article', { name: 'Rin said' });
        await expect(asRin).toContainText('I shake the salt out of my hair.');
        await expect(asRin.getByText('Rin', { exact: true })).toBeVisible();
        await expect(page.getByRole('article', { name: 'Ash said' })).toContainText('I pull my boots off.');
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('And who are you, then?');

        // The swap is Chat state: it is still worn after a reload.
        await page.reload();
        await page.getByRole('button', { name: 'Chat menu' }).click();
        await expect(swap).toHaveValue(String(personaId));
        await expect(page.getByLabel('Write as Rin')).toBeVisible();
    } finally {
        // Leaves the shared e2e database as it was found.
        await request.delete(`/api/stories/${storyId}`);
        if (personaId !== null) await request.delete(`/api/personas/${personaId}`);
    }
});
