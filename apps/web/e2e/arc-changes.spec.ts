import { APIRequestContext, expect, Page, test } from '@playwright/test';

// Arc changes on the Dashboard (.scratch/arc-changes/issues/01-arc-changes-on-the-dashboard.md),
// read on a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_OPS = '{"operations":[]}';
/** The author's plan for Kai and the Judge's words for his change: neither may show in play. */
const DIRECTION = 'If trusted, his cheer turns to loyalty.';
const STEP = 'Lets himself rely on the keeper.';
const CAUSE = 'Ash shared the last of the bread.';
const JUDGEMENT = JSON.stringify({
    bond_changes: [],
    arc_steps: [{ character: 'Kai', step: STEP, cause: CAUSE }],
    scene: { move_on: false, reason: 'Not yet.' },
});

/** A Chat one turn in, whose Judge changed Kai's Arc once and left Mira's alone. */
async function createChangedChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number; replyId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper, arrived this morning.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Kai', appearance: 'Wiry, sunburnt.', personality: 'Cheerful, nosy.', voice: 'Rambling.', arcDirections: DIRECTION },
    });

    await request.delete('/api/testing/fake-gateway');
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'turn', replies: [{ text: 'Kai eats in silence.\n\n@Kai: Thanks, keeper.', model: 'glm-5.3' }] },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [JUDGEMENT] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;
    const sent = await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'I hand Kai the bread.' } });
    expect(sent.ok()).toBe(true);
    let replyId = 0;
    await expect
        .poll(async () => {
            const current = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
            replyId = current.messages[2].id as number;
            return current.messages[2].judge.status as string;
        })
        .toBe('done');
    return { storyId, chatId, replyId };
}

/** Neither the author's direction nor the step's own words is anywhere on the page, hidden parts included. */
async function expectNoPlan(page: Page) {
    for (const hidden of [DIRECTION, STEP]) {
        await expect(page.locator('body')).not.toContainText(hidden);
        expect(await page.content()).not.toContain(hidden);
    }
}

test('a changed Character folds to "Changed 1 time", opening to the cause and its Message; an unchanged one reads "Hasn\'t changed yet"; the plan never shows', async ({
    page,
    request,
}) => {
    const { storyId, chatId, replyId } = await createChangedChat(request);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}/dashboard`);
        const changed = page.getByRole('region', { name: "How they've changed" });
        const kai = changed.getByRole('region', { name: 'Kai' });
        const mira = changed.getByRole('region', { name: 'Mira' });

        // Folded at first: the count shows, the cause does not.
        const fold = kai.getByRole('button', { name: 'Changed 1 time' });
        await expect(fold).toHaveAttribute('aria-expanded', 'false');
        await expect(kai.getByText(`After ${CAUSE}`)).toBeHidden();
        await expect(mira).toContainText("Hasn't changed yet");
        await expect(mira.getByRole('button', { name: /^Changed/ })).toHaveCount(0);
        await expectNoPlan(page);

        // Opened: the cause, and a link to its Message.
        await fold.click();
        await expect(fold).toHaveAttribute('aria-expanded', 'true');
        await expect(kai.getByText(`After ${CAUSE}`)).toBeVisible();
        await expectNoPlan(page);

        // The fold is remembered on this device.
        await page.reload();
        await expect(kai.getByRole('button', { name: 'Changed 1 time' })).toHaveAttribute('aria-expanded', 'true');
        await expect(kai.getByText(`After ${CAUSE}`)).toBeVisible();

        await kai.getByRole('link', { name: 'Go to the Message' }).click();
        await expect(page).toHaveURL(new RegExp(`/stories/${storyId}/chats/${chatId}#message-${replyId}$`));
        await expect(page.getByRole('article', { name: 'AI reply' })).toContainText('Thanks, keeper.');
    } finally {
        // Leaves the shared e2e database as it was found, Chats included.
        await request.delete(`/api/stories/${storyId}`);
    }
});
