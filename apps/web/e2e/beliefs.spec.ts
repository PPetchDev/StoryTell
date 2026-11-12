import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// Beliefs in the Memory drawer (.scratch/memory-by-meaning/issues/04-beliefs.md), on a phone: 390px
// wide, with touch. The people are adults in a hill-tribe Story where Petch hides that he is a Marquis.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';

async function storyAndChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number; nara: number; kai: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Hill Camp' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A hill camp of herders.', opening: 'Smoke rises over the camp.\n\n@Nara: Another stranger.' } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Petch', description: 'A traveller.' } });
    const ids: Record<string, number> = {};
    for (const name of ['Nara', 'Kai']) {
        const made = await request.post(`/api/stories/${storyId}/characters`, {
            data: { name, appearance: 'Tall, weathered.', personality: 'Proud.', voice: 'Low.' },
        });
        expect(made.ok()).toBe(true);
        ids[name] = ((await made.json()) as { characters: { id: number; name: string }[] }).characters.find((each) => each.name === name)!.id;
    }
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number, nara: ids.Nara, kai: ids.Kai };
}

async function play(request: APIRequestContext, storyId: number, chatId: number, text: string, reply: string, operations: object[]): Promise<void> {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [reply] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [JSON.stringify({ operations })] } });
    expect((await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text } })).ok()).toBe(true);
    await expect
        .poll(async () => (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).messages.at(-1).memory?.status)
        .toBe('done');
}

async function openMemory(page: Page): Promise<Locator> {
    await page.getByRole('button', { name: 'Chat menu' }).click();
    await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Memory' });
    await expect(drawer).toBeVisible();
    return drawer;
}

test('the Beliefs section reads "Nara believes …" with what it doesn\'t match, and a given-up one folds below', async ({ page, request }) => {
    const { storyId, chatId } = await storyAndChat(request);
    try {
        await request.delete('/api/testing/fake-gateway');
        await play(request, storyId, chatId, 'I show Kai the seal.', '@Kai: My lord.', [
            { op: 'add', text: '{user} is the Marquis of the river lands.', known_by: ['Kai'], cause: 'the seal' },
        ]);
        const memories = await (await request.get(`/api/stories/${storyId}/chats/${chatId}/memories`)).json();
        const marquis = memories.memories[0].id as number;
        await play(request, storyId, chatId, 'I tell Nara I herd goats.', '@Nara: A herder, then.', [
            { op: 'believe', character: 'Nara', text: '{user} is a wandering herder.', contradicts: marquis, cause: 'he lied' },
            { op: 'believe', character: 'Kai', text: 'The ford is safe at dusk.', cause: 'a guess' },
        ]);
        const chat = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
        const ford = chat.beliefs.find((belief: { text: string }) => belief.text.startsWith('The ford')).id as number;
        await play(request, storyId, chatId, 'Kai, look at the river.', '@Kai: It runs high. I was wrong.', [{ op: 'give_up', belief: ford, because: 'the river' }]);

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const drawer = await openMemory(page);
        const beliefs = drawer.getByRole('region', { name: 'Beliefs' });
        await beliefs.scrollIntoViewIfNeeded();
        const nara = beliefs.getByRole('list', { name: 'Nara’s Beliefs' }).getByRole('listitem');
        await expect(nara).toHaveCount(1);
        await expect(nara).toContainText('Nara believes Petch is a wandering herder.');
        await expect(nara).toContainText('Doesn’t match: Petch is the Marquis of the river lands.');
        await expect(nara).toContainText('Written by the AI');
        await expect(beliefs.getByRole('list', { name: 'Kai’s Beliefs' })).toHaveCount(0);

        // Given up: folded below, with the line that showed the truth.
        await beliefs.getByText('Given up (1)').tap();
        const given = beliefs.getByRole('list', { name: 'Given-up Beliefs' }).getByRole('listitem');
        await expect(given).toContainText('Kai believed The ford is safe at dusk.');
        await expect(given).toContainText('Gave this up: Kai: It runs high. I was wrong.');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    } finally {
        await request.delete('/api/testing/fake-gateway');
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a Belief added from the drawer joins the Beliefs, and can be edited and deleted', async ({ page, request }) => {
    const { storyId, chatId } = await storyAndChat(request);
    try {
        const memory = await request.post(`/api/stories/${storyId}/chats/${chatId}/memories`, { data: { text: '{user} is the Marquis of the river lands.' } });
        expect(memory.ok()).toBe(true);

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const drawer = await openMemory(page);
        const beliefs = drawer.getByRole('region', { name: 'Beliefs' });
        await expect(beliefs).toContainText('No one holds a Belief yet.');
        await beliefs.getByRole('button', { name: 'Add a Belief' }).tap();
        const form = beliefs.getByRole('form', { name: 'New Belief' });
        await form.getByLabel('Who believes it').selectOption({ label: 'Nara' });
        await form.getByLabel('What they believe').fill('{user} is a wandering herder.');
        await form.getByLabel('Doesn’t match (optional)').selectOption({ label: 'Petch is the Marquis of the river lands.' });
        await form.getByRole('button', { name: 'Save' }).tap();

        const added = beliefs.getByRole('list', { name: 'Nara’s Beliefs' }).getByRole('listitem');
        await expect(added).toContainText('Nara believes Petch is a wandering herder.');
        await expect(added).toContainText('Doesn’t match: Petch is the Marquis of the river lands.');
        await expect(added).toContainText('Written by you');
        await expect(form).toHaveCount(0);

        // Edit: Kai holds it now, and it matches nothing.
        await added.getByRole('button', { name: 'Edit' }).tap();
        const edit = beliefs.getByRole('form', { name: /^Edit Belief/ });
        await edit.getByLabel('Who believes it').selectOption({ label: 'Kai' });
        await edit.getByLabel('Doesn’t match (optional)').selectOption({ label: 'No Memory' });
        await edit.getByRole('button', { name: 'Save' }).tap();
        const kai = beliefs.getByRole('list', { name: 'Kai’s Beliefs' }).getByRole('listitem');
        await expect(kai).toContainText('Kai believes Petch is a wandering herder.');
        await expect(kai).not.toContainText('Doesn’t match');

        const stored = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
        expect(stored.beliefs).toHaveLength(1);
        expect(stored.beliefs[0]).toMatchObject({ text: '{user} is a wandering herder.', contradictsMemoryId: null, writtenBy: 'user' });

        await kai.getByRole('button', { name: 'Delete' }).tap();
        await kai.getByRole('button', { name: 'Delete' }).tap();
        await expect(beliefs).toContainText('No one holds a Belief yet.');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});
