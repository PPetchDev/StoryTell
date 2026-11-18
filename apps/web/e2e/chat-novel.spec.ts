import { APIRequestContext, expect, Page, test } from '@playwright/test';

// Turn a Chat into a novel (.scratch/chat-novel/spec.md), on a phone: 390px wide, with touch; then measured at 360 and 320.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'Smoke curls from the fire.\n\n@Nara: Drink, guest.';
const STAYS = '{"bond_changes":[],"arc_steps":[],"scene":{"reason":"Not yet.","move_on":false}}';
const NO_OPS = '{"operations":[]}';
const CHAPTER_ONE = `Title: Mare’s Milk\n\nSmoke curled from the fire as Ash sat down among the herders.\n\n"Drink, guest," Nara said, and pushed the bowl across.\n\n${'The milk was sour and warm. '.repeat(40)}`;
const CHAPTER_TWO = 'Title: The Guest Tent\n\nNight came down over the tents, and the wind with it.';

const script = (request: APIRequestContext, kind: string, replies: unknown[]) => request.post('/api/testing/fake-gateway/text', { data: { kind, replies } });

async function playReply(request: APIRequestContext, storyId: number, chatId: number, reply: string, text: string) {
    await script(request, 'turn', [{ text: reply, model: 'glm-5.3' }]);
    await script(request, 'judge', [STAYS]);
    await script(request, 'memory_extraction', [NO_OPS]);
    expect((await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text } })).ok()).toBe(true);
    await expect
        .poll(async () => {
            const last = (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).messages.at(-1);
            return `${last.judge?.status}/${last.memory?.status}`;
        })
        .toBe('done/done');
}

async function moveOn(request: APIRequestContext, storyId: number, chatId: number, toSceneId: number) {
    const moved = await request.post(`/api/stories/${storyId}/chats/${chatId}/scene`, { data: { toSceneId } });
    expect(moved.ok(), await moved.text()).toBe(true);
}

/** Nara's camp with three Scenes, and a Chat with two ended Chapters. */
async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Steppe' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: "A herders' camp on the steppe.", opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'A trader passing through.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Nara', appearance: 'Tall.', personality: 'Warm and teasing.', voice: 'Quick.' } });
    let scenes: number[] = [];
    for (const data of [
        { name: "Mare's milk", situation: 'Ash is a guest at the fire.', moveOnCondition: 'Ash asks where the tribe keeps its cows.' },
        { name: 'The guest tent', situation: 'Night in the guest tent.', moveOnCondition: 'Nara tells a secret.' },
        { name: 'The fire', situation: 'A lord comes to the fire.' },
    ]) {
        // Answers with the Story, its Scenes in order.
        scenes = ((await (await request.post(`/api/stories/${storyId}/scenes`, { data })).json()).scenes as Array<{ id: number }>).map((scene) => scene.id);
    }
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;

    await playReply(request, storyId, chatId, '@Nara: Slowly. It bites.', 'I sip the milk.');
    await script(request, 'chapter_summary', ['Ash drank the milk.', 'Night fell.']);
    await moveOn(request, storyId, chatId, scenes[1]);
    await playReply(request, storyId, chatId, 'The tent is cold.', 'I lie down.');
    await moveOn(request, storyId, chatId, scenes[2]);
    return { storyId, chatId };
}

/** The Book fits the phone: nothing wider than the screen, Previous and Next 44px targets on screen. */
async function expectFits(page: Page, width: number) {
    await page.setViewportSize({ width, height: 740 });
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    for (const name of ['Previous', 'Next', 'Contents']) {
        const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
    }
    const write = page.getByRole('button', { name: /^(Write chapter|Rewrite)/ });
    if (await write.count()) {
        const box = (await write.first().boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
    }
    // The prose keeps a 16px gutter and a comfortable size.
    const prose = page.locator('main .book-prose').first();
    if (await prose.count()) {
        const box = (await prose.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(12);
        expect(box.x + box.width).toBeLessThanOrEqual(width - 12);
        expect(await prose.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(17);
    }
}

test('a Chat becomes a Book: priced, written, read chapter by chapter, edited, remembered, out of date, and downloaded', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const { storyId, chatId } = await createChat(request);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('link', { name: /^Book/ }).tap();
        await expect(page).toHaveURL(new RegExp(`/stories/${storyId}/chats/${chatId}/book$`));

        // Chapter 1, not written yet, with what writing it will cost.
        const article = page.locator('article[data-book-chapter]');
        await expect(article.getByRole('heading', { name: "Mare's milk" })).toBeVisible();
        await expect(article.getByText('Chapter 1', { exact: true })).toBeVisible();
        await expect(article.getByText('Not written yet.')).toBeVisible();
        await expect(article.getByRole('button', { name: /^Write chapter · ~\$0\.\d+$/ })).toBeVisible();
        await expect(page.getByText('1 of 2')).toBeVisible();
        await expectFits(page, 360);
        await expectFits(page, 320);
        await page.setViewportSize({ width: 390, height: 844 });

        // Write all from the Contents, priced; the first streams in as it comes.
        await script(request, 'book_chapter', [{ text: CHAPTER_ONE, pieceDelayMs: 40, pieceSize: 40 }, CHAPTER_TWO]);
        await page.getByRole('button', { name: 'Contents', exact: true }).tap();
        const contents = page.getByRole('dialog', { name: 'Contents' });
        await expect(contents.getByRole('button', { name: /^Write all 2 · ~\$0\.\d+$/ })).toBeVisible();
        await expect(contents.getByRole('button', { name: 'Download EPUB' })).toBeDisabled();
        await contents.getByRole('button', { name: /^Write all 2/ }).tap();
        await contents.getByRole('button', { name: 'Close' }).tap();
        await expect(article.getByText('Writing…')).toBeVisible();
        await expect(article.locator('.book-prose')).toContainText('Smoke curled from the fire');
        await expect(article.getByRole('heading', { name: 'Mare’s Milk' })).toBeVisible({ timeout: 30_000 });
        await expect(article.getByText('"Drink, guest," Nara said, and pushed the bowl across.')).toBeVisible();
        await expect(article.getByText('Writing…')).toHaveCount(0);
        await expect(article.getByRole('button', { name: /^Rewrite · ~\$/ })).toBeVisible();
        await expectFits(page, 360);
        await expectFits(page, 320);
        await page.setViewportSize({ width: 390, height: 844 });

        // Next goes to chapter 2, which was written after it.
        await page.getByRole('button', { name: 'Next' }).tap();
        await expect(article.getByRole('heading', { name: 'The Guest Tent' })).toBeVisible();
        await expect(page.getByText('2 of 2')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();

        // Edit it by hand.
        await article.getByRole('button', { name: 'Edit' }).tap();
        await article.getByRole('textbox', { name: 'Title' }).fill('A Cold Tent');
        await article.getByRole('textbox', { name: 'Text' }).fill('The tent was cold.\n\nAsh lay down and listened to the wind.');
        await article.getByRole('button', { name: 'Save' }).tap();
        await expect(article.getByRole('heading', { name: 'A Cold Tent' })).toBeVisible();
        await expect(article.getByText('Ash lay down and listened to the wind.')).toBeVisible();
        await expect(article.getByText('Edited by you.')).toBeVisible();

        // It opens where the reader left off.
        await page.reload();
        await expect(article.getByRole('heading', { name: 'A Cold Tent' })).toBeVisible();

        // Again on the newest reply takes chapter 2's Chapter back: the text stays, marked, and can be removed.
        const chat = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
        await script(request, 'turn', [{ text: 'The tent is warm.', model: 'glm-5.3' }]);
        await script(request, 'judge', [STAYS]);
        await script(request, 'memory_extraction', [NO_OPS]);
        expect((await request.post(`/api/stories/${storyId}/chats/${chatId}/messages/${chat.messages.at(-1).id}/regenerate`)).ok()).toBe(true);
        await page.reload();
        await expect(article.getByText('Its Chapter was taken back.')).toBeVisible();
        await expect(article.getByText('Ash lay down and listened to the wind.')).toBeVisible();
        await expect(article.getByRole('button', { name: 'Remove' })).toBeVisible();
        await expect(article.getByRole('button', { name: /^Rewrite/ })).toHaveCount(0);

        // The Contents show each chapter and its state; the EPUB downloads.
        await page.getByRole('button', { name: 'Contents', exact: true }).tap();
        const list = contents.getByRole('list', { name: 'Chapters of the Book' });
        await expect(list.getByRole('button')).toHaveText([/1Mare’s Milk/, /2A Cold TentOut of date/]);
        const downloading = page.waitForEvent('download');
        await contents.getByRole('link', { name: 'Download EPUB' }).tap();
        const download = await downloading;
        expect(download.suggestedFilename()).toMatch(/\.epub$/);
        await contents.getByRole('button', { name: /^1/ }).tap();
        await expect(article.getByRole('heading', { name: 'Mare’s Milk' })).toBeVisible();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a Book opens from the Chapters sheet, and says so when there are no Chapters yet', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const created = await request.post('/api/stories', { data: { title: 'The Steppe' } });
    const storyId = (await created.json()).id as number;
    try {
        await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A camp.', opening: OPENING } });
        await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'A trader.' } });
        await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Quick.' } });
        await request.post(`/api/stories/${storyId}/scenes`, { data: { name: "Mare's milk", situation: 'At the fire.', moveOnCondition: 'Ash asks.' } });
        const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByRole('button', { name: 'Chapters', exact: true }).tap();
        await page.getByRole('dialog', { name: 'Chapters' }).getByRole('link', { name: 'Read as a Book' }).tap();
        await expect(page).toHaveURL(new RegExp(`/book$`));
        await expect(page.getByText('This Chat has no Chapters yet.')).toBeVisible();
        await page.setViewportSize({ width: 320, height: 640 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
        await page.getByRole('link', { name: 'Back to the Chat' }).tap();
        await expect(page).toHaveURL(new RegExp(`/chats/${chatId}$`));
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});
