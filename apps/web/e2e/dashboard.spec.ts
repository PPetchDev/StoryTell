import { APIRequestContext, expect, Page, test } from '@playwright/test';

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';
const BOND_CHANGE = JSON.stringify({
    bond_changes: [
        {
            from: 'Mira',
            to: 'user',
            label: 'Curious',
            description: 'She wonders why a keeper would come in a storm.',
            cause: 'Ash climbed the cliff path in the storm.',
        },
    ],
    arc_steps: [],
    scene: { move_on: false, reason: 'Not yet.' },
});

/**
 * A playable Story with a Chat one turn in, whose judge changed Mira's Bond toward Ash, all
 * through the API; the browser covers the dashboard and the rewind.
 */
async function createJudgedChat(
    request: APIRequestContext,
    judgement: string | { error: 'outage' } = BOND_CHANGE,
): Promise<{ storyId: number; chatId: number }> {
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
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });

    await request.delete('/api/testing/fake-gateway');
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'turn', replies: [{ text: 'Mira looks up at last.\n\n@Mira: In this weather?', model: 'glm-5.3' }] },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [judgement] } });
    // Memory extraction changes nothing in this spec: the turn now, and the edited reply later.
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS, NO_OPS] } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;
    const sent = await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, {
        data: { text: 'I climbed the cliff path in the storm.' },
    });
    expect(sent.ok()).toBe(true);
    // The judge runs in the background; wait until it has settled, done or failed.
    await expect
        .poll(async () => {
            const current = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
            return current.messages[2].judge.status as string;
        })
        .not.toBe('pending');
    return { storyId, chatId };
}

/** The Updates row of one reply, e.g. "Reply 2". */
function updateOf(page: Page, reply: string) {
    return page.getByRole('region', { name: 'Updates' }).getByRole('listitem').filter({ hasText: reply });
}

/** None of the app's internal words shows as visible text on the Dashboard page. */
async function expectNoInternalWords(page: Page) {
    const body = page.locator('body');
    await expect(body).not.toContainText(/judge/i, { useInnerText: true });
    await expect(body).not.toContainText(/extraction/i, { useInnerText: true });
    await expect(body).not.toContainText(/\bDone\b/, { useInnerText: true });
}

test('shows a scripted Bond change with its event on the dashboard, and editing the causing Message removes it with a rollback notice', async ({
    page,
    request,
}) => {
    const { storyId, chatId } = await createJudgedChat(request);
    // The edited reply is judged again: nothing changes this time.
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        // No Bond or Arc on the Chat screen itself.
        await expect(page.getByText('Curious')).toHaveCount(0);
        await page.getByRole('button', { name: 'Chat menu' }).click();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('link', { name: /^Dashboard/ }).click();
        await expect(page).toHaveURL(new RegExp(`/stories/${storyId}/chats/${chatId}/dashboard$`));

        // The sections say what they show, in plain words.
        const feel = page.getByRole('region', { name: 'How the Characters feel' });
        const bond = feel.getByRole('region', { name: 'Mira' }).getByRole('group', { name: 'Mira toward Ash' });
        await expect(bond).toContainText('→ Ash');
        await expect(bond).toContainText('Curious');
        await expect(bond).toContainText('She wonders why a keeper would come in a storm.');
        await expect(bond).toContainText('Because: Ash climbed the cliff path in the storm.');
        const changed = page.getByRole('region', { name: "How they've changed" });
        await expect(changed.getByRole('region', { name: 'Mira' })).toContainText('Unchanged from the core definition.');
        await expect(page.getByRole('region', { name: 'Where the story is' })).toContainText('Free play');
        await expect(updateOf(page, 'Reply 2')).toContainText('Up to date');
        await expectNoInternalWords(page);

        // The history opens under the current value, and its link lands on the causing Message.
        await bond.locator('summary').click();
        await expect(bond).toContainText('Curious');
        await expectNoInternalWords(page);
        await bond.getByRole('link', { name: 'Go to the Message' }).click();
        await expect(page).toHaveURL(new RegExp(`/stories/${storyId}/chats/${chatId}#message-\\d+$`));
        const reply = page.getByRole('article', { name: 'AI reply' });
        await expect(reply).toContainText('In this weather?');

        // Editing the causing Message rolls its Bond change back, with a notice.
        await reply.getByRole('button', { name: 'Edit' }).click();
        await page.getByRole('textbox', { name: 'Message text' }).fill('Mira does not look up.\n\n@Mira: Boots.');
        await page.getByRole('button', { name: 'Save' }).click();
        await expect(page.getByRole('status').filter({ hasText: 'Rolled back: 1 Bond change.' })).toBeVisible();
        await expect(reply).toContainText('Boots.');

        await page.getByRole('button', { name: 'Chat menu' }).click();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('link', { name: /^Dashboard/ }).click();
        await expect(page.getByRole('region', { name: 'How the Characters feel' })).toContainText('A stranger to everyone so far.');
        await expect(page.getByText('Curious')).toHaveCount(0);
    } finally {
        // Leaves the shared e2e database as it was found, Chats included.
        await request.delete(`/api/stories/${storyId}`);
    }
});

test("a reply whose update failed reads Couldn't update, and Retry brings it up to date", async ({ page, request }) => {
    const { storyId, chatId } = await createJudgedChat(request, { error: 'outage' });
    // The retry runs the update again, and this time it works.
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}/dashboard`);
        const reply = updateOf(page, 'Reply 2');
        await expect(reply).toContainText("Couldn't update — Retry");
        await expectNoInternalWords(page);

        await reply.getByRole('button', { name: 'Retry' }).click();
        await expect(reply).toContainText('Up to date');
        await expect(reply.getByRole('button', { name: 'Retry' })).toHaveCount(0);
        await expectNoInternalWords(page);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});
