import { APIRequestContext, expect, test } from '@playwright/test';

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const ADDS_ONE = JSON.stringify({
    operations: [
        {
            op: 'add',
            text: '{user} climbed the cliff path in the storm to reach the lighthouse.',
            known_by: ['Mira'],
            cause: 'Ash said so on arrival.',
        },
    ],
});

/** A playable Story with one Character, made through the API; the browser covers the Memory drawer. */
async function createPlayableStory(request: APIRequestContext): Promise<number> {
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
    return storyId;
}

test('a "Memory added" toast follows a turn and opens the Memory; a hand-added Memory is locked; the jump link lands on the causing Message', async ({
    page,
    request,
}) => {
    const storyId = await createPlayableStory(request);
    await request.delete('/api/testing/fake-gateway');
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'turn', replies: [{ text: 'Mira looks up at last.\n\n@Mira: In this weather?', model: 'glm-5.3' }] },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [ADDS_ONE] } });

    try {
        await page.goto(`/stories/${storyId}/chats`);
        await page.getByRole('button', { name: 'New Chat' }).click();
        await expect(page).toHaveURL(new RegExp(`/stories/${storyId}/chats/\\d+$`));

        await page.getByLabel('Write as Ash').fill('I climbed the cliff path in the storm.');
        await page.getByRole('button', { name: 'Send' }).click();
        const reply = page.getByRole('article', { name: 'AI reply' });
        await expect(reply).toContainText('In this weather?');

        // The toast appears once the extraction is done, and opens the drawer on that Memory.
        const toast = page.getByRole('status').filter({ hasText: 'Memory added' });
        await expect(toast).toBeVisible();
        await expect(toast).toContainText('Ash climbed the cliff path in the storm to reach the lighthouse.');
        await toast.click();
        const drawer = page.getByRole('complementary', { name: 'Memory' });
        await expect(drawer).toBeVisible();
        await expect(toast).toHaveCount(0);
        const added = drawer.getByRole('listitem').filter({ hasText: 'Ash climbed the cliff path' });
        await expect(added).toHaveClass(/memory-highlight/);
        await expect(added).toContainText('Mira');
        await expect(added).toContainText('Written by the AI');
        await expect(added).not.toContainText('Locked');

        // A Memory added by hand is locked, written by you, and known by Mira (present in the exchange).
        await drawer.getByRole('button', { name: 'Add a Memory' }).click();
        await drawer.getByRole('group', { name: 'New Memory' }).getByRole('textbox', { name: 'Memory text' }).fill('{user} left the horse at the ferry.');
        await expect(drawer.getByRole('status')).toHaveText('Saved');
        await drawer.getByRole('button', { name: 'Done' }).click();
        const own = drawer.getByRole('listitem').filter({ hasText: 'Ash left the horse at the ferry.' });
        await expect(own).toBeVisible();
        await expect(own).toContainText('Locked');
        await expect(own).toContainText('Written by you');
        await expect(own).toContainText('Mira');
        await expect(own.getByRole('link', { name: 'Go to the Message' })).toHaveCount(0);

        // The jump link on the AI's Memory lands on the reply that caused it.
        await added.getByRole('link', { name: 'Go to the Message' }).click();
        await expect(page).toHaveURL(new RegExp(`/stories/${storyId}/chats/\\d+#message-\\d+$`));
        await expect(reply).toHaveClass(/message-target/);
        await drawer.getByRole('button', { name: 'Close' }).click();
        await expect(drawer).toHaveCount(0);
    } finally {
        // Leaves the shared e2e database as it was found, Chats included.
        await request.delete(`/api/stories/${storyId}`);
    }
});
