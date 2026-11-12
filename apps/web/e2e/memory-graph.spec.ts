import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// The Memory graph (CONTEXT.md: "Memory graph"), used on a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

interface Fixture {
    storyId: number;
    chatId: number;
    /** "{user} gave Mira the lamp.", known by Mira. */
    lamp: number;
    /** "Jonah mended the boat.", known by Mira and Jonah. */
    boat: number;
    /** "The storm lasted three days.", known by Jonah, naming nobody. */
    storm: number;
}

/** A Story with two Characters and one Chat holding three Memories, made through the API. */
async function createChatWithMemories(request: APIRequestContext): Promise<Fixture> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.' },
    });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    const character = async (name: string) => {
        const made = await request.post(`/api/stories/${storyId}/characters`, {
            data: { name, appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
        });
        expect(made.ok()).toBe(true);
        // Adding a Character answers with the whole Story.
        const story = (await made.json()) as { characters: { id: number; name: string }[] };
        return story.characters.find((each) => each.name === name)!.id;
    };
    const mira = await character('Mira');
    const jonah = await character('Jonah');
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;
    const memory = async (text: string, knownBy: number[]) => {
        const added = await request.post(`/api/stories/${storyId}/chats/${chatId}/memories`, { data: { text, knownBy } });
        expect(added.ok()).toBe(true);
        return (await added.json()).id as number;
    };
    return {
        storyId,
        chatId,
        lamp: await memory('{user} gave Mira the lamp.', [mira]),
        boat: await memory('Jonah mended the boat.', [mira, jonah]),
        storm: await memory('The storm lasted three days.', [jonah]),
    };
}

async function openMemory(page: Page): Promise<Locator> {
    await page.getByRole('button', { name: 'Chat menu' }).click();
    await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Memory' });
    await expect(drawer).toBeVisible();
    return drawer;
}

test('the Memory graph links each Memory to the people it names; a tapped person lists theirs and fades what they don\'t know', async ({
    page,
    request,
}) => {
    const { storyId, chatId, lamp, boat, storm } = await createChatWithMemories(request);

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const drawer = await openMemory(page);
        await expect(drawer.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true');
        await drawer.getByRole('radio', { name: 'Graph' }).tap();

        const graph = drawer.getByRole('group', { name: 'Memory graph' });
        await expect(graph).toBeVisible();
        await expect(drawer.getByRole('list', { name: 'Memories' })).toHaveCount(0);

        // The worn identity and both Characters, counted by the Memories that name them; a
        // Memory that names nobody goes to the Characters who know it.
        await expect(graph.getByRole('button', { name: 'Ash (you), 1 Memory' })).toBeVisible();
        await expect(graph.getByRole('button', { name: 'Mira, 1 Memory' })).toBeVisible();
        await expect(graph.getByRole('button', { name: 'Jonah, 2 Memories' })).toBeVisible();
        // A dot is named by its words and who it is about, with no id (audit M52, L36); the test finds it by its id.
        const dot = (id: number) => graph.locator(`g[data-memory-id="${id}"]`);
        await expect(graph.locator('g[data-memory-id]')).toHaveCount(3);
        await expect(dot(lamp)).toHaveAccessibleName('Ash gave Mira the lamp. About Ash, Mira.');
        await expect(dot(storm)).toHaveAccessibleName('The storm lasted three days. About Jonah.');

        // Mira: the Memory about her below the graph, and the one she doesn't know faded.
        await graph.getByRole('button', { name: /^Mira,/ }).tap();
        await expect(graph.getByRole('button', { name: /^Mira,/ })).toHaveAttribute('aria-pressed', 'true');
        const aboutMira = drawer.getByRole('region', { name: 'Memories about Mira' });
        await expect(aboutMira.getByRole('heading')).toHaveText('About Mira (1)');
        await expect(aboutMira.getByRole('listitem')).toHaveCount(1);
        await expect(aboutMira.locator(`li[data-memory-id="${lamp}"]`)).toContainText('Ash gave Mira the lamp.');
        await expect(aboutMira).toContainText('Faded dots are the Memory Mira doesn’t know.');
        await expect(dot(lamp)).toHaveAttribute('data-state', 'about');
        await expect(dot(boat)).toHaveAttribute('data-state', 'other');
        await expect(dot(storm)).toHaveAttribute('data-state', 'unknown');

        // A tap on empty space clears the pick.
        await graph.tap({ position: { x: 3, y: 3 } });
        await expect(aboutMira).toHaveCount(0);
        await expect(drawer).toContainText('Tap a person to see the Memories about them');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a tapped Memory dot opens its card under the graph, where it is edited and deleted; Graph stays chosen after a reload', async ({
    page,
    request,
}) => {
    const { storyId, chatId, boat } = await createChatWithMemories(request);

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        let drawer = await openMemory(page);
        await drawer.getByRole('radio', { name: 'Graph' }).tap();
        const graph = drawer.getByRole('group', { name: 'Memory graph' });
        const boatDot = graph.locator(`g[data-memory-id="${boat}"]`);

        await boatDot.tap();
        await expect(boatDot).toHaveAttribute('aria-pressed', 'true');
        const card = drawer.getByRole('list', { name: 'Picked Memory' }).locator(`li[data-memory-id="${boat}"]`);
        await expect(card).toContainText('Jonah mended the boat.');

        // An edit that names Mira links the dot to her too, and locks the Memory.
        await card.getByRole('button', { name: 'Edit' }).click();
        await card.getByRole('textbox', { name: 'Memory text' }).fill('Jonah mended the boat with Mira.');
        await expect(drawer.getByRole('status').filter({ hasText: /Sav|save/ })).toHaveText('Saved');
        await card.getByRole('button', { name: 'Done' }).click();
        await expect(card).toContainText('Jonah mended the boat with Mira.');
        await expect(card).toContainText('Locked');
        await expect(graph.getByRole('button', { name: 'Mira, 2 Memories' })).toBeVisible();
        await expect(boatDot).toHaveAccessibleName('Jonah mended the boat with Mira. About Mira, Jonah.');

        // Delete from the card: the dot goes.
        await card.getByRole('button', { name: 'Delete' }).click();
        await card.getByRole('button', { name: 'Delete' }).click();
        await expect(boatDot).toHaveCount(0);
        await expect(graph.locator('g[data-memory-id]')).toHaveCount(2);
        await expect(drawer.getByRole('list', { name: 'Picked Memory' })).toHaveCount(0);

        // Graph is this device's choice now.
        await page.reload();
        drawer = await openMemory(page);
        await expect(drawer.getByRole('radio', { name: 'Graph' })).toHaveAttribute('aria-checked', 'true');
        await expect(drawer.getByRole('group', { name: 'Memory graph' })).toBeVisible();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});
