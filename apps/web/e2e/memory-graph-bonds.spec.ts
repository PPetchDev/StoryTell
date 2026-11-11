import { expect, Locator, Page, test } from '@playwright/test';

// "Show Bonds" in the Memory graph (.scratch/bond-axes/issues/05-bonds-in-the-memory-graph.md),
// used on a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/**
 * Taps a Bond's line where a finger would: on the line itself, at the first point along it that
 * nothing else in the graph covers (a person or a Memory dot may sit on part of it).
 */
async function tapLine(page: Page, line: Locator): Promise<void> {
    await line.scrollIntoViewIfNeeded();
    const point = await line.evaluate((group) => {
        const path = group.querySelector('path')!;
        const length = path.getTotalLength();
        const matrix = path.getScreenCTM()!;
        for (const fraction of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
            const at = path.getPointAtLength(length * fraction).matrixTransform(matrix);
            if (group.contains(document.elementFromPoint(at.x, at.y))) return { x: at.x, y: at.y };
        }
        return null;
    });
    expect(point, 'some of the line is clear to tap').not.toBeNull();
    await page.touchscreen.tap(point!.x, point!.y);
}

async function openMemory(page: Page): Promise<Locator> {
    await page.getByRole('button', { name: 'Chat menu' }).click();
    await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
    const drawer = page.getByRole('complementary', { name: 'Memory' });
    await expect(drawer).toBeVisible();
    return drawer;
}

test('"Show Bonds" draws the Bonds between the people, a tap names one, the choice survives a reload, and a Sitting-out Character has no line', async ({
    page,
    request,
}) => {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    try {
        await request.patch(`/api/stories/${storyId}`, {
            data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: 'The lamp went out an hour ago.\n\n@Nara: Boots off, keeper.' },
        });
        await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
        const character = async (name: string) => {
            const made = await request.post(`/api/stories/${storyId}/characters`, {
                data: { name, appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
            });
            expect(made.ok()).toBe(true);
            const story = (await made.json()) as { characters: { id: number; name: string }[] };
            return story.characters.find((each) => each.name === name)!.id;
        };
        const nara = await character('Nara');
        const kai = await character('Kai');
        await request.post(`/api/stories/${storyId}/starting-bonds`, {
            data: { fromCharacterId: nara, toCharacterId: null, label: 'Wary', description: 'She expects the keeper to leave.', trust: -2 },
        });
        await request.post(`/api/stories/${storyId}/starting-bonds`, {
            data: { fromCharacterId: kai, toCharacterId: nara, label: 'Rivals', description: 'They both want the lamp room.', tension: 3 },
        });
        const chat = await request.post(`/api/stories/${storyId}/chats`);
        expect(chat.ok()).toBe(true);
        const chatId = (await chat.json()).id as number;
        const memory = await request.post(`/api/stories/${storyId}/chats/${chatId}/memories`, { data: { text: '{user} gave Nara the lamp.', knownBy: [nara] } });
        expect(memory.ok()).toBe(true);

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        let drawer = await openMemory(page);
        await drawer.getByRole('radio', { name: 'Graph' }).tap();
        let graph = drawer.getByRole('group', { name: 'Memory graph' });
        await expect(graph).toBeVisible();

        // It starts off: no Bond is drawn.
        const show = drawer.getByRole('switch', { name: 'Show Bonds' });
        await expect(show).toHaveAttribute('aria-checked', 'false');
        await expect(graph.getByRole('button', { name: / toward / })).toHaveCount(0);

        await show.tap();
        await expect(show).toHaveAttribute('aria-checked', 'true');
        const naraLine = graph.getByRole('button', { name: 'Nara toward Ash (you): Wary' });
        const kaiLine = graph.getByRole('button', { name: 'Kai toward Nara: Rivals' });
        await expect(naraLine).toBeVisible();
        await expect(kaiLine).toBeVisible();
        // Each in the colour of its strongest axis: Trust for Nara, Tension for Kai.
        await expect(naraLine).toHaveAttribute('data-axis', 'trust');
        await expect(kaiLine).toHaveAttribute('data-axis', 'tension');

        // A tap names the Bond, with its levels in words.
        await tapLine(page, naraLine);
        await expect(naraLine).toHaveAttribute('aria-pressed', 'true');
        const picked = drawer.getByRole('region', { name: 'Nara toward Ash (you)' });
        await expect(picked).toContainText('Wary');
        await expect(picked).toContainText('Trust: suspicious · Affection: indifferent · Desire: no pull · Tension: at ease');
        await expect(picked).not.toContainText(/\d/);

        // The choice is kept on this device.
        expect(await page.evaluate(() => window.localStorage.getItem('storytell.memoryGraphBonds'))).not.toBeNull();
        await page.reload();
        drawer = await openMemory(page);
        graph = drawer.getByRole('group', { name: 'Memory graph' });
        await expect(drawer.getByRole('switch', { name: 'Show Bonds' })).toHaveAttribute('aria-checked', 'true');
        await expect(graph.getByRole('button', { name: 'Nara toward Ash (you): Wary' })).toBeVisible();
        await expect(graph.getByRole('button', { name: 'Kai toward Nara: Rivals' })).toBeVisible();

        // Kai sits out: his Bond is not drawn, and Nara's still is.
        const sat = await request.put(`/api/stories/${storyId}/chats/${chatId}/sitting-out`, { data: { characterIds: [kai] } });
        expect(sat.ok()).toBe(true);
        await page.reload();
        drawer = await openMemory(page);
        graph = drawer.getByRole('group', { name: 'Memory graph' });
        await expect(graph.getByRole('button', { name: 'Nara toward Ash (you): Wary' })).toBeVisible();
        await expect(graph.getByRole('button', { name: / toward / })).toHaveCount(1);

        // Off again: no line, and that is kept too.
        await drawer.getByRole('switch', { name: 'Show Bonds' }).tap();
        await expect(graph.getByRole('button', { name: / toward / })).toHaveCount(0);
        await page.reload();
        drawer = await openMemory(page);
        await expect(drawer.getByRole('switch', { name: 'Show Bonds' })).toHaveAttribute('aria-checked', 'false');
        await expect(drawer.getByRole('group', { name: 'Memory graph' }).getByRole('button', { name: / toward / })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});
