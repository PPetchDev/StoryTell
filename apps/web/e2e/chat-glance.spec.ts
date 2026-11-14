import { APIRequestContext, expect, test } from '@playwright/test';

// The Dashboard at a glance (docs/ui-audit-2026-11-13.md, Low, Desktop): from 1280px wide the room
// right of the Chat shows where the story is and how each Character feels, read again after a
// reply; the docked Memory drawer takes its place while open; narrower screens show no panel.
const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
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

async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', {
        data: { title: 'The Lighthouse', setting: 'A lighthouse on a storm-cut island.', opening: OPENING },
    });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

test.describe('at 1440px wide', () => {
    test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });

    test('the panel shows the Scene and each Character\'s Bonds, reads them again after a reply, and gives way to Memory', async ({ page, request }) => {
        const { storyId, chatId } = await createChat(request);
        await request.delete('/api/testing/fake-gateway');
        await request.post('/api/testing/fake-gateway/text', {
            data: { kind: 'turn', replies: [{ text: 'Mira looks up at last.\n\n@Mira: In this weather?', model: 'glm-5.3' }] },
        });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [BOND_CHANGE] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: ['{"operations":[]}'] } });
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            const glance = page.getByRole('complementary', { name: 'At a glance' });
            await expect(glance).toBeVisible();
            await expect(glance.getByRole('region', { name: 'Where the story is' })).toContainText('Free play');
            const feelings = glance.getByRole('region', { name: 'How the Characters feel' });
            await expect(feelings.getByRole('listitem')).toHaveText([/Mira\s*A stranger to everyone so far\.$/]);

            // The Chat column moves aside for it: nothing of the thread lies under the panel.
            const panel = (await glance.boundingBox())!;
            const composer = (await page.getByRole('textbox', { name: /^Write as/ }).boundingBox())!;
            expect(composer.x + composer.width).toBeLessThanOrEqual(panel.x);

            // A reply whose update changes Mira's Bond: the panel reads it without a reload.
            await page.getByRole('textbox', { name: /^Write as/ }).fill('I climbed the cliff path in the storm.');
            await page.getByRole('button', { name: 'Send' }).click();
            await expect(feelings.getByRole('listitem')).toHaveText([/Mira\s*Ash: Curious$/], { timeout: 20_000 });

            await expect(glance.getByRole('link', { name: 'Open the Dashboard' })).toHaveAttribute('href', `/stories/${storyId}/chats/${chatId}/dashboard`);

            // The docked Memory drawer takes the same room while open.
            await page.getByRole('button', { name: 'Chat menu' }).click();
            await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
            await expect(page.getByRole('complementary', { name: 'Memory' })).toBeVisible();
            await expect(glance).toHaveCount(0);
            await page.getByRole('complementary', { name: 'Memory' }).getByRole('button', { name: 'Close' }).click();
            await expect(glance).toBeVisible();
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });
});

test.describe('narrower than 1280px', () => {
    test.use({ viewport: { width: 1200, height: 900 }, hasTouch: false, isMobile: false });

    test('there is no panel, and the Dashboard is not read for it', async ({ page, request }) => {
        const { storyId, chatId } = await createChat(request);
        try {
            const reads: string[] = [];
            page.on('request', (sent) => {
                if (sent.url().endsWith('/dashboard')) reads.push(sent.url());
            });
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            await expect(page.getByRole('article', { name: 'Opening' })).toBeVisible();
            await expect(page.getByRole('complementary', { name: 'At a glance' })).toHaveCount(0);
            expect(reads).toEqual([]);
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });
});
