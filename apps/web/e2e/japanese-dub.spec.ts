import { APIRequestContext, expect, Locator, test } from '@playwright/test';

import { openCard } from './harness/editor';

// .scratch/japanese-dub/spec.md: the Story's "Read aloud in" Japanese dub, its narration voice and
// each Character's Japanese voice in the editor; and a reply read in Japanese, the text on screen
// still English.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const FAKE = '/api/testing/fake-gateway';
const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const madeStories: number[] = [];

test.afterEach(async ({ request }) => {
    while (madeStories.length > 0) await request.delete(`/api/stories/${madeStories.pop()}`);
    await request.delete(FAKE);
});

async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const storyId = (await (await request.post('/api/stories', { data: { title: 'The Lighthouse' } })).json()).id as number;
    madeStories.push(storyId);
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short sentences.' } });
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    return { storyId, chatId };
}

async function expectSaved(scope: Locator | import('@playwright/test').Page) {
    await expect(scope.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');
}

test('the editor sets a Japanese dub, its narration voice and Mira\'s Japanese voice; they fit a 360 and a 320 phone', async ({ page, request }) => {
    const { storyId } = await createChat(request);
    await page.goto(`/stories/${storyId}?tab=style`);
    await expect(page.getByLabel('Japanese narration voice', { exact: true })).toHaveCount(0);

    const language = page.getByRole('radiogroup', { name: 'Read aloud in' });
    await expect(language.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true');
    await language.getByRole('radio', { name: 'Japanese dub' }).tap();
    await expectSaved(page);
    const narration = page.getByLabel('Japanese narration voice', { exact: true });
    await expect(narration.locator('option:checked')).toHaveText('Default (Alpha — Japanese, female)');
    await narration.selectOption({ label: 'Kumo — Japanese, male' });
    await expectSaved(page);

    await page.getByRole('tab', { name: /^Characters/ }).click();
    await openCard(page, 'Character 1');
    const voice = page.getByLabel('Japanese voice', { exact: true });
    await expect(voice.locator('option:checked')).toHaveText('Default (Ono Anna — Japanese, female)');
    await voice.selectOption({ label: 'Vivian — Chinese, female' });
    await expectSaved(page);

    const story = await (await request.get(`/api/stories/${storyId}`)).json();
    expect(story).toMatchObject({ readAloudLanguage: 'japanese', dubNarrationVoice: 'jm_kumo' });
    expect(story.characters[0].dubVoice).toBe('Vivian');

    for (const width of [360, 320]) {
        await page.setViewportSize({ width, height: 740 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
});

test('▶ Read aloud in Japanese reads the translation: narration in Japanese Kokoro, Mira in Ono Anna, the text still English', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await request.patch(`/api/stories/${storyId}`, { data: { readAloudLanguage: 'japanese' } });
    await request.post(`${FAKE}/text`, { data: { kind: 'dub_translation', replies: ['{"lines": ["ランプが消えて一時間。", "靴を脱いで、番人さん。"]}'] } });
    await request.post(`${FAKE}/speech`, { data: { kind: 'read_aloud', replies: [{}, {}] } });

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const opening = page.getByRole('article', { name: 'Opening' });
    // The newest Message, the Opening, has its actions in view.
    const actions = page.getByRole('group', { name: 'Message actions' });
    const read = actions.getByRole('button', { name: 'Read aloud', exact: true });
    if (!(await read.isVisible())) await actions.getByRole('button', { name: 'More actions' }).tap();
    await read.tap();

    await expect.poll(async () => {
        const body = await (await request.get(`${FAKE}/calls`)).json();
        return body.calls.filter((call: { method: string }) => call.method === 'synthesizeSpeech').length;
    }).toBe(2);
    const body = await (await request.get(`${FAKE}/calls`)).json();
    const speech = body.calls.filter((call: { method: string }) => call.method === 'synthesizeSpeech').map((call: { request: Record<string, unknown> }) => call.request);
    expect(speech[0]).toMatchObject({ text: 'ランプが消えて一時間。', voice: 'jf_alpha' });
    expect(speech[1]).toMatchObject({ text: '靴を脱いで、番人さん。', voice: 'Ono_Anna', model: 'qwen3', language: 'Japanese' });
    // The page still shows the English.
    await expect(opening).toContainText('The lamp went out an hour ago.');
});
