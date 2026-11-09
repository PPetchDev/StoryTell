import { APIRequestContext, expect, Page, test } from '@playwright/test';

// .scratch/expressions/spec.md: Expressions are made in the Story editor and shown in a Chat, on a phone.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** The fake gateway's control routes, reached through the Next.js /api proxy. */
const FAKE = '/api/testing/fake-gateway';

const madeStories: number[] = [];

test.afterEach(async ({ request }) => {
    while (madeStories.length > 0) await request.delete(`/api/stories/${madeStories.pop()}`);
    await request.delete(FAKE);
});

/** A playable Story with Mira, who has no Reference image yet. */
async function createStoryWithMira(request: APIRequestContext, opening = 'The lamp went out an hour ago.\n\n@Mira: Boots off.') {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    madeStories.push(storyId);
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    const added = await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'A tall woman in her thirties, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    expect(added.ok()).toBe(true);
    return { storyId, characterId: (await added.json()).characters[0].id as number };
}

/** A small PNG drawn by the browser, in one colour. */
async function picture(page: Page, colour: string): Promise<Buffer> {
    const dataUrl = await page.evaluate((fill) => {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 300;
        const context = canvas.getContext('2d')!;
        context.fillStyle = fill;
        context.fillRect(0, 0, 200, 300);
        return canvas.toDataURL('image/png');
    }, colour);
    return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function expressionsOf(request: APIRequestContext, storyId: number) {
    return (await (await request.get(`/api/stories/${storyId}`)).json()).characters[0].expressions as Array<{ emotion: string; imagePath: string }>;
}

test('uploads a Happy picture, which fills its row and survives a reload, and Remove empties it after the confirm', async ({ page, request }) => {
    const { storyId } = await createStoryWithMira(request);

    await page.goto(`/stories/${storyId}?tab=characters`);
    const mira = page.getByRole('region', { name: 'Character 1' });
    const expressions = mira.getByRole('group', { name: 'Expressions' });
    await expect(expressions.getByRole('group', { name: /Expression$/ })).toHaveCount(7);
    const happy = expressions.getByRole('group', { name: 'Happy Expression' });
    await expect(happy.locator('img')).toHaveCount(0);
    await expect(happy.getByRole('button', { name: 'Remove' })).toHaveCount(0);

    await happy.getByLabel('Picture for Happy').setInputFiles({ name: 'happy.png', mimeType: 'image/png', buffer: await picture(page, '#ffc46b') });

    const thumbnail = happy.locator('img');
    await expect(thumbnail).toHaveAttribute('src', /^\/api\/images\/expressions\/story-\d+\/character-\d+-joy-[0-9a-f]+\.(jpg|png)$/);
    await expect.poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    expect((await expressionsOf(request, storyId)).map((expression) => expression.emotion)).toEqual(['joy']);
    // The other rows stay empty.
    await expect(expressions.getByRole('group', { name: 'Sad Expression' }).locator('img')).toHaveCount(0);

    await page.reload();
    const again = page.getByRole('region', { name: 'Character 1' }).getByRole('group', { name: 'Happy Expression' });
    await expect(again.locator('img')).toHaveAttribute('src', /expressions\/story-\d+\/character-\d+-joy-/);

    await again.getByRole('button', { name: 'Remove' }).tap();
    const confirm = again.getByRole('group', { name: 'Remove the Happy Expression?' });
    await confirm.getByRole('button', { name: 'Remove' }).tap();
    await expect(again.locator('img')).toHaveCount(0);
    await expect.poll(async () => (await expressionsOf(request, storyId)).length).toBe(0);
});

test("picks an Expression's own square, which Reset gives back to the Portrait's", async ({ page, request }) => {
    const { storyId } = await createStoryWithMira(request);

    await page.goto(`/stories/${storyId}?tab=characters`);
    const happy = page.getByRole('region', { name: 'Character 1' }).getByRole('group', { name: 'Happy Expression' });
    await expect(happy.getByRole('button', { name: 'Pick the face' })).toHaveCount(0);
    await happy.getByLabel('Picture for Happy').setInputFiles({ name: 'happy.png', mimeType: 'image/png', buffer: await picture(page, '#5fd0c5') });
    await expect(happy.locator('img')).toHaveCount(1);
    await expect(happy.getByRole('button', { name: 'Reset' })).toHaveCount(0);

    await happy.getByRole('button', { name: 'Pick the face' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Happy Expression of Mira' });
    const square = sheet.getByRole('slider', { name: 'Face square position' });
    await square.focus();
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowDown']) await square.press(key);
    await sheet.getByRole('button', { name: 'Use this picture' }).tap();
    await expect(sheet).toHaveCount(0);

    let story = await (await request.get(`/api/stories/${storyId}`)).json();
    expect(story.characters[0].expressions[0].crop.x).toBeCloseTo(0.32);
    expect(story.characters[0].expressions[0].crop.y).toBeCloseTo(0.04);

    await happy.getByRole('button', { name: 'Reset' }).tap();
    await expect(happy.getByRole('button', { name: 'Reset' })).toHaveCount(0);
    story = await (await request.get(`/api/stories/${storyId}`)).json();
    expect(story.characters[0].expressions[0].crop).toBeNull();
});

/** Gives Mira a Reference image through the API, with the fake's default picture. */
async function giveReferenceImage(request: APIRequestContext, storyId: number, characterId: number): Promise<void> {
    await request.post(`${FAKE}/image`, { data: { kind: 'reference_image', replies: [{}, {}, {}, {}] } });
    const round = await (await request.post(`/api/stories/${storyId}/characters/${characterId}/reference-image/candidates`)).json();
    const picked = await request.put(`/api/stories/${storyId}/characters/${characterId}/reference-image`, { data: { candidateId: round.candidates[0].id } });
    expect(picked.ok()).toBe(true);
}

async function expressionCalls(request: APIRequestContext): Promise<Array<{ kind: string; prompt: string; referenceImages: unknown[] }>> {
    const calls = await (await request.get(`${FAKE}/calls`)).json();
    return calls.calls
        .filter((call: { method: string; request?: { kind: string } }) => call.method === 'generateImage' && call.request?.kind === 'expression_image')
        .map((call: { request: unknown }) => call.request);
}

test('draws a Happy Expression from the Reference image, showing its price first, and Draw again asks before it replaces it', async ({ page, request }) => {
    const { storyId, characterId } = await createStoryWithMira(request);

    await page.goto(`/stories/${storyId}?tab=characters`);
    const mira = page.getByRole('region', { name: 'Character 1' });
    const expressions = mira.getByRole('group', { name: 'Expressions' });
    // Without a Reference image there is nothing to draw from.
    await expect(expressions).toContainText('Add a Reference image to draw Expressions');
    await expect(expressions.getByRole('button', { name: /^Draw/ })).toHaveCount(0);

    await giveReferenceImage(request, storyId, characterId);
    await page.reload();
    const happy = page.getByRole('region', { name: 'Character 1' }).getByRole('group', { name: 'Happy Expression' });
    // The Settings Snapshot model's 1K price: Seedream V4 edit by default.
    const drawButton = happy.getByRole('button', { name: 'Draw · $0.05' });
    await expect(drawButton).toBeVisible();
    await expect(page.getByRole('region', { name: 'Character 1' })).not.toContainText('Add a Reference image to draw Expressions');

    await request.post(`${FAKE}/image`, { data: { kind: 'expression_image', replies: [{ delayMs: 1_500 }, {}] } });
    await drawButton.tap();
    await expect(happy.getByRole('status')).toHaveText('Drawing…');
    // Other rows stay usable while one draws.
    await expect(page.getByRole('region', { name: 'Character 1' }).getByRole('group', { name: 'Sad Expression' }).getByRole('button', { name: 'Draw · $0.05' })).toBeEnabled();
    const thumbnail = happy.locator('img');
    await expect(thumbnail).toHaveAttribute('src', /expressions\/story-\d+\/character-\d+-joy-[0-9a-f]+\.png$/);
    await expect(happy.getByRole('status')).toHaveCount(0);
    const first = await thumbnail.getAttribute('src');

    let calls = await expressionCalls(request);
    expect(calls).toHaveLength(1);
    expect(calls[0].prompt).toContain('Mira');
    expect(calls[0].referenceImages).toHaveLength(1);

    // Drawing over it asks first, and Cancel draws nothing.
    await expect(happy.getByRole('button', { name: 'Draw · $0.05' })).toHaveCount(0);
    await happy.getByRole('button', { name: 'Draw again' }).tap();
    const confirm = happy.getByRole('group', { name: 'Draw a new Happy Expression?' });
    await expect(confirm).toContainText('It replaces the current one.');
    await confirm.getByRole('button', { name: 'Cancel' }).tap();
    expect(await expressionCalls(request)).toHaveLength(1);

    await happy.getByRole('button', { name: 'Draw again' }).tap();
    await happy.getByRole('group', { name: 'Draw a new Happy Expression?' }).getByRole('button', { name: 'Draw · $0.05' }).tap();
    await expect.poll(() => thumbnail.getAttribute('src')).not.toBe(first);
    calls = await expressionCalls(request);
    expect(calls).toHaveLength(2);

    // A new Reference image makes the drawn one outdated.
    await giveReferenceImage(request, storyId, characterId);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Character 1' }).getByRole('group', { name: 'Happy Expression' })).toContainText(
        'Drawn from an earlier Reference image',
    );
});

test('a draw that fails says why in its row, out of image credit in the Reference image\'s words', async ({ page, request }) => {
    const { storyId, characterId } = await createStoryWithMira(request);
    await giveReferenceImage(request, storyId, characterId);
    await request.post(`${FAKE}/image`, { data: { kind: 'expression_image', replies: [{ error: 'out_of_credit', pool: 'image' }] } });

    await page.goto(`/stories/${storyId}?tab=characters`);
    const angry = page.getByRole('region', { name: 'Character 1' }).getByRole('group', { name: 'Angry Expression' });
    await angry.getByRole('button', { name: 'Draw · $0.05' }).tap();

    await expect(angry.getByRole('alert')).toHaveText(
        'Out of image credit, so no Expression can be drawn until it is topped up. Play is unaffected.',
    );
    await expect(angry.locator('img')).toHaveCount(0);
});

test('the Usage page lists Expression pictures under "Images and audio (Venice)"', async ({ page }) => {
    const pool = (byKind: object[]) => ({ spentUsd: 0.1, calls: 2, byKind, remainingUsd: 8, capUsd: 8, lowCreditPercent: 20, lowCredit: false });
    await page.route('**/api/usage', (route) =>
        route.fulfill({
            json: {
                month: '2026-11',
                pools: { text: pool([]), image: pool([{ kind: 'expression_image', spentUsd: 0.1, calls: 2 }]) },
            },
        }),
    );

    await page.goto('/usage');

    const kinds = page.getByRole('list', { name: 'Images and audio (Venice) spend by kind' }).getByRole('listitem');
    await expect(kinds).toHaveText(['Expression pictures: $0.10 (2 calls)']);
});

test.describe('in a Chat', () => {
    const NO_OPS = '{"operations":[]}';

    /** Mira with a Reference image and a Happy Expression, in a fresh Chat. */
    async function chatWithHappyMira(page: Page, request: APIRequestContext) {
        const { storyId, characterId } = await createStoryWithMira(request);
        await giveReferenceImage(request, storyId, characterId);
        const uploaded = await request.put(`/api/stories/${storyId}/characters/${characterId}/expressions/joy`, {
            multipart: { image: { name: 'happy.png', mimeType: 'image/png', buffer: await picture(page, '#ffc46b') } },
        });
        expect(uploaded.ok()).toBe(true);
        const chat = await request.post(`/api/stories/${storyId}/chats`);
        expect(chat.ok()).toBe(true);
        return { storyId, chatId: (await chat.json()).id as number };
    }

    test("after a turn whose judge tags a line joy, that line's picture is the Happy Expression, and the others keep the Portrait", async ({
        page,
        request,
    }) => {
        await page.goto('/');
        const { storyId, chatId } = await chatWithHappyMira(page, request);
        await request.post(`${FAKE}/text`, { data: { kind: 'turn', replies: [{ text: '@Mira: Fine. Come up.\n\n@Mira: Mind the third step.\n\n@Mira: And the lamp.', model: 'glm-5.3' }] } });
        await request.post(`${FAKE}/text`, {
            data: {
                kind: 'judge',
                replies: [
                    JSON.stringify({
                        bond_changes: [],
                        arc_steps: [],
                        scene: { move_on: false, reason: 'not yet' },
                        expressions: [
                            { line: 1, emotion: 'joy' },
                            { line: 2, emotion: 'neutral' },
                        ],
                    }),
                ],
            },
        });
        await request.post(`${FAKE}/text`, { data: { kind: 'memory_extraction', replies: [NO_OPS] } });

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByRole('textbox', { name: 'Write as Ash' }).fill('I set my boots by the door.');
        await page.getByRole('button', { name: 'Send', exact: true }).tap();

        const reply = page.getByRole('article', { name: 'AI reply' });
        const lines = reply.getByRole('group', { name: 'Mira' });
        await expect(lines).toHaveCount(3);
        // Once the judge is done, the Chat's own re-read brings the tags.
        await expect(lines.nth(0).locator('img')).toHaveAttribute('src', /\/api\/images\/expressions\/story-\d+\/character-\d+-joy-/);
        await expect(lines.nth(1).locator('img')).toHaveAttribute('src', /\/api\/images\/reference-images\//);
        await expect(lines.nth(2).locator('img')).toHaveAttribute('src', /\/api\/images\/reference-images\//);
        // The Opening is never judged: the Portrait.
        await expect(page.getByRole('article', { name: 'Opening' }).getByRole('group', { name: 'Mira' }).locator('img')).toHaveAttribute(
            'src',
            /\/api\/images\/reference-images\//,
        );
        // It holds after a reload, and a tap still opens the profile.
        await page.reload();
        const again = page.getByRole('article', { name: 'AI reply' }).getByRole('group', { name: 'Mira' });
        await expect(again.nth(0).locator('img')).toHaveAttribute('src', /expressions\//);
        await again.nth(0).getByRole('button', { name: 'Profile of Mira' }).tap();
        await expect(page.getByRole('dialog', { name: 'Mira' })).toBeVisible();
    });

    test("the Character profile lists the Expressions under the Reference image", async ({ page, request }) => {
        await page.goto('/');
        const { storyId, chatId } = await chatWithHappyMira(page, request);

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByRole('article', { name: 'Opening' }).getByRole('button', { name: 'Profile of Mira' }).tap();

        const profile = page.getByRole('dialog', { name: 'Mira' });
        await expect(profile.getByRole('img', { name: 'Reference image of Mira' })).toBeVisible();
        const list = profile.getByRole('list', { name: 'Expressions' });
        await expect(list.getByRole('listitem')).toHaveText(['Happy']);
        await expect(list.locator('img')).toHaveAttribute('src', /expressions\/story-\d+\/character-\d+-joy-/);
    });

    test('a Character with no Expressions has no Expressions row in the profile', async ({ page, request }) => {
        const { storyId } = await createStoryWithMira(request);
        const chat = await (await request.post(`/api/stories/${storyId}/chats`)).json();

        await page.goto(`/stories/${storyId}/chats/${chat.id}`);
        await page.getByRole('article', { name: 'Opening' }).getByRole('button', { name: 'Profile of Mira' }).tap();

        await expect(page.getByRole('dialog', { name: 'Mira' })).toBeVisible();
        await expect(page.getByRole('dialog', { name: 'Mira' }).getByRole('list', { name: 'Expressions' })).toHaveCount(0);
    });
});
