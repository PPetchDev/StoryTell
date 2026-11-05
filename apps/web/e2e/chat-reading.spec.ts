import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// The Chat is read on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';

/** An Opening long enough to fill several phone screens. */
const LONG_OPENING = Array.from(
    { length: 24 },
    (_, n) => `Paragraph ${n + 1}: the storm leans on the lighthouse and the stairs groan under the wet boots of the night.`,
).join('\n\n');

/** A playable Story with the given cast, made through the API. */
async function createStory(request: APIRequestContext, opening: string, cast: string[] = ['Mira']): Promise<number> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening },
    });
    await request.patch(`/api/stories/${storyId}/role`, {
        data: { name: 'Ash', description: 'The new keeper, arrived this morning.' },
    });
    for (const name of cast) {
        await request.post(`/api/stories/${storyId}/characters`, {
            data: { name, appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
        });
    }
    return storyId;
}

async function createChat(request: APIRequestContext, storyId: number): Promise<number> {
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return (await chat.json()).id as number;
}

/** Scripts the fake for `turns` turns, each with background calls that change nothing. */
async function scriptTurns(request: APIRequestContext, replies: string[]): Promise<void> {
    await request.delete('/api/testing/fake-gateway');
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'turn', replies: replies.map((text) => ({ text, model: 'glm-5.3' })) },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: replies.map(() => NO_CHANGE) } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: replies.map(() => NO_OPS) } });
}

/** True when the whole element shows inside the thread, above the composer. */
async function expectFullyAboveComposer(page: Page, element: Locator): Promise<void> {
    await expect(element).toBeInViewport({ ratio: 1 });
    await expect
        .poll(async () => {
            const box = await element.boundingBox();
            const composer = await page.getByRole('form', { name: 'Composer' }).boundingBox();
            return box !== null && composer !== null && box.y + box.height <= composer.y;
        })
        .toBe(true);
}

test('opening a long Chat shows the newest reply fully above the composer', async ({ page, request }) => {
    const storyId = await createStory(request, LONG_OPENING);
    await scriptTurns(request, ['She points at the stairs.\n\n@Mira: The lamp room is up there.']);
    const chatId = await createChat(request, storyId);
    const sent = await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'Where is the lamp room?' } });
    expect(sent.ok()).toBe(true);

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const reply = page.getByRole('article', { name: 'AI reply' });
        await expect(reply).toContainText('The lamp room is up there.');
        await expectFullyAboveComposer(page, reply);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('after Send the composer is empty and the line shows before the reply, which then comes into view', async ({ page, request }) => {
    const storyId = await createStory(request, LONG_OPENING);
    await scriptTurns(request, ['She points at the stairs.\n\n@Mira: The lamp room is up there.']);
    const chatId = await createChat(request, storyId);

    // Hold the turn back until the test has looked at the screen.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(`**/api/stories/${storyId}/chats/${chatId}/messages`, async (route) => {
        await held;
        await route.continue();
    });

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const box = page.getByLabel('Write as Ash');
        await box.fill('*I shake off the rain.* Where is the lamp room?');
        await page.getByRole('button', { name: 'Send' }).click();

        await expect(box).toHaveValue('');
        const said = page.getByRole('article', { name: 'Ash said' });
        await expect(said).toContainText('Where is the lamp room?');
        // An *action* reads in italics, without its asterisks.
        await expect(said.locator('em')).toHaveText('I shake off the rain.');
        await expectFullyAboveComposer(page, said);
        const writing = page.getByRole('status').filter({ hasText: 'Writing' });
        await expectFullyAboveComposer(page, writing);
        await expect(page.getByRole('article', { name: 'AI reply' })).toHaveCount(0);

        release();
        const reply = page.getByRole('article', { name: 'AI reply' });
        await expect(reply).toContainText('The lamp room is up there.');
        await expectFullyAboveComposer(page, reply);
        await expect(said).toHaveCount(1);
        await expect(said.locator('em')).toHaveText('I shake off the rain.');
    } finally {
        release();
        await request.delete(`/api/stories/${storyId}`);
    }
});

/** The colour of a speech line's bar and of its stamped name, which must match. */
async function speakerColour(speech: Locator): Promise<string> {
    await expect(speech).toBeVisible();
    const bar = await speech.evaluate((element) => getComputedStyle(element).borderLeftColor);
    const name = await speech.locator('p').first().evaluate((element) => getComputedStyle(element).color);
    expect(name).toBe(bar);
    return bar;
}

test("each Character's speech has its own colour, the same in every Chat of the Story", async ({ page, request }) => {
    // Kai speaks first in the Opening, but Mira comes first in the cast.
    const storyId = await createStory(request, 'The door bangs open.\n\n@Kai: Welcome, keeper!\n\n@Mira: Hush.', ['Mira', 'Kai']);
    const firstChat = await createChat(request, storyId);
    const secondChat = await createChat(request, storyId);
    await scriptTurns(request, ['@Mira: You again.']);
    const sent = await request.post(`/api/stories/${storyId}/chats/${secondChat}/messages`, { data: { text: 'I wave.' } });
    expect(sent.ok()).toBe(true);

    try {
        await page.goto(`/stories/${storyId}/chats/${firstChat}`);
        const opening = page.getByRole('article', { name: 'Opening' });
        const mira = await speakerColour(opening.getByRole('group', { name: 'Mira', exact: true }));
        const kai = await speakerColour(opening.getByRole('group', { name: 'Kai', exact: true }));
        expect(mira).not.toBe(kai);

        await page.goto(`/stories/${storyId}/chats/${secondChat}`);
        const reply = page.getByRole('article', { name: 'AI reply' });
        expect(await speakerColour(reply.getByRole('group', { name: 'Mira', exact: true }))).toBe(mira);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the text size chosen in Settings sizes the story text on this device, and survives a reload', async ({ page, request }) => {
    const storyId = await createStory(request, 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.');
    const chatId = await createChat(request, storyId);
    const fontSize = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).fontSize);

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const narration = page.getByRole('article', { name: 'Opening' }).getByText('The lamp went out an hour ago.');
        const composer = page.getByLabel('Write as Ash');
        await expect(narration).toBeVisible();
        const medium = await fontSize(narration);
        const controls = await fontSize(composer);

        await page.goto('/settings');
        const sizes = page.getByRole('radiogroup', { name: 'Text size' });
        await expect(sizes.getByRole('radio', { name: 'Medium' })).toBeChecked();
        await sizes.getByRole('radio', { name: 'Large' }).check();

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await expect(narration).toBeVisible();
        const large = await fontSize(narration);
        expect(parseFloat(large)).toBeGreaterThan(parseFloat(medium));
        // Story text only: the controls keep their size.
        expect(await fontSize(composer)).toBe(controls);

        await page.reload();
        await expect(narration).toBeVisible();
        expect(await fontSize(narration)).toBe(large);

        await page.goto('/settings');
        await expect(page.getByRole('radiogroup', { name: 'Text size' }).getByRole('radio', { name: 'Large' })).toBeChecked();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('saving an edit to the newest reply brings the end back into view', async ({ page, request }) => {
    const storyId = await createStory(request, LONG_OPENING);
    await scriptTurns(request, ['She points at the stairs.']);
    // The edit runs the reply's background calls again.
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    const chatId = await createChat(request, storyId);
    const sent = await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'Where is the lamp room?' } });
    expect(sent.ok()).toBe(true);

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const reply = page.getByRole('article', { name: 'AI reply' });
        await reply.getByRole('button', { name: 'Edit' }).click();
        await page.getByRole('textbox', { name: 'Message text' }).fill('She points at the stairs.\n\nThe last step is missing.');
        // Read back up the Chat, then save without scrolling to the button.
        await page.getByRole('region', { name: 'Messages' }).evaluate((thread) => (thread.scrollTop = 0));
        await page.getByRole('button', { name: 'Save' }).evaluate((button: HTMLButtonElement) => button.click());

        const edited = reply.getByText('The last step is missing.');
        await expect(edited).toBeVisible();
        await expectFullyAboveComposer(page, edited);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});
