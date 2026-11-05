import { APIRequestContext, expect, test } from '@playwright/test';

// The Chat is played on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const MOVE_ON =
    '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":true,"reason":"Mira let Ash up."}}';
const NO_OPS = '{"operations":[]}';

/** A playable Story through the API, with the given Scenes in order. */
async function createStory(
    request: APIRequestContext,
    scenes: { name: string; situation: string; moveOnCondition: string }[] = [],
) {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING },
    });
    await request.patch(`/api/stories/${storyId}/role`, {
        data: { name: 'Ash', description: 'The new keeper, arrived this morning.' },
    });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: {
            name: 'Mira',
            appearance: 'Tall, grey eyes.',
            personality: 'Guarded and dry.',
            voice: 'Short sentences.',
        },
    });
    for (const scene of scenes) {
        expect((await request.post(`/api/stories/${storyId}/scenes`, { data: scene })).ok()).toBe(
            true,
        );
    }
    return storyId;
}

/** Scripts one turn per reply, each judged with the matching judgement. */
async function scriptTurns(request: APIRequestContext, replies: string[], judgements: string[]) {
    await request.delete('/api/testing/fake-gateway');
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'turn', replies: replies.map((text) => ({ text, model: 'glm-5.3' })) },
    });
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'judge', replies: judgements },
    });
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'memory_extraction', replies: replies.map(() => NO_OPS) },
    });
}

async function createChat(request: APIRequestContext, storyId: number) {
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return (await chat.json()).id as number;
}

test('the top bar is one thin row, and Reset through ⋯ asks first: Cancel keeps the Messages, Reset clears them', async ({
    page,
    request,
}) => {
    const storyId = await createStory(request);
    await scriptTurns(request, ['@Mira: Took you long enough.'], [NO_CHANGE]);
    const chatId = await createChat(request, storyId);
    expect(
        (
            await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, {
                data: { text: 'I set my boots by the door.' },
            })
        ).ok(),
    ).toBe(true);

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const bar = page
            .locator('header')
            .filter({ has: page.getByRole('heading', { name: 'Chat 1' }) });
        await expect(bar.getByRole('heading', { name: 'Chat 1' })).toBeVisible();
        await expect(bar).toContainText('as Ash');
        await expect(bar.getByRole('link', { name: 'Back to Chats' })).toHaveAttribute(
            'href',
            `/stories/${storyId}/chats`,
        );
        const box = await bar.boundingBox();
        expect(box?.height).toBeLessThanOrEqual(56);

        const said = page.getByRole('article', { name: 'Ash said' });
        await expect(said).toHaveCount(1);

        // Cancel keeps every Message.
        await bar.getByRole('button', { name: 'Chat menu' }).tap();
        const menu = page.getByRole('dialog', { name: 'Chat menu' });
        await menu.getByRole('button', { name: /Reset/ }).tap();
        await expect(menu).toHaveCount(0);
        const confirm = page.getByRole('alertdialog', {
            name: 'Clear every Message and start this Chat over from the Opening?',
        });
        // Focus starts on Cancel, the safe choice.
        await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
        await confirm.getByRole('button', { name: 'Cancel' }).tap();
        await expect(confirm).toHaveCount(0);
        await expect(said).toHaveCount(1);

        // Reset clears everything but the Opening and keeps the title.
        await bar.getByRole('button', { name: 'Chat menu' }).tap();
        await menu.getByRole('button', { name: /Reset/ }).tap();
        await confirm.getByRole('button', { name: 'Reset' }).tap();
        await expect(said).toHaveCount(0);
        await expect(page.getByRole('article', { name: 'AI reply' })).toHaveCount(0);
        await expect(page.getByRole('article', { name: 'Opening' })).toContainText(
            'Boots off, keeper.',
        );
        await expect(bar.getByRole('heading', { name: 'Chat 1' })).toBeVisible();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the Scene strip shows the Scene and its goal, moves on after a turn the judge moves on, and stays hidden after a reload', async ({
    page,
    request,
}) => {
    const storyId = await createStory(request, [
        {
            name: 'The stair',
            situation: 'Get past Mira to the lamp room.',
            moveOnCondition: 'Mira lets Ash up.',
        },
        {
            name: 'The lamp',
            situation: 'Light the lamp before the ship passes.',
            moveOnCondition: '',
        },
    ]);
    await scriptTurns(request, ['@Mira: Fine. Go up.'], [MOVE_ON]);
    const chatId = await createChat(request, storyId);

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const strip = page.getByRole('button', { name: /^Scene:/ });
        await expect(strip).toContainText('The stair');
        await expect(strip).toContainText('Get past Mira to the lamp room.');

        // The judge moves the Chat on: once the turn settles, the strip shows the next Scene.
        await page.getByLabel('Write as Ash').fill('I ask to go up.');
        await page.getByRole('button', { name: 'Send' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' })).toContainText('Fine. Go up.');
        await expect(strip).toContainText('The lamp');
        await expect(strip).toContainText('Light the lamp before the ship passes.');

        // A tap hides it, and it stays hidden on this device after a reload.
        await strip.tap();
        await expect(strip).toHaveCount(0);
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Chat 1' })).toBeVisible();
        await expect(strip).toHaveCount(0);

        // The ⋯ menu brings it back, and offers it only while it is hidden.
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        await page
            .getByRole('dialog', { name: 'Chat menu' })
            .getByRole('button', { name: /Show Scene strip/ })
            .tap();
        await expect(strip).toContainText('The lamp');
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        await expect(
            page
                .getByRole('dialog', { name: 'Chat menu' })
                .getByRole('button', { name: /Show Scene strip/ }),
        ).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the Scene strip reads "Free play" in a Story with no Scenes', async ({ page, request }) => {
    const storyId = await createStory(request);
    const chatId = await createChat(request, storyId);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await expect(page.getByRole('button', { name: /^Scene:/ })).toHaveText(/Free play/);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('Rename from the ⋯ menu changes the title in the top bar and keeps it after a reload', async ({
    page,
    request,
}) => {
    const storyId = await createStory(request);
    const chatId = await createChat(request, storyId);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        await page
            .getByRole('dialog', { name: 'Chat menu' })
            .getByRole('button', { name: /^Rename/ })
            .tap();
        const title = page
            .getByRole('dialog', { name: 'Rename Chat' })
            .getByRole('textbox', { name: 'Chat title' });
        await expect(title).toHaveValue('Chat 1');
        await expect(title).toBeFocused();
        await title.fill('The night of the storm');
        await page
            .getByRole('dialog', { name: 'Rename Chat' })
            .getByRole('button', { name: 'Save' })
            .tap();
        await expect(page.getByRole('dialog', { name: 'Rename Chat' })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'The night of the storm' })).toBeVisible();
        await page.reload();
        await expect(page.getByRole('heading', { name: 'The night of the storm' })).toBeVisible();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});
