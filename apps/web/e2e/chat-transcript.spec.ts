import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

// The Chat is played on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';

test('Download as text in the Chat menu saves the Chat as a .txt file', async ({ page, request }) => {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse, 1890s.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.' },
    });
    await request.delete('/api/testing/fake-gateway');
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'turn', replies: [{ text: 'Mira snorts.\n\n@Mira: Took you long enough.', model: 'glm-5.3' }] },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    expect(
        (await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'I set my boots by the door.' } })).ok(),
    ).toBe(true);

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        const menu = page.getByRole('dialog', { name: 'Chat menu' });

        const downloading = page.waitForEvent('download');
        await menu.getByRole('link', { name: /Download as text/ }).tap();
        const download = await downloading;

        expect(download.suggestedFilename()).toBe('The Lighthouse - Chat 1.txt');
        const text = await readFile(await download.path(), 'utf8');
        expect(text).toBe(
            [
                'The Lighthouse — Chat 1',
                'The lamp went out an hour ago.',
                'Mira: Boots off, keeper.',
                'Ash: I set my boots by the door.',
                'Mira snorts.',
                'Mira: Took you long enough.',
            ].join('\n\n') + '\n',
        );
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});
