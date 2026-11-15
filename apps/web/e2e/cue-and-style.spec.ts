import { APIRequestContext, expect, Page, test } from '@playwright/test';

// The Cue (CONTEXT.md) and the Style controls (.scratch/style-controls/spec.md), on a phone.
// A Cue is a few words to the Narrator for the next reply only: it goes with the next Send,
// Continue, Retry or Again, shows until it is used, and is never part of the story.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';

async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse', setting: 'A lighthouse on a storm-cut island.', opening: OPENING } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short sentences.' } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

/** One turn reply with background calls that change nothing; `turn` may be a scripted failure. */
async function scriptTurn(request: APIRequestContext, turn: string | object) {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [typeof turn === 'string' ? { text: turn, model: 'glm-5.3' } : turn] } });
    if (typeof turn !== 'string') return;
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
}

/** The Cue each turn request carried, in order; null for none. */
function watchCues(page: Page): Array<string | null> {
    const sent: Array<string | null> = [];
    page.on('request', (request) => {
        if (request.method() === 'GET' || !/\/(messages|continue|retry|regenerate)$/.test(new URL(request.url()).pathname)) return;
        const body = request.postData();
        sent.push(body ? ((JSON.parse(body).cue as string | undefined) ?? null) : null);
    });
    return sent;
}

/** The last turn's closing message, as the API sent it to the model. */
async function lastTurnTrailing(request: APIRequestContext): Promise<string> {
    const { calls } = (await (await request.get('/api/testing/fake-gateway/calls')).json()) as {
        calls: Array<{ request: { kind?: string; messages?: Array<{ content: string }> } }>;
    };
    return calls.filter((call) => call.request?.kind === 'turn').at(-1)!.request.messages!.at(-1)!.content;
}

async function setCue(page: Page, text: string, button = 'Use for the next reply') {
    await page.getByRole('form', { name: 'Composer' }).getByRole('button', { name: 'Cue the Narrator' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Cue the Narrator' });
    await expect(sheet.getByRole('textbox', { name: 'Cue' })).toBeFocused();
    await sheet.getByRole('textbox', { name: 'Cue' }).fill(text);
    await sheet.getByRole('button', { name: button }).tap();
    await expect(sheet).toHaveCount(0);
}

test('a Cue shows until it is used: it rides on the next Send, reaches the Narrator, and is gone once the reply is in', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await request.delete('/api/testing/fake-gateway');
    await scriptTurn(request, '@Mira: Out. Now.');
    const cues = watchCues(page);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        const chip = composer.getByRole('button', { name: 'Cue the Narrator' });
        await expect(chip).toHaveAttribute('aria-pressed', 'false');
        await expect(composer.getByRole('group', { name: 'Cue for the next reply' })).toHaveCount(0);

        await setCue(page, 'Make Mira angrier.');
        const line = composer.getByRole('group', { name: 'Cue for the next reply' });
        await expect(line).toContainText('Make Mira angrier.');
        await expect(chip).toHaveAttribute('aria-pressed', 'true');
        // Nothing is wider than the phone with the line and the fifth tool in.
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

        await composer.getByRole('textbox', { name: 'Write as Ash' }).fill('I look around.');
        await composer.getByRole('button', { name: 'Send' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Out. Now.');
        await expect(line).toHaveCount(0);
        await expect(chip).toHaveAttribute('aria-pressed', 'false');
        expect(cues).toEqual(['Make Mira angrier.']);

        const trailing = await lastTurnTrailing(request);
        expect(trailing).toContain("The user's cue for this reply only: Make Mira angrier.");
        expect(trailing.indexOf('cue for this reply only')).toBeLessThan(trailing.indexOf('Write the next turn now.'));
        // The Cue is not a Message, and no Message holds it.
        const chat = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
        expect(chat.messages).toHaveLength(3);
        expect(JSON.stringify(chat.messages)).not.toContain('angrier');

        // The next turn has none.
        await scriptTurn(request, 'The wind rises.');
        await composer.getByRole('button', { name: 'Continue' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('The wind rises.');
        expect(cues).toEqual(['Make Mira angrier.', null]);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a failed turn keeps the Cue for Retry; "Again with this Cue" writes the reply again at once; Clear takes a Cue back', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await request.delete('/api/testing/fake-gateway');
    await scriptTurn(request, { error: 'outage', message: 'DeepInfra answered 503.' });
    const cues = watchCues(page);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        const line = composer.getByRole('group', { name: 'Cue for the next reply' });

        await setCue(page, 'She answers from upstairs.');
        await composer.getByRole('textbox', { name: 'Write as Ash' }).fill('Hello?');
        await composer.getByRole('button', { name: 'Send' }).tap();
        await expect(page.getByText('The last turn failed. Your message is kept.')).toBeVisible();
        await expect(line).toContainText('She answers from upstairs.');

        await scriptTurn(request, '@Mira: Up here.');
        await page.getByRole('button', { name: 'Retry', exact: true }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Up here.');
        await expect(line).toHaveCount(0);
        expect(cues).toEqual(['She answers from upstairs.', 'She answers from upstairs.']);

        // From the sheet, Again runs at once with the Cue, and the reply is written in place.
        await scriptTurn(request, '@Mira: Up here, and hurry.');
        await setCue(page, 'More urgent.', 'Again with this Cue');
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Up here, and hurry.');
        await expect(line).toHaveCount(0);
        expect(cues.at(-1)).toBe('More urgent.');
        expect(await lastTurnTrailing(request)).toContain("The user's cue for this reply only: More urgent.");

        // A Cue set and then cleared sends nothing.
        await setCue(page, 'Never mind.');
        await expect(line).toContainText('Never mind.');
        await line.getByRole('button', { name: 'Clear the Cue' }).tap();
        await expect(line).toHaveCount(0);
        await scriptTurn(request, 'Rain on the glass.');
        await composer.getByRole('button', { name: 'Continue' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Rain on the glass.');
        expect(cues.at(-1)).toBeNull();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the Style tab sets Pacing, Dialogue or action and Difficulty; they are kept, and the next turn tells the Narrator', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await request.delete('/api/testing/fake-gateway');
    try {
        await page.goto(`/stories/${storyId}?tab=style`);
        const style = page.getByRole('region', { name: 'Style' });
        const choose = async (group: string, from: string, to: string) => {
            const radios = style.getByRole('radiogroup', { name: group });
            await expect(radios.getByRole('radio', { name: from })).toBeChecked();
            await radios.getByRole('radio', { name: to }).tap();
            await expect(radios.getByRole('radio', { name: to })).toBeChecked();
        };
        // A new Story starts at the middle of each.
        await choose('Pacing', 'Natural', 'Slow burn');
        await choose('Dialogue or action', 'Balanced', 'More dialogue');
        await choose('Difficulty', 'Normal', 'Hard');
        await expect(page.getByText('Saved', { exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

        await expect
            .poll(async () => (await (await request.get(`/api/stories/${storyId}`)).json()).style)
            .toMatchObject({ pacing: 'slow', balance: 'dialogue', difficulty: 'hard' });
        await page.reload();
        await expect(style.getByRole('radiogroup', { name: 'Pacing' }).getByRole('radio', { name: 'Slow burn' })).toBeChecked();
        await expect(style.getByRole('radiogroup', { name: 'Difficulty' }).getByRole('radio', { name: 'Hard' })).toBeChecked();

        await scriptTurn(request, '@Mira: Hm.');
        const sent = await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'I look around.' } });
        expect(sent.ok()).toBe(true);
        const { calls } = (await (await request.get('/api/testing/fake-gateway/calls')).json()) as {
            calls: Array<{ request: { kind?: string; messages?: Array<{ content: string }> } }>;
        };
        const system = calls.filter((call) => call.request?.kind === 'turn').at(-1)!.request.messages![0].content;
        expect(system).toContain('- Pacing: slow burn.');
        expect(system).toContain('- Lean on dialogue:');
        expect(system).toContain('- The world is hard: what Ash attempts can fail');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});
