import { APIRequestContext, expect, Page, test } from '@playwright/test';

// Endings (.scratch/endings/spec.md), on a phone. An Ending is the author's: when what it says has
// happened in a Chat, the Chat shows it and offers an Epilogue. The user can also end any story
// themselves from the Chat menu. Either way the story can be played on.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_OPS = '{"operations":[]}';

function judgement(ending?: Record<string, unknown>): string {
    return JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'nothing yet' }, ...(ending ? { ending } : {}) });
}

async function createStory(request: APIRequestContext): Promise<number> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse', setting: 'A lighthouse on a storm-cut island.', opening: OPENING } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short sentences.' } });
    return storyId;
}

async function createChat(request: APIRequestContext, storyId: number): Promise<number> {
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return (await chat.json()).id as number;
}

/** One turn reply, with what its judge says and an extraction that adds nothing. */
async function scriptTurn(request: APIRequestContext, reply: string, judge = judgement()) {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: reply, model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [judge] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
}

/**
 * The last turn's stand-in for the user's message, as the API sent it to the model: the start of
 * its closing message, before the Narrator's notes (.scratch/prompt-cache/spec.md).
 */
async function lastTurnAsked(request: APIRequestContext): Promise<string> {
    const { calls } = (await (await request.get('/api/testing/fake-gateway/calls')).json()) as {
        calls: Array<{ request: { kind?: string; messages?: Array<{ content: string }> } }>;
    };
    const closing = calls.filter((call) => call.request?.kind === 'turn').at(-1)!.request.messages!.at(-1)!.content;
    return closing.split("\n\n(The Narrator's notes follow")[0];
}

async function send(page: Page, text: string) {
    const composer = page.getByRole('form', { name: 'Composer' });
    await composer.getByRole('textbox', { name: 'Write as Ash' }).fill(text);
    await composer.getByRole('button', { name: 'Send' }).tap();
}

const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

test('a Chat that reaches an Ending shows it, writes its Epilogue on request, and plays on; the Chats page counts it', async ({ page, request }) => {
    const storyId = await createStory(request);
    await request.post(`/api/stories/${storyId}/endings`, {
        data: { name: 'The light returns', condition: 'The lamp is lit again.', epilogue: 'Tell of the first ship to pass safely.' },
    });
    await request.post(`/api/stories/${storyId}/endings`, { data: { name: 'Into the dark', condition: 'Ash leaves the island for good.' } });
    const chatId = await createChat(request, storyId);
    await request.delete('/api/testing/fake-gateway');
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const banner = page.getByRole('region', { name: 'Ending', exact: true });
        await expect(page.getByRole('article', { name: 'Opening' })).toBeVisible();
        await expect(banner).toHaveCount(0);

        await scriptTurn(request, 'The wick catches.\n\n@Mira: There. She burns.', judgement({ reason: 'Ash lit the lamp.', reached: 1 }));
        await send(page, 'I light the lamp.');
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('She burns.');

        // Reached while playing: its name and the way to its Epilogue on one row, opened to say what brought the story there.
        await expect(banner).toContainText('Ending reached');
        const named = banner.getByRole('button', { name: /The light returns/ });
        await expect(named).toHaveAttribute('aria-expanded', 'true');
        // Its name is a heading a screen reader can jump to, with the button that opens it inside.
        await expect(banner.getByRole('heading', { level: 2, name: /The light returns/ }).getByRole('button')).toHaveCount(1);
        await expect(banner).toContainText('Ash lit the lamp.');
        await expect(banner).toContainText('Writing it uses credit like one long reply.');
        await expect(banner).toHaveAttribute('data-epilogue', 'none');
        await noSidewaysScroll(page);
        // A tap folds it to its row (docs/ui-audit-2026-11-16.md H1: it was a block of 160px), and on a later visit it is the row from the start.
        await named.tap();
        await expect(named).toHaveAttribute('aria-expanded', 'false');
        await expect(banner).not.toContainText('Ash lit the lamp.');
        expect((await banner.boundingBox())!.height).toBeLessThanOrEqual(52);
        await page.reload();
        await expect(named).toHaveAttribute('aria-expanded', 'false');
        expect((await banner.boundingBox())!.height).toBeLessThanOrEqual(52);
        await expect(banner.getByRole('button', { name: 'Write the epilogue' })).toBeVisible();
        // On a short screen (the keyboard up) it gives its room to the thread, and is back when there is room.
        await page.setViewportSize({ width: 390, height: 520 });
        await expect(banner).toBeHidden();
        await expect(page.getByRole('region', { name: 'Messages' })).toBeVisible();
        expect((await page.getByRole('region', { name: 'Messages' }).boundingBox())!.height).toBeGreaterThan(150);
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(banner).toBeVisible();

        await scriptTurn(request, 'For forty winters the beam swept the reef.\n\n@Mira: Still here, keeper.');
        await banner.getByRole('button', { name: 'Write the epilogue' }).tap();
        const epilogue = page.getByRole('article', { name: 'Epilogue' });
        await expect(epilogue).toContainText('For forty winters the beam swept the reef.');
        await expect(epilogue.locator('[data-epilogue-label]')).toHaveText('Epilogue');
        const asked = await lastTurnAsked(request);
        expect(asked).toContain('The story has reached its ending: "The light returns".');
        expect(asked).toContain('What the author wants the epilogue to tell: Tell of the first ship to pass safely.');

        // Written: the banner folds to a line, and the menu offers no second Epilogue right after it.
        await expect(banner).toHaveAttribute('data-epilogue', 'written');
        await expect(banner).toContainText('Ending: The light returns');
        await expect(banner.getByRole('button')).toHaveCount(0);
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        await expect(page.getByRole('button', { name: /^End the story/ })).toBeDisabled();
        await page.keyboard.press('Escape');

        // The story goes on after it, as an ordinary turn.
        await scriptTurn(request, '@Mira: Up you come, then.');
        await send(page, 'I climb once more.');
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Up you come, then.');
        expect(await lastTurnAsked(request)).toBe('I climb once more.');
        await expect(banner).toContainText('Ending: The light returns');

        // The Story's Chats say which Chat ended how, and how many Endings are found.
        await page.goto(`/stories/${storyId}/chats`);
        await expect(page.locator('[data-endings-found]')).toHaveText('Endings found: 1 of 2: The light returns');
        await expect(page.locator('[data-chat-ending]')).toHaveText('Ending: The light returns');
        await noSidewaysScroll(page);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the Chat menu ends any story with an Epilogue, after asking; Again writes the Epilogue anew', async ({ page, request }) => {
    const storyId = await createStory(request);
    const chatId = await createChat(request, storyId);
    await request.delete('/api/testing/fake-gateway');
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await scriptTurn(request, '@Mira: Sit, then.');
        await send(page, 'I sit by the lamp.');
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Sit, then.');

        // Cancel changes nothing.
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        await page.getByRole('button', { name: /^End the story/ }).tap();
        const ask = page.getByRole('alertdialog', { name: /^End the story here\?/ });
        await ask.getByRole('button', { name: 'Cancel' }).tap();
        await expect(ask).toHaveCount(0);
        await expect(page.getByRole('article', { name: 'Epilogue' })).toHaveCount(0);

        await scriptTurn(request, 'The island kept its quiet.');
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        await page.getByRole('button', { name: /^End the story/ }).tap();
        await ask.getByRole('button', { name: 'Write the epilogue' }).tap();
        const epilogue = page.getByRole('article', { name: 'Epilogue' });
        await expect(epilogue).toContainText('The island kept its quiet.');
        expect(await lastTurnAsked(request)).toContain('Ash has chosen to end the story at this point.');
        // No authored Ending was reached: there is no banner, only the Epilogue.
        await expect(page.getByRole('region', { name: 'Ending', exact: true })).toHaveCount(0);

        // Again writes it as an Epilogue again.
        await scriptTurn(request, 'The lamp stayed dark, and nobody minded.');
        await epilogue.getByRole('button', { name: 'Again' }).tap();
        await expect(page.getByRole('article', { name: 'Epilogue' })).toContainText('The lamp stayed dark, and nobody minded.');
        expect(await lastTurnAsked(request)).toContain('Write the epilogue');

        // A Story with no Endings says nothing of them on its Chats page.
        await page.goto(`/stories/${storyId}/chats`);
        await expect(page.getByRole('link', { name: /Chat 1/ })).toBeVisible();
        await expect(page.locator('[data-endings-found]')).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the Scenes tab adds an Ending, saves each field, keeps it through a reload, and removes it', async ({ page, request }) => {
    const storyId = await createStory(request);
    try {
        await page.goto(`/stories/${storyId}?tab=scenes`);
        await expect(page.getByRole('heading', { name: 'Endings' })).toBeVisible();
        await page.getByRole('button', { name: 'Add Ending' }).tap();
        const card = page.getByRole('region', { name: 'Ending 1', exact: true });
        // A new one opens, and says what it still needs.
        await expect(card.getByText('It can be reached once it says when.')).toBeVisible();

        await card.getByRole('textbox', { name: 'Name' }).fill('The light returns');
        await card.getByRole('textbox', { name: 'Reached when' }).fill('The lamp is lit again.');
        await expect(card.getByText('It can be reached once it says when.')).toHaveCount(0);
        await card.getByRole('textbox', { name: 'The epilogue should tell' }).fill('The first ship to pass safely.');
        await expect(page.getByText('Saved', { exact: true })).toBeVisible();
        await noSidewaysScroll(page);

        await expect
            .poll(async () => (await (await request.get(`/api/stories/${storyId}`)).json()).endings)
            .toMatchObject([{ name: 'The light returns', condition: 'The lamp is lit again.', epilogue: 'The first ship to pass safely.' }]);

        await page.reload();
        await expect(card.getByRole('heading', { name: 'The light returns' })).toBeVisible();

        await card.getByRole('button', { name: 'Remove Ending 1' }).tap();
        await page.getByRole('group', { name: 'Remove The light returns?' }).getByRole('button', { name: 'Remove' }).tap();
        await expect(card).toHaveCount(0);
        await expect.poll(async () => (await (await request.get(`/api/stories/${storyId}`)).json()).endings).toEqual([]);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

/** Plays `count` turns through the API, the last one judged with `lastJudge`, and waits for that judgement. */
async function playThrough(request: APIRequestContext, storyId: number, chatId: number, count: number, lastJudge: string) {
    for (let n = 1; n <= count; n++) {
        await scriptTurn(request, `@Mira: Reply ${n}.`, n === count ? lastJudge : judgement());
        const sent = await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: `Turn ${n}.` } });
        expect(sent.ok()).toBe(true);
        await expect
            .poll(async () => {
                const chat = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
                return chat.messages.at(-1).judge?.status;
            })
            .toBe('done');
    }
}

test('in a Story with no Endings the AI suggests one when the story closes: "Not yet" waves it away, or its Epilogue is written', async ({ page, request }) => {
    const storyId = await createStory(request);
    const waved = await createChat(request, storyId);
    const closed = await createChat(request, storyId);
    await request.delete('/api/testing/fake-gateway');
    try {
        // The Judge is asked from the sixth reply on.
        const suggestion = judgement({ reason: 'The storm passed and the lamp is safe.', suggest: 'A quiet watch' });
        await playThrough(request, storyId, waved, 6, suggestion);
        await playThrough(request, storyId, closed, 6, suggestion);

        await page.goto(`/stories/${storyId}/chats/${waved}`);
        const banner = page.getByRole('region', { name: 'Ending', exact: true });
        // Suggested before this visit: one row that says so, with both ways on in it; a tap opens why.
        await expect(banner).toContainText('Suggested ending');
        const named = banner.getByRole('button', { name: /A quiet watch/ });
        await expect(named).toHaveAttribute('aria-expanded', 'false');
        await expect(banner.getByRole('heading', { level: 2, name: /A quiet watch/ })).toBeVisible();
        await expect(banner).toHaveAttribute('data-suggested', 'true');
        // Its name is whole on the row, with both buttons on a row under it at this width: half of the 180px it took.
        expect(await named.locator('span.truncate').last().evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        expect((await banner.boundingBox())!.height).toBeLessThanOrEqual(96);
        await named.tap();
        await expect(banner).toContainText('The storm passed and the lamp is safe.');
        await expect(banner).toContainText('The story may have reached its end. “Not yet” stops these suggestions here; the Chat menu turns them back on.');
        await noSidewaysScroll(page);

        // "Not yet": it goes, and stays gone through the next reply, whatever the Judge would say.
        await banner.getByRole('button', { name: 'Not yet: this is not the end' }).tap();
        await expect(banner).toHaveCount(0);
        await scriptTurn(request, '@Mira: One more watch, then.', suggestion);
        await send(page, 'I stay on.');
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('One more watch, then.');
        await expect
            .poll(async () => (await (await request.get(`/api/stories/${storyId}/chats/${waved}`)).json()).messages.at(-1).judge?.status)
            .toBe('done');
        await expect(banner).toHaveCount(0);
        expect((await (await request.get(`/api/stories/${storyId}/chats/${waved}`)).json()).ending).toBeNull();

        // The Chat menu is the way back (docs/ui-audit-2026-11-16.md M1): its switch is off now, and on again the Judge may suggest once more.
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        const suggest = page.getByRole('dialog', { name: 'Chat menu' }).getByRole('switch', { name: /Suggest an ending/ });
        await expect(suggest).toHaveAttribute('aria-checked', 'false');
        await suggest.tap();
        await expect(suggest).toHaveAttribute('aria-checked', 'true');
        await page.keyboard.press('Escape');
        await scriptTurn(request, '@Mira: The night is done.', judgement({ reason: 'The watch is over.', suggest: 'The night is done' }));
        await send(page, 'I bank the fire.');
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('The night is done.');
        // Suggested while playing, so it opens to say why; the next turn folds it to its row again.
        const again = banner.getByRole('button', { name: /The night is done/ });
        await expect(again).toHaveAttribute('aria-expanded', 'true');
        await expect(banner).toContainText('The watch is over.');
        await scriptTurn(request, '@Mira: Sleep, keeper.');
        await send(page, 'I sit a while.');
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Sleep, keeper.');
        await expect(again).toHaveAttribute('aria-expanded', 'false');
        await expect(banner).not.toContainText('The watch is over.');

        // In the other Chat the suggestion is taken: its Epilogue is written for it by name.
        await page.goto(`/stories/${storyId}/chats/${closed}`);
        await expect(banner.getByRole('button', { name: /A quiet watch/ })).toBeVisible();
        await scriptTurn(request, 'The lamp burned on, and the reef kept its peace.');
        await banner.getByRole('button', { name: 'Write the epilogue' }).tap();
        await expect(page.getByRole('article', { name: 'Epilogue' })).toContainText('the reef kept its peace');
        expect(await lastTurnAsked(request)).toContain('The story has reached its ending: "A quiet watch".');
        await expect(banner).toHaveAttribute('data-epilogue', 'written');
        await expect(banner).toContainText('Ending: A quiet watch');

        // Its row says how it ended; a suggested Ending is not one of the Story's to be found.
        await page.goto(`/stories/${storyId}/chats`);
        await expect(page.locator('[data-chat-ending]')).toHaveText(['Ending: A quiet watch', 'Ending: The night is done']);
        await expect(page.locator('[data-endings-found]')).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});
