import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// Read aloud (.scratch/read-aloud/spec.md, "Testing Decisions"): 390px wide, with the fake
// gateway. Chromium plays without a gesture (playwright.config.ts), so these tests follow the
// player's states rather than real sound.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** The Stories a test made, removed after it so the shared e2e database is left as it was found. */
const madeStories: number[] = [];

test.afterEach(async ({ request }) => {
    while (madeStories.length > 0) await request.delete(`/api/stories/${madeStories.pop()}`);
    await request.delete('/api/testing/fake-gateway');
});

interface SpeechCall {
    method: 'synthesizeSpeech';
    request: { kind: 'read_aloud' | 'voice_preview'; text: string; voice: string };
}

async function speechCalls(request: APIRequestContext): Promise<SpeechCall['request'][]> {
    const body = await (await request.get('/api/testing/fake-gateway/calls')).json();
    return body.calls.filter((call: { method: string }) => call.method === 'synthesizeSpeech').map((call: SpeechCall) => call.request);
}

/** Silent MPEG frames (as the fake's FAKE_MP3, longer): about 26 ms each. */
function silentMp3Base64(seconds: number): string {
    const frame = Buffer.alloc(104);
    frame.set([0xff, 0xfb, 0x10, 0xc0]);
    return Buffer.concat(Array.from({ length: Math.ceil(seconds / 0.026) }, () => frame)).toString('base64');
}

async function scriptSpeech(request: APIRequestContext, kind: 'read_aloud' | 'voice_preview', replies: unknown[]): Promise<void> {
    const scripted = await request.post('/api/testing/fake-gateway/speech', { data: { kind, replies } });
    expect(scripted.ok()).toBe(true);
}

async function createStory(request: APIRequestContext): Promise<number> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    madeStories.push(storyId);
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Mira', voice: 'Short sentences.' } });
    await request.delete('/api/testing/fake-gateway');
    return storyId;
}

async function expectSaved(page: Page) {
    await expect(page.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');
}

test.describe('voices in the Story editor', () => {
    test('a Narration voice and a Speaking voice autosave and survive a reload', async ({ page, request }) => {
        const storyId = await createStory(request);

        await page.goto(`/stories/${storyId}?tab=style`);
        const narration = page.getByLabel('Narration voice', { exact: true });
        await expect(narration).toHaveValue('');
        await expect(narration.locator('option:checked')).toHaveText('Default (Sky)');
        await expect(narration.locator('optgroup').first()).toHaveAttribute('label', 'American, female');
        await expect(narration.locator('optgroup')).toHaveCount(4);
        await narration.selectOption({ label: 'George' });
        await expectSaved(page);

        await page.getByRole('tab', { name: /^Characters/ }).click();
        const speaking = page.getByLabel('Speaking voice', { exact: true });
        await expect(speaking.locator('option:checked')).toHaveText('Same as narration');
        await speaking.selectOption({ label: 'Emma' });
        await expectSaved(page);

        await page.reload();
        await expect(page.getByLabel('Speaking voice', { exact: true })).toHaveValue('bf_emma');
        await page.getByRole('tab', { name: /^Style/ }).click();
        await expect(page.getByLabel('Narration voice', { exact: true })).toHaveValue('bm_george');
        const story = await (await request.get(`/api/stories/${storyId}`)).json();
        expect(story.narrationVoice).toBe('bm_george');
        expect(story.characters[0].speakingVoice).toBe('bf_emma');

        // Back to the default.
        await page.getByLabel('Narration voice', { exact: true }).selectOption({ label: 'Default (Sky)' });
        await expectSaved(page);
        expect((await (await request.get(`/api/stories/${storyId}`)).json()).narrationVoice).toBeNull();
    });

    test('▶ Sample plays the voice, and a second tap makes no call', async ({ page, request }) => {
        const storyId = await createStory(request);
        await scriptSpeech(request, 'voice_preview', [{ audioBase64: silentMp3Base64(1.5) }]);

        await page.goto(`/stories/${storyId}?tab=style`);
        await expect(page.getByText('A sample costs a fraction of a cent, once per voice')).toBeVisible();
        await page.getByLabel('Narration voice', { exact: true }).selectOption({ label: 'Adam' });
        const sample = page.getByRole('button', { name: 'Sample Narration voice' });
        await sample.click();
        await expect(page.getByRole('button', { name: 'Playing Narration voice: tap to stop' })).toHaveText('Playing…');
        await expect(sample).toHaveText('Sample');
        expect(await speechCalls(request)).toEqual([
            { kind: 'voice_preview', text: 'The lamp went out an hour ago, and the sea kept talking.', voice: 'am_adam' },
        ]);

        await sample.click();
        await expect(page.getByRole('button', { name: 'Playing Narration voice: tap to stop' })).toBeVisible();
        await expect(sample).toHaveText('Sample');
        expect(await speechCalls(request)).toHaveLength(1);

        // "Same as narration" samples the Narration voice: kept, so no call either.
        await page.getByRole('tab', { name: /^Characters/ }).click();
        await page.getByRole('button', { name: 'Sample Speaking voice' }).click();
        await expect(page.getByRole('button', { name: 'Sample Speaking voice' })).toHaveText('Sample');
        expect(await speechCalls(request)).toHaveLength(1);
    });

    test('a failed sample says why under the field', async ({ page, request }) => {
        const storyId = await createStory(request);
        await scriptSpeech(request, 'voice_preview', [{ error: 'out_of_credit', pool: 'image' }]);

        await page.goto(`/stories/${storyId}?tab=style`);
        await page.getByRole('button', { name: 'Sample Narration voice' }).click();

        await expect(page.getByRole('alert').filter({ hasText: "Couldn't play" })).toHaveText("Couldn't play a sample: out of Venice credit.");
    });
});

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: *smiles* Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';

/** A playable Story (Mira reads in Emma's voice) and a Chat on its Opening, all through the API. */
async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const storyId = await createStory(request);
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    const story = await (await request.get(`/api/stories/${storyId}`)).json();
    await request.patch(`/api/stories/${storyId}/characters/${story.characters[0].id}`, {
        data: { appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', speakingVoice: 'bf_emma' },
    });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

async function scriptTurns(request: APIRequestContext, ...replies: unknown[]): Promise<void> {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: replies.map(() => NO_CHANGE) } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: replies.map(() => NO_OPS) } });
}

/** A turn played through the API, its background calls settled. */
async function playTurn(request: APIRequestContext, storyId: number, chatId: number, text: string, reply: string): Promise<void> {
    await scriptTurns(request, { text: reply, model: 'glm-5.3' });
    expect((await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text } })).ok()).toBe(true);
    await expect
        .poll(async () => (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).messages.at(-1).judge.status)
        .toBe('done');
}

/** Each item answers with this much silence, so the player's states can be watched. */
async function scriptReadings(request: APIRequestContext, count: number, seconds: number): Promise<void> {
    await scriptSpeech(
        request,
        'read_aloud',
        Array.from({ length: count }, () => ({ audioBase64: silentMp3Base64(seconds) })),
    );
}

/** Taps an action in a row of actions, through its ⋯ overflow when it didn't fit. */
async function tapAction(group: Locator, name: string): Promise<void> {
    const action = group.getByRole('button', { name, exact: true });
    if (!(await action.isVisible())) await group.getByRole('button', { name: 'More actions' }).tap();
    await action.tap();
}

/** An action is offered in a row: in sight, or behind its ⋯ (which this opens). */
async function expectAction(group: Locator, name: string): Promise<void> {
    const action = group.getByRole('button', { name, exact: true });
    if (!(await action.isVisible())) await group.getByRole('button', { name: 'More actions' }).tap();
    await expect(action).toBeVisible();
}

/** Neither the row nor the page runs past the screen sideways. */
async function expectNoOverflow(page: Page, group: Locator): Promise<void> {
    await expect(group).toBeVisible();
    const sizes = await group.evaluate((row) => ({ scroll: row.scrollWidth, client: row.clientWidth, right: row.getBoundingClientRect().right }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
    expect(sizes.right).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
}

test.describe('reading a Message aloud', () => {
    test('▶ Read aloud highlights the first part, then the next, in their voices, and ends idle', async ({ page, request }) => {
        const { storyId, chatId } = await createChat(request);
        await scriptReadings(request, 3, 0.8);

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const opening = page.getByRole('article', { name: 'Opening' });
        await tapAction(page.getByRole('group', { name: 'Message actions' }), 'Read aloud');

        const now = opening.locator('[aria-current="true"]');
        await expect(now).toHaveText('The lamp went out an hour ago.');
        await expect(opening.getByRole('group', { name: 'Reading aloud' }).getByRole('button', { name: 'Pause' })).toBeVisible();
        await expect(now).toContainText('Boots off, keeper.');
        await expect(now).toHaveCount(1);

        // Ends idle: the controls go and ▶ Read aloud is back.
        await expect(opening.getByRole('group', { name: 'Reading aloud' })).toHaveCount(0);
        await expect(now).toHaveCount(0);
        expect(await speechCalls(request)).toEqual([
            expect.objectContaining({ kind: 'read_aloud', text: 'The lamp went out an hour ago.', voice: 'af_sky' }),
            expect.objectContaining({ kind: 'read_aloud', text: 'smiles', voice: 'af_sky' }),
            expect.objectContaining({ kind: 'read_aloud', text: 'Boots off, keeper.', voice: 'bf_emma' }),
        ]);

        // ▶ Read aloud is back, and a second play of the same words costs nothing.
        await tapAction(page.getByRole('group', { name: 'Message actions' }), 'Read aloud');
        await expect(opening.getByRole('group', { name: 'Reading aloud' })).toBeVisible();
        await expect(opening.getByRole('group', { name: 'Reading aloud' })).toHaveCount(0);
        expect(await speechCalls(request)).toHaveLength(3);
    });

    test('Pause and Resume keep the place, and Stop ends it', async ({ page, request }) => {
        const { storyId, chatId } = await createChat(request);
        await scriptReadings(request, 3, 1.5);

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const opening = page.getByRole('article', { name: 'Opening' });
        await tapAction(page.getByRole('group', { name: 'Message actions' }), 'Read aloud');
        const controls = opening.getByRole('group', { name: 'Reading aloud' });
        const now = opening.locator('[aria-current="true"]');

        await controls.getByRole('button', { name: 'Pause' }).tap();
        await expect(controls.getByRole('button', { name: 'Resume' })).toBeVisible();
        await expect(now).toHaveText('The lamp went out an hour ago.');
        // Longer than the item: a paused reading stays where it was.
        await page.waitForTimeout(2_000);
        await expect(now).toHaveText('The lamp went out an hour ago.');

        await controls.getByRole('button', { name: 'Resume' }).tap();
        await expect(controls.getByRole('button', { name: 'Pause' })).toBeVisible();
        await expect(now).toContainText('Boots off, keeper.');

        await controls.getByRole('button', { name: 'Stop' }).tap();
        await expect(controls).toHaveCount(0);
        await expect(now).toHaveCount(0);
    });

    test('▶ on an older Message stops the one playing', async ({ page, request }) => {
        const { storyId, chatId } = await createChat(request);
        await playTurn(request, storyId, chatId, 'I set my boots by the door.', 'Mira grunts.\n\nThe wind drops.');
        await scriptReadings(request, 5, 3);

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const reply = page.getByRole('article', { name: 'AI reply' });
        await tapAction(reply.getByRole('group', { name: 'Message actions' }), 'Read aloud');
        await expect(reply.getByRole('group', { name: 'Reading aloud' }).getByRole('button', { name: 'Pause' })).toBeVisible();
        await expect(reply.locator('[aria-current="true"]')).toHaveText('Mira grunts.');

        const opening = page.getByRole('article', { name: 'Opening' });
        await opening.tap();
        const tools = opening.getByRole('group', { name: 'Message tools' });
        await tapAction(tools, 'Read aloud');

        await expect(reply.getByRole('group', { name: 'Reading aloud' })).toHaveCount(0);
        await expect(reply.locator('[aria-current="true"]')).toHaveCount(0);
        await expect(opening.locator('[aria-current="true"]')).toHaveText('The lamp went out an hour ago.');
        await opening.getByRole('group', { name: 'Reading aloud' }).getByRole('button', { name: 'Stop' }).tap();
    });

    test('Read aloud is not offered on a reply still being written', async ({ page, request }) => {
        const { storyId, chatId } = await createChat(request);
        await scriptTurns(request, { text: 'Mira grunts and turns to the stairs without a word.', model: 'glm-5.3', pieceSize: 4, pieceDelayMs: 80 });

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByRole('textbox', { name: 'Write as Ash' }).fill('I set my boots by the door.');
        await page.getByRole('button', { name: 'Send', exact: true }).tap();

        const streaming = page.locator('article[aria-busy="true"][aria-label="AI reply"]');
        await expect(streaming).toContainText('Mira');
        await expect(page.getByRole('button', { name: 'Read aloud', exact: true })).toHaveCount(0);
        await expect(page.getByRole('status').filter({ hasText: 'Writing…' })).toHaveCount(0, { timeout: 20_000 });
        await expect(page.getByRole('article', { name: 'AI reply' }).getByRole('group', { name: 'Message actions' })).toBeVisible();
    });

    test("at 390px the action row and a tapped Message's tools don't overflow, with ▶ Read aloud in them", async ({ page, request }) => {
        const { storyId, chatId } = await createChat(request);
        await playTurn(request, storyId, chatId, 'I set my boots by the door.', 'Mira grunts.');
        await scriptTurns(request, { text: 'Mira shrugs.', model: 'glm-5.3' });
        const chat = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
        // ↺ Again once, so the row holds the most it can.
        expect((await request.post(`/api/stories/${storyId}/chats/${chatId}/messages/${chat.messages.at(-1).id}/regenerate`)).ok()).toBe(true);

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const actions = page.getByRole('group', { name: 'Message actions' });
        await expect(actions.getByRole('group', { name: 'Reply versions' })).toBeVisible();
        await expectNoOverflow(page, actions);
        await expectAction(actions, 'Read aloud');
        await page.getByRole('heading', { name: 'Chat 1', exact: true }).tap();

        const opening = page.getByRole('article', { name: 'Opening' });
        await opening.tap();
        const tools = opening.getByRole('group', { name: 'Message tools' });
        await expectNoOverflow(page, tools);
        // ✎ Edit · ▶ · ไทย · ⑂, in that order, some of them maybe behind ⋯.
        const names = await tools.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.textContent));
        expect(names.filter((name) => name !== '⋯')).toEqual(['✎Edit', '▶Read aloud', 'ไทย', '⑂Branch'].slice(0, names.filter((name) => name !== '⋯').length));
        await tapAction(tools, 'Read aloud');
        await expect(opening.getByRole('group', { name: 'Reading aloud' })).toBeVisible();
        await expectNoOverflow(page, opening.getByRole('group', { name: 'Reading aloud' }));

        // A User Message has no ▶.
        const said = page.getByRole('article', { name: 'Ash said' });
        await said.tap();
        const userTools = said.getByRole('group', { name: 'Message tools' });
        await expect(userTools).toBeVisible();
        if (await userTools.getByRole('button', { name: 'More actions' }).isVisible()) await userTools.getByRole('button', { name: 'More actions' }).tap();
        await expect(userTools.getByRole('button', { name: 'Read aloud', exact: true })).toHaveCount(0);
    });
});

test.describe('Read replies aloud', () => {
    async function send(page: Page, text: string): Promise<void> {
        await page.getByRole('textbox', { name: 'Write as Ash' }).fill(text);
        await page.getByRole('button', { name: 'Send', exact: true }).tap();
    }

    async function setSwitch(page: Page, on: boolean): Promise<void> {
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        const menu = page.getByRole('dialog', { name: 'Chat menu' });
        const toggle = menu.getByRole('switch', { name: /Read replies aloud/ });
        await expect(toggle).toHaveAccessibleName(/New replies play by themselves/);
        if ((await toggle.getAttribute('aria-checked')) !== String(on)) await toggle.tap();
        await expect(toggle).toHaveAttribute('aria-checked', String(on));
        await page.keyboard.press('Escape');
        await expect(menu).toHaveCount(0);
    }

    test('with it on, a send plays the new reply once it settles, and opening the Chat again plays nothing', async ({ page, request }) => {
        const { storyId, chatId } = await createChat(request);
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        // The switch is the menu's last row before Reset, after Who's in this Chat.
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        const rows = page.getByRole('dialog', { name: 'Chat menu' }).locator('button, a');
        const labels = await rows.evaluateAll((items) => items.map((item) => item.textContent ?? ''));
        const at = labels.findIndex((label) => label.startsWith('Read replies aloud'));
        expect(labels[at - 1]).toMatch(/^Who's in this Chat/);
        expect(labels.slice(at + 1).every((label) => /^Reset Chat/.test(label))).toBe(true);
        await page.keyboard.press('Escape');

        await setSwitch(page, true);
        expect((await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).autoRead).toBe(true);
        await scriptTurns(request, { text: 'Mira grunts.\n\nThe wind drops.', model: 'glm-5.3', pieceSize: 6, pieceDelayMs: 30 });
        await scriptReadings(request, 2, 0.6);

        await send(page, 'I set my boots by the door.');

        const reply = page.getByRole('article', { name: 'AI reply' });
        await expect(reply.locator('[aria-current="true"]')).toHaveText('Mira grunts.');
        await expect(reply.locator('[aria-current="true"]')).toHaveText('The wind drops.');
        await expect(reply.getByRole('group', { name: 'Reading aloud' })).toHaveCount(0);
        expect((await speechCalls(request)).map(({ kind, text }) => [kind, text])).toEqual([
            ['read_aloud', 'Mira grunts.'],
            ['read_aloud', 'The wind drops.'],
        ]);

        // Opening the Chat again is quiet.
        await page.reload();
        await expect(page.getByRole('article', { name: 'AI reply' })).toBeVisible();
        await page.waitForTimeout(1_000);
        await expect(page.locator('[aria-current="true"]')).toHaveCount(0);
        await expect(page.getByRole('group', { name: 'Reading aloud' })).toHaveCount(0);
        expect(await speechCalls(request)).toHaveLength(2);
    });

    test('choosing another Reply version plays nothing', async ({ page, request }) => {
        const { storyId, chatId } = await createChat(request);
        await playTurn(request, storyId, chatId, 'I set my boots by the door.', 'Mira grunts.');
        await scriptTurns(request, { text: 'Mira shrugs.', model: 'glm-5.3' });
        const chat = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
        expect((await request.post(`/api/stories/${storyId}/chats/${chatId}/messages/${chat.messages.at(-1).id}/regenerate`)).ok()).toBe(true);
        await request.patch(`/api/stories/${storyId}/chats/${chatId}`, { data: { autoRead: true } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const versions = page.getByRole('group', { name: 'Reply versions' });
        await versions.getByRole('button', { name: 'Previous version' }).tap();
        await expect(versions).toContainText('1/2');
        await expect(page.getByRole('article', { name: 'AI reply' })).toContainText('Mira grunts.');

        await page.waitForTimeout(1_000);
        await expect(page.getByRole('group', { name: 'Reading aloud' })).toHaveCount(0);
        expect(await speechCalls(request)).toEqual([]);
    });

    test('with it off, a send records no speech call', async ({ page, request }) => {
        const { storyId, chatId } = await createChat(request);
        await scriptTurns(request, { text: 'Mira grunts.', model: 'glm-5.3' });

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await send(page, 'I set my boots by the door.');

        await expect(page.getByRole('article', { name: 'AI reply' })).toContainText('Mira grunts.');
        await expect(page.getByRole('status').filter({ hasText: 'Writing…' })).toHaveCount(0);
        await page.waitForTimeout(1_000);
        await expect(page.getByRole('group', { name: 'Reading aloud' })).toHaveCount(0);
        expect(await speechCalls(request)).toEqual([]);
    });
});

test('the Usage page lists Read aloud and Voice samples under "Images and audio (Venice)"', async ({ page }) => {
    const pool = (byKind: object[]) => ({
        spentUsd: 0.05,
        calls: 3,
        byKind,
        remainingUsd: 8,
        capUsd: 8,
        lowCreditPercent: 20,
        lowCredit: false,
    });
    await page.route('**/api/usage', (route) =>
        route.fulfill({
            json: {
                month: '2026-11',
                pools: {
                    text: pool([]),
                    image: pool([
                        { kind: 'snapshot_image', spentUsd: 0.05, calls: 1 },
                        { kind: 'read_aloud', spentUsd: 0.0031, calls: 4 },
                        { kind: 'voice_preview', spentUsd: 0.0002, calls: 1 },
                    ]),
                },
            },
        }),
    );

    await page.goto('/usage');
    await expect(page.getByRole('heading', { name: 'Images and audio (Venice)', exact: true })).toBeVisible();
    const kinds = page.getByRole('list', { name: 'Images and audio (Venice) spend by kind' }).getByRole('listitem');
    await expect(kinds).toHaveText([
        'Snapshots: $0.05 (1 call)',
        'Read aloud: <$0.01 (4 calls)',
        'Voice samples: <$0.01 (1 call)',
    ]);

    await page.goto('/settings');
    await expect(page.getByLabel('Images and audio (Venice) pool (USD)')).toBeVisible();
    await expect(page.getByLabel('Images and audio (Venice) warning (%)')).toBeVisible();
});
