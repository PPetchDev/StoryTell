import { APIRequestContext, expect, Page, test } from '@playwright/test';

// ✍️ is a phone gesture (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
/** "Ask her about the key, sound suspicious." */
const THAI = 'ถามเธอเรื่องกุญแจ ทำเสียงสงสัย';
const WRITTEN = '*I narrow my eyes.* "Where did you put the key, Mira?"';
const FROM_NOTHING = '*I pull my boots off and sit by the stove.*';

async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    await request.delete('/api/testing/fake-gateway');
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

async function scriptWrites(request: APIRequestContext, replies: string[]): Promise<void> {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'write_for_me', replies } });
}

/** Holds Write for me's answers until `release` is called, so a test can look at the wait. */
async function holdWrites(page: Page, storyId: number, chatId: number): Promise<() => void> {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(`**/api/stories/${storyId}/chats/${chatId}/write-for-me`, async (route) => {
        await held;
        await route.continue();
    });
    return release;
}

test('✍️ turns a Thai draft into the scripted English, Undo gives the Thai back, and typing ends the Undo', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await scriptWrites(request, [WRITTEN, WRITTEN]);
    const drafts: string[] = [];
    page.on('request', (sent) => {
        if (sent.url().endsWith('/write-for-me')) drafts.push(sent.postDataJSON().draft);
    });
    const release = await holdWrites(page, storyId, chatId);

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        const box = composer.getByRole('textbox', { name: 'Write as Ash' });
        const pen = composer.getByRole('toolbar', { name: 'Composer tools' }).getByRole('button', { name: 'Write for me' });
        const undo = composer.getByRole('button', { name: '↶ Undo' });

        await box.fill(THAI);
        await expect(undo).toHaveCount(0);
        await pen.tap();

        // While it writes: the box is locked, ✍️ is busy, and the panel says so.
        await expect(composer.getByRole('status').filter({ hasText: 'Writing for you…' })).toBeVisible();
        await expect(pen).toHaveAttribute('aria-busy', 'true');
        await expect(pen).toHaveAttribute('aria-pressed', 'true');
        await expect(box).not.toBeEditable();
        release();

        // The answer replaces the draft and sends nothing.
        await expect(box).toHaveValue(WRITTEN);
        await expect(box).toBeFocused();
        await expect(composer.getByText('Writing for you…')).toHaveCount(0);
        await expect(page.getByRole('article', { name: 'Ash said' })).toHaveCount(0);
        expect(drafts).toEqual([THAI]);

        // Undo gives the Thai back, exactly, and goes away.
        await undo.tap();
        await expect(box).toHaveValue(THAI);
        await expect(undo).toHaveCount(0);

        // Again from the Thai; then a typed change ends the Undo for good.
        await pen.tap();
        await expect(box).toHaveValue(WRITTEN);
        await expect(undo).toBeVisible();
        await box.pressSequentially(' Now.');
        await expect(undo).toHaveCount(0);
        await box.fill(WRITTEN);
        await expect(undo).toHaveCount(0);
        expect(drafts).toEqual([THAI, THAI]);

        // Nothing reached the thread until Send.
        await page.reload();
        await expect(page.getByRole('article', { name: 'Ash said' })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('✍️ on an empty box writes from nothing, and Undo empties the box again', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await scriptWrites(request, [FROM_NOTHING]);

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        const box = composer.getByRole('textbox', { name: 'Write as Ash' });

        await composer.getByRole('button', { name: 'Write for me' }).tap();
        await expect(box).toHaveValue(FROM_NOTHING);
        await expect(composer.getByRole('button', { name: 'Send' })).toBeEnabled();

        await composer.getByRole('button', { name: '↶ Undo' }).tap();
        await expect(box).toHaveValue('');
        await expect(composer.getByRole('button', { name: 'Continue' })).toBeVisible();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a failed ✍️ says so and leaves the draft; a second tap while it waits cancels and drops the late answer', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    // The first answer is all a Character's line: nothing left for the user.
    await scriptWrites(request, ['@Mira: I answer for him.', WRITTEN]);

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        const box = composer.getByRole('textbox', { name: 'Write as Ash' });
        const pen = composer.getByRole('button', { name: 'Write for me' });
        const failed = composer.getByRole('alert').filter({ hasText: "Couldn't write it, try again" });

        await box.fill(THAI);
        await pen.tap();
        await expect(failed).toBeVisible();
        await expect(box).toHaveValue(THAI);
        await expect(composer.getByRole('button', { name: '↶ Undo' })).toHaveCount(0);

        // Cancelled: the answer comes, but the draft stays and the box is free again.
        const release = await holdWrites(page, storyId, chatId);
        const answered = page.waitForResponse((response) => response.url().endsWith('/write-for-me'));
        await pen.tap();
        await expect(failed).toHaveCount(0);
        await expect(pen).toHaveAttribute('aria-busy', 'true');
        await pen.tap();
        await expect(pen).toHaveAttribute('aria-busy', 'false');
        await expect(box).toBeEditable();
        release();
        expect((await answered).ok()).toBe(true);
        await expect(box).toHaveValue(THAI);
        await expect(composer.getByRole('button', { name: '↶ Undo' })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('✍️ on a result hides Undo while it writes again, and the new Undo gives back the first result', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    const SECOND = '"Where is the key, Mira? Tell me now."';
    await scriptWrites(request, [WRITTEN, SECOND]);

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        const box = composer.getByRole('textbox', { name: 'Write as Ash' });
        const pen = composer.getByRole('button', { name: 'Write for me' });
        const undo = composer.getByRole('button', { name: '↶ Undo' });

        await box.fill(THAI);
        await pen.tap();
        await expect(box).toHaveValue(WRITTEN);
        await expect(undo).toBeVisible();

        const release = await holdWrites(page, storyId, chatId);
        await pen.tap();
        await expect(pen).toHaveAttribute('aria-busy', 'true');
        await expect(undo).toHaveCount(0);
        release();
        await expect(box).toHaveValue(SECOND);
        await undo.tap();
        await expect(box).toHaveValue(WRITTEN);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the Usage page lists what Write for me and Thai readings spent, each under its own name', async ({ page }) => {
    const pool = (byKind: object[]) => ({ spentUsd: 0.05, calls: 3, byKind, remainingUsd: 20, capUsd: 22, lowCreditPercent: 20, lowCredit: false });
    await page.route('**/api/usage', (route) =>
        route.fulfill({
            json: { month: '2026-11', pools: { text: pool([{ kind: 'write_for_me', spentUsd: 0.05, calls: 3 }, { kind: 'thai_reading', spentUsd: 0.02, calls: 4 }]), image: { ...pool([]), spentUsd: 0, calls: 0 } } },
        }),
    );

    await page.goto('/usage');

    const kinds = page.getByRole('list', { name: 'Text spend by kind' }).getByRole('listitem');
    await expect(kinds).toHaveText(['Write for me: $0.05 (3 calls)', 'Thai readings: $0.02 (4 calls)']);
});
