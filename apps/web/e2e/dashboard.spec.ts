import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { openCard } from './harness/editor';

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
    // A failure fails twice: the try, and its automatic retry.
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: typeof judgement === 'string' ? [judgement] : [judgement, judgement] } });
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

/** The Updates row of one reply, e.g. "Reply 2". Up-to-date replies sit in a fold (M6): see openUpToDate. */
function updateOf(page: Page, reply: string) {
    return page.getByRole('region', { name: 'Updates' }).getByRole('listitem').filter({ hasText: reply });
}

/** The Updates' one line, "All 3 replies are up to date" (docs/ui-audit-2026-11-13.md, M6). */
function upToDateLine(page: Page) {
    return page.getByRole('region', { name: 'Updates' }).locator('summary');
}

/** Opens the Updates' one line to show each of the up-to-date replies. */
async function openUpToDate(page: Page) {
    const fold = page.getByRole('region', { name: 'Updates' }).locator('details');
    if ((await fold.getAttribute('open')) === null) await fold.locator('summary').click();
    await expect(fold).toHaveAttribute('open', '');
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
        // Folded, each Character's feelings read as one line of labels (docs/ui-audit-2026-11-13.md, M6).
        await expect(feel.getByRole('region', { name: 'Mira' })).toContainText('Ash: Curious');
        const bond = (await openCard(feel, 'Mira')).getByRole('group', { name: 'Mira toward Ash' });
        await expect(bond).toContainText('→ Ash');
        await expect(bond).toContainText('Curious');
        await expect(bond).toContainText('She wonders why a keeper would come in a storm.');
        await expect(bond).toContainText('Because: Ash climbed the cliff path in the storm.');
        const changed = page.getByRole('region', { name: "How they've changed" });
        await expect(changed.getByRole('region', { name: 'Mira' })).toContainText("Hasn't changed yet");
        await expect(page.getByRole('region', { name: 'Where the story is' })).toContainText('Free play');
        // All up to date, the Updates say so in one line, each reply a tap away (M6).
        await expect(upToDateLine(page)).toHaveText(/^All \d+ repl(y is|ies are) up to date$/);
        await expect(updateOf(page, 'Reply 2')).toHaveCount(0);
        await openUpToDate(page);
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
        await page.getByRole('button', { name: 'Save', exact: true }).click();
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
        // A failed reply stays in sight, outside the folded up-to-date ones.
        await expect(reply).toBeVisible();
        await expectNoInternalWords(page);

        await reply.getByRole('button', { name: 'Retry' }).click();
        // Up to date now, it joins the others in the one line.
        await expect(upToDateLine(page)).toHaveText(/^All \d+ repl(y is|ies are) up to date$/);
        await openUpToDate(page);
        await expect(reply).toContainText('Up to date');
        await expect(reply.getByRole('button', { name: 'Retry' })).toHaveCount(0);
        await expectNoInternalWords(page);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});
