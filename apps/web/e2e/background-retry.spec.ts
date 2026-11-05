import { APIRequestContext, expect, test } from '@playwright/test';

// Gentler background failures (.scratch/background-retry/spec.md), at phone width with touch.
// The e2e API retries a failed background call at once (BACKGROUND_RETRY_MS=0).
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const FAKE = '/api/testing/fake-gateway';
const NO_OPS = '{"operations":[]}';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const OUTAGE = { error: 'outage', message: 'DeepInfra answered 503.' };

async function createStory(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    await request.delete(FAKE);
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

test('a background call that fails once is retried on its own: no notice, and sending goes on', async ({ page, request }) => {
    const { storyId, chatId } = await createStory(request);
    await request.post(`${FAKE}/text`, {
        data: { kind: 'turn', replies: [{ text: '@Mira: You took your time.', model: 'glm-5.3' }, { text: '@Mira: Tea is in the tin.', model: 'glm-5.3' }] },
    });
    await request.post(`${FAKE}/text`, { data: { kind: 'judge', replies: [OUTAGE, NO_CHANGE, NO_CHANGE] } });
    await request.post(`${FAKE}/text`, { data: { kind: 'memory_extraction', replies: [OUTAGE, NO_OPS, NO_OPS] } });

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        const box = composer.getByRole('textbox', { name: 'Write as Ash' });
        await box.fill('I take my boots off.');
        await composer.getByRole('button', { name: 'Send' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' })).toContainText('You took your time.');

        await box.fill('Is there tea?');
        await composer.getByRole('button', { name: 'Send' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Tea is in the tin.');
        await expect(page.getByText("Couldn't save")).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('when the retry fails too, one plain notice names everything that failed, and its one Retry reruns it all', async ({ page, request }) => {
    const { storyId, chatId } = await createStory(request);
    await request.post(`${FAKE}/text`, {
        data: { kind: 'turn', replies: [{ text: '@Mira: You took your time.', model: 'glm-5.3' }, { text: '@Mira: Tea is in the tin.', model: 'glm-5.3' }] },
    });
    // Two failures each (the try and its automatic retry), then the Retry press works; then the next send's.
    await request.post(`${FAKE}/text`, { data: { kind: 'judge', replies: [OUTAGE, OUTAGE, NO_CHANGE, NO_CHANGE] } });
    await request.post(`${FAKE}/text`, { data: { kind: 'memory_extraction', replies: [OUTAGE, OUTAGE, NO_OPS, NO_OPS] } });
    await request.post(`${FAKE}/text`, {
        data: { kind: 'snapshot_prompt', replies: Array(3).fill(JSON.stringify({ in_frame: ['Mira'], scene: 'Mira by the window.' })) },
    });
    await request.post(`${FAKE}/image`, { data: { kind: 'snapshot_image', replies: [{ error: 'refusal', message: 'Venice returned the image blurred.' }, { error: 'refusal', message: 'Venice returned the image blurred.' }, {}] } });

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        await composer.getByRole('textbox', { name: 'Write as Ash' }).fill('I take my boots off.');
        await composer.getByRole('button', { name: 'Send' }).tap();
        const reply = page.getByRole('article', { name: 'AI reply' });
        await expect(reply).toContainText('You took your time.');

        await reply.getByRole('group', { name: 'Message actions' }).getByRole('button', { name: 'Snapshot' }).tap();
        await page.getByRole('dialog', { name: 'Take a Snapshot' }).getByRole('button', { name: 'Take Snapshot' }).tap();

        const notice = page.getByRole('status').filter({ hasText: "Couldn't" });
        await expect(notice).toHaveText(
            "Couldn't save the Memories, feelings and Scene from that reply. Couldn't make the Snapshot. Sending waits until it's saved. Retry",
        );
        await expect(notice).toHaveCount(1);
        await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(1);
        // Under its Message, the failed Snapshot only reads so, and can be dismissed.
        await expect(reply.getByRole('alert')).toHaveText("Couldn't make this Snapshot.Dismiss");
        // No technical words.
        await expect(page.getByText('DeepInfra')).toHaveCount(0);
        await expect(page.getByText('Venice')).toHaveCount(0);

        await notice.getByRole('button', { name: 'Retry' }).tap();
        await expect(notice).toHaveCount(0);
        await expect(reply.getByRole('img', { name: 'Snapshot with Mira' })).toBeVisible();

        await composer.getByRole('textbox', { name: 'Write as Ash' }).fill('Is there tea?');
        await composer.getByRole('button', { name: 'Send' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Tea is in the tin.');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});
