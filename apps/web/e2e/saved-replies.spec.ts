import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// Saved replies (.scratch/saved-replies-and-replace-rules/spec.md), on a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'Dust rises over the market.\n\n@Nara: Welcome, traveller.';

interface SavedReply {
    id: number;
    text: string;
}

async function createStory(request: APIRequestContext): Promise<number> {
    const created = await request.post('/api/stories', { data: { title: 'The Market' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A grassland market.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Petch', description: 'A traveller.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Nara', appearance: 'Tall.', personality: 'Calm.', voice: 'Measured.' },
    });
    return storyId;
}

async function appWide(request: APIRequestContext): Promise<SavedReply[]> {
    return ((await (await request.get('/api/saved-replies')).json()) as { savedReplies: SavedReply[] }).savedReplies;
}

/** Leaves the shared e2e database without app-wide Saved replies. */
async function clearAppWide(request: APIRequestContext) {
    for (const line of await appWide(request)) await request.delete(`/api/saved-replies/${line.id}`);
}

async function saved(page: Page) {
    await expect(page.getByRole('status').filter({ hasText: /Saved|Saving|Unsaved/ })).toHaveText('Saved');
}

/** Adds a line through the list's "Add saved reply" and types it in. */
async function addLine(list: Locator, number: number, text: string) {
    await list.getByRole('button', { name: '+ Add saved reply' }).tap();
    const box = list.getByRole('textbox', { name: `Saved reply ${number}` });
    await expect(box).toBeFocused();
    await box.fill(text);
}

test.describe('managing Saved replies', () => {
    test.beforeEach(async ({ request }) => clearAppWide(request));
    test.afterEach(async ({ request }) => clearAppWide(request));

    test("Settings' card adds, edits and removes app-wide lines, each surviving a reload", async ({ page, request }) => {
        await page.goto('/settings');
        const card = page.getByRole('region', { name: 'Saved replies' });
        await addLine(card, 1, '*leans back and listens*');
        await addLine(card, 2, 'What now, {user}?');
        await saved(page);
        expect((await appWide(request)).map((line) => line.text)).toEqual(['*leans back and listens*', 'What now, {user}?']);

        await page.reload();
        const reloaded = page.getByRole('region', { name: 'Saved replies' });
        await expect(reloaded.getByRole('textbox', { name: 'Saved reply 1' })).toHaveValue('*leans back and listens*');
        await reloaded.getByRole('textbox', { name: 'Saved reply 1' }).fill('*nods slowly*');
        // A blank line isn't sent: it says why, and the stored one stays.
        await reloaded.getByRole('textbox', { name: 'Saved reply 2' }).fill('  ');
        await expect(reloaded.getByText('A Saved reply needs some text.')).toBeVisible();
        await saved(page);
        expect((await appWide(request)).map((line) => line.text)).toEqual(['*nods slowly*', 'What now, {user}?']);

        await reloaded.getByRole('button', { name: 'Remove saved reply 2' }).tap();
        await saved(page);
        await page.reload();
        const after = page.getByRole('region', { name: 'Saved replies' });
        await expect(after.getByRole('textbox', { name: 'Saved reply 1' })).toHaveValue('*nods slowly*');
        await expect(after.getByRole('textbox', { name: 'Saved reply 2' })).toHaveCount(0);
        expect((await appWide(request)).map((line) => line.text)).toEqual(['*nods slowly*']);
    });

    test("the Style tab's folding card adds, edits and removes the Story's own lines, each surviving a reload", async ({ page, request }) => {
        const storyId = await createStory(request);
        const storyLines = async () =>
            ((await (await request.get(`/api/stories/${storyId}`)).json()) as { savedReplies: SavedReply[] }).savedReplies.map((line) => line.text);
        try {
            await page.goto(`/stories/${storyId}?tab=style`);
            // Still seven tabs: the Story's Saved replies live in the Style tab.
            await expect(page.getByRole('tablist', { name: 'Story sections' }).getByRole('tab')).toHaveCount(7);
            const card = page.getByRole('region', { name: 'Saved replies' });
            await addLine(card, 1, 'I haggle over the price.');
            await addLine(card, 2, 'Where is the well?');
            await saved(page);
            expect(await storyLines()).toEqual(['I haggle over the price.', 'Where is the well?']);

            await page.reload();
            const reloaded = page.getByRole('region', { name: 'Saved replies' });
            await expect(reloaded.getByRole('textbox', { name: 'Saved reply 2' })).toHaveValue('Where is the well?');
            await reloaded.getByRole('textbox', { name: 'Saved reply 2' }).fill('Where does the caravan go?');
            await saved(page);
            await reloaded.getByRole('button', { name: 'Remove saved reply 1' }).tap();
            await saved(page);
            expect(await storyLines()).toEqual(['Where does the caravan go?']);

            await page.reload();
            const after = page.getByRole('region', { name: 'Saved replies' });
            await expect(after.getByRole('textbox', { name: 'Saved reply 1' })).toHaveValue('Where does the caravan go?');
            await expect(after.getByRole('textbox', { name: 'Saved reply 2' })).toHaveCount(0);
            // App-wide lines are not the Story's.
            expect(await appWide(request)).toEqual([]);
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });
});

test.describe('the Saved replies tray', () => {
    test.beforeEach(async ({ request }) => clearAppWide(request));
    test.afterEach(async ({ request }) => clearAppWide(request));

    async function openChat(page: Page, request: APIRequestContext, storyId: number) {
        await request.delete('/api/testing/fake-gateway');
        const chat = await request.post(`/api/stories/${storyId}/chats`);
        expect(chat.ok()).toBe(true);
        const chatId = (await chat.json()).id as number;
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        return {
            chatId,
            composer,
            text: composer.getByRole('textbox', { name: 'Write as Petch' }),
            trayButton: composer.getByRole('toolbar', { name: 'Composer tools' }).getByRole('button', { name: 'Saved replies' }),
            tray: composer.getByRole('region', { name: 'Saved replies' }),
        };
    }

    async function userMessages(request: APIRequestContext, storyId: number, chatId: number): Promise<number> {
        const chat = (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()) as { messages: Array<{ kind: string }> };
        return chat.messages.filter((message) => message.kind === 'user').length;
    }

    test('lists both groups; a tap fills the box at the caret with a space and {user} filled, and sends nothing', async ({ page, request }) => {
        const storyId = await createStory(request);
        await request.post('/api/saved-replies', { data: { text: 'I nod at {user} and smile.' } });
        await request.post(`/api/stories/${storyId}/saved-replies`, { data: { text: 'I haggle over the price.' } });
        await request.post(`/api/stories/${storyId}/saved-replies`, { data: { text: 'Where is the well? '.repeat(12).trim() } });
        try {
            const { chatId, composer, text, trayButton, tray } = await openChat(page, request, storyId);
            await expect(trayButton).toHaveAttribute('aria-pressed', 'false');
            await trayButton.tap();
            await expect(trayButton).toHaveAttribute('aria-pressed', 'true');

            // This Story's first, then All Stories, each in add order.
            const story = tray.getByRole('group', { name: 'This Story' });
            const all = tray.getByRole('group', { name: 'All Stories' });
            await expect(story.getByRole('button')).toHaveText(['I haggle over the price.', /^Where is the well\?/]);
            await expect(all.getByRole('button')).toHaveText(['I nod at {user} and smile.']);
            expect(await tray.getByRole('heading').allTextContents()).toEqual(['This Story', 'All Stories']);
            // A long line shows at most two lines.
            const long = story.getByRole('button', { name: /^Where is the well\?/ });
            const lines = await long.evaluate((el) => {
                const style = getComputedStyle(el);
                const inner = el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
                return inner / parseFloat(style.lineHeight);
            });
            expect(lines).toBeLessThanOrEqual(2.05);
            // The tray sits in the panel band, above the tool row.
            const trayBox = (await tray.boundingBox())!;
            const toolBox = (await composer.getByRole('toolbar', { name: 'Composer tools' }).boundingBox())!;
            expect(trayBox.y + trayBox.height).toBeLessThanOrEqual(toolBox.y + 1);

            // Into an empty box: the line is the whole draft.
            await story.getByRole('button', { name: 'I haggle over the price.' }).tap();
            await expect(text).toHaveValue('I haggle over the price.');
            // The tray stays open after a tap.
            await expect(tray).toBeVisible();

            // At the caret, with a space on each side that needs one; {user} becomes the worn name.
            await text.evaluate((el: HTMLTextAreaElement) => {
                el.focus();
                el.setSelectionRange(1, 1);
            });
            await all.getByRole('button').tap();
            await expect(text).toHaveValue('I I nod at Petch and smile. haggle over the price.');
            await expect.poll(() => text.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe('I I nod at Petch and smile.'.length);
            // At the very start: a space after it only.
            await text.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 0));
            await story.getByRole('button', { name: 'I haggle over the price.' }).tap();
            await expect(text).toHaveValue('I haggle over the price. I I nod at Petch and smile. haggle over the price.');
            await expect.poll(() => text.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe('I haggle over the price. '.length);

            // Nothing was sent, and no model was called.
            expect(await userMessages(request, storyId, chatId)).toBe(0);
            const calls = (await (await request.get('/api/testing/fake-gateway/calls')).json()).calls as Array<{ method: string }>;
            expect(calls.filter((call) => call.method !== 'remainingCredit')).toEqual([]);

            // The tray button closes it.
            await trayButton.tap();
            await expect(tray).toHaveCount(0);
            await expect(trayButton).toHaveAttribute('aria-pressed', 'false');
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });

    test('a line goes at the end of a box never focused since the Chat opened', async ({ page, request }) => {
        const storyId = await createStory(request);
        await request.post(`/api/stories/${storyId}/saved-replies`, { data: { text: 'I wave.' } });
        try {
            const { text, trayButton, tray } = await openChat(page, request, storyId);
            // Typed in without focusing it through the page: the caret was never placed by the user.
            await text.evaluate((el: HTMLTextAreaElement) => {
                const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
                setter.call(el, 'Hello there');
                el.setSelectionRange(0, 0);
                el.dispatchEvent(new Event('input', { bubbles: true }));
            });
            await expect(text).toHaveValue('Hello there');
            await trayButton.tap();
            await tray.getByRole('button', { name: 'I wave.' }).tap();
            await expect(text).toHaveValue('Hello there I wave.');
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });

    test("a Saved reply put in the box ends Write for me's Undo", async ({ page, request }) => {
        const storyId = await createStory(request);
        await request.post(`/api/stories/${storyId}/saved-replies`, { data: { text: 'I wave.' } });
        try {
            const { composer, text, trayButton, tray } = await openChat(page, request, storyId);
            await request.post('/api/testing/fake-gateway/text', { data: { kind: 'write_for_me', replies: ['I step into the market.'] } });
            await composer.getByRole('button', { name: 'Write for me' }).tap();
            await expect(text).toHaveValue('I step into the market.');
            const undo = composer.getByRole('button', { name: '↶ Undo' });
            await expect(undo).toBeVisible();
            await trayButton.tap();
            await tray.getByRole('button', { name: 'I wave.' }).tap();
            await expect(text).toHaveValue('I step into the market. I wave.');
            await expect(undo).toHaveCount(0);
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });

    test('the tray and ⚡ never show together, and a send closes the tray', async ({ page, request }) => {
        const storyId = await createStory(request);
        const SUGGESTED = JSON.stringify({
            suggestions: [
                { kind: 'action', text: 'You sit down.' },
                { kind: 'speech', text: '"Hello."' },
                { kind: 'move', text: 'You leave.' },
            ],
        });
        try {
            const { composer, text, trayButton, tray } = await openChat(page, request, storyId);
            await request.post('/api/testing/fake-gateway/text', { data: { kind: 'suggested_replies', replies: [SUGGESTED] } });
            const suggest = composer.getByRole('button', { name: 'Suggest replies' });
            const cards = composer.getByRole('list', { name: 'Suggested replies' });

            await trayButton.tap();
            await expect(tray.getByText(/^No saved replies yet\. Save a draft here, or add them in Settings or the Story editor.s Style tab\.$/)).toBeVisible();
            await suggest.tap();
            await expect(cards.getByRole('button')).toHaveCount(3);
            await expect(tray).toHaveCount(0);
            await expect(trayButton).toHaveAttribute('aria-pressed', 'false');
            await trayButton.tap();
            await expect(tray).toBeVisible();
            await expect(cards).toHaveCount(0);
            await expect(suggest).toHaveAttribute('aria-pressed', 'false');

            await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: ['@Nara: Sit.'] } });
            await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: ['{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}'] } });
            await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: ['{"operations":[]}'] } });
            await text.fill('I sit.');
            await composer.getByRole('button', { name: 'Send' }).tap();
            await expect(page.getByText('Sit.', { exact: true })).toBeVisible();
            await expect(tray).toHaveCount(0);
            await expect(trayButton).toHaveAttribute('aria-pressed', 'false');
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });

    test('"Save this draft" keeps the box as it is, for this Story or all, shown at once and after a reload', async ({ page, request }) => {
        const storyId = await createStory(request);
        try {
            const { chatId, text, trayButton, tray } = await openChat(page, request, storyId);
            await trayButton.tap();
            const forStory = tray.getByRole('button', { name: 'For this Story' });
            const forAll = tray.getByRole('button', { name: 'For all Stories' });
            await expect(forStory).toBeDisabled();
            await expect(forAll).toBeDisabled();

            await text.fill('*counts the coins*, {user}');
            await forStory.tap();
            await expect(tray.getByRole('group', { name: 'This Story' }).getByRole('button')).toHaveText(['*counts the coins*, {user}']);
            await text.fill('Thank you kindly.');
            await forAll.tap();
            await expect(tray.getByRole('group', { name: 'All Stories' }).getByRole('button')).toHaveText(['Thank you kindly.']);
            await expect(tray.getByText(/No saved replies yet/)).toHaveCount(0);
            // The draft is untouched and nothing was sent.
            await expect(text).toHaveValue('Thank you kindly.');
            expect(await userMessages(request, storyId, chatId)).toBe(0);

            const stored = (await (await request.get(`/api/stories/${storyId}`)).json()) as { savedReplies: SavedReply[] };
            expect(stored.savedReplies.map((line) => line.text)).toEqual(['*counts the coins*, {user}']);
            expect((await appWide(request)).map((line) => line.text)).toEqual(['Thank you kindly.']);

            await page.reload();
            await page.getByRole('form', { name: 'Composer' }).getByRole('button', { name: 'Saved replies' }).tap();
            const reloaded = page.getByRole('region', { name: 'Saved replies' });
            await expect(reloaded.getByRole('group', { name: 'This Story' }).getByRole('button')).toHaveText(['*counts the coins*, {user}']);
            await expect(reloaded.getByRole('group', { name: 'All Stories' }).getByRole('button')).toHaveText(['Thank you kindly.']);
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });
});
