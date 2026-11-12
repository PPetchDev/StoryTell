import { APIRequestContext, expect, Page, test } from '@playwright/test';

// The Memory drawer as a dialog below 1024px, the Bond chart in words, the Memory graph's 44px
// taps and its one Tab stop, and the Chats list's Rename (docs/ui-audit.md: H4, H17, H18, H19,
// M52, M54, M55).

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const JUDGEMENT = JSON.stringify({
    bond_changes: [
        {
            from: 'Mira',
            to: 'user',
            label: 'Curious',
            description: 'She wonders why a keeper would come in a storm.',
            levels: { trust: 0, affection: 1, desire: 0, tension: 1 },
            cause: 'Ash climbed the cliff path in the storm.',
        },
    ],
    arc_steps: [],
    scene: { move_on: false, reason: 'Not yet.' },
});

async function createStory(request: APIRequestContext) {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    const character = async (name: string) => {
        const made = await request.post(`/api/stories/${storyId}/characters`, {
            data: { name, appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
        });
        expect(made.ok()).toBe(true);
        return ((await made.json()) as { characters: { id: number; name: string }[] }).characters.find((each) => each.name === name)!.id;
    };
    const mira = await character('Mira');
    const jonah = await character('Jonah');
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;
    return { storyId, chatId, mira, jonah };
}

async function addMemory(request: APIRequestContext, storyId: number, chatId: number, text: string, knownBy: number[]) {
    const added = await request.post(`/api/stories/${storyId}/chats/${chatId}/memories`, { data: { text, knownBy } });
    expect(added.ok()).toBe(true);
    return (await added.json()).id as number;
}

async function openMemoryFromMenu(page: Page) {
    await page.getByRole('button', { name: 'Chat menu' }).click();
    await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
}

/** Whether the element is inside something inert: out of reach of focus and taps. */
async function isInert(page: Page, name: string) {
    return page.getByRole('textbox', { name }).evaluate((element) => element.closest('[inert]') !== null);
}

test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('the Memory drawer is a dialog: focus moves in, Tab stays in it, the Chat behind is inert, and Escape closes it back to the menu button', async ({
        page,
        request,
    }) => {
        const { storyId, chatId } = await createStory(request);
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            await openMemoryFromMenu(page);
            const drawer = page.getByRole('dialog', { name: 'Memory' });
            await expect(drawer).toBeVisible();
            await expect(drawer).toHaveAttribute('aria-modal', 'true');
            await expect(drawer.getByRole('heading', { name: 'Memory' })).toBeFocused();
            expect(await isInert(page, 'Write as Ash')).toBe(true);

            // Tab and Shift+Tab never leave the drawer.
            for (let step = 0; step < 25; step++) {
                await page.keyboard.press('Tab');
                expect(await drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true);
            }
            await page.keyboard.press('Shift+Tab');
            expect(await drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true);

            // Clear of the notch: its top padding is at least the safe area's (none in the test browser, so 16px).
            const top = await drawer.evaluate((node) => parseFloat(getComputedStyle(node).paddingTop));
            expect(top).toBeGreaterThanOrEqual(16);

            await page.keyboard.press('Escape');
            await expect(drawer).toHaveCount(0);
            await expect(page.getByRole('button', { name: 'Chat menu' })).toBeFocused();
            expect(await isInert(page, 'Write as Ash')).toBe(false);
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });

    test('a Memory dot takes a tap 18px from its centre, outside the dot, and the graph is one Tab stop the arrow keys move through', async ({
        page,
        request,
    }) => {
        const { storyId, chatId, mira, jonah } = await createStory(request);
        const lamp = await addMemory(request, storyId, chatId, '{user} gave Mira the lamp.', [mira]);
        await addMemory(request, storyId, chatId, 'The storm lasted three days.', [jonah]);
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            await openMemoryFromMenu(page);
            const drawer = page.getByRole('dialog', { name: 'Memory' });
            await drawer.getByRole('radio', { name: 'Graph' }).tap();
            const graph = drawer.getByRole('group', { name: 'Memory graph' });
            const dot = graph.locator(`g[data-memory-id="${lamp}"]`);
            await dot.scrollIntoViewIfNeeded();

            // The point 18px from the dot's centre that is furthest from every other node.
            const point = await graph.evaluate((svg, key) => {
                const centre = (element: Element) => {
                    const box = element.getBoundingClientRect();
                    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
                };
                const target = svg.querySelector(`[data-node="${key}"] circle:not(.memory-graph-hit)`)!;
                const at = centre(target);
                const others = [...svg.querySelectorAll('[data-node]')]
                    .filter((node) => node.getAttribute('data-node') !== key && !node.getAttribute('data-node')!.startsWith('b:'))
                    .map((node) => {
                        const ring = node.querySelector('circle:not(.memory-graph-hit)')!;
                        return { ...centre(ring), r: ring.getBoundingClientRect().width / 2 };
                    });
                let best = { x: 0, y: 0, clear: -Infinity };
                for (let step = 0; step < 16; step++) {
                    const angle = (step / 16) * 2 * Math.PI;
                    const x = at.x + 18 * Math.cos(angle);
                    const y = at.y + 18 * Math.sin(angle);
                    const clear = Math.min(...others.map((other) => Math.hypot(x - other.x, y - other.y) - other.r));
                    if (clear > best.clear) best = { x, y, clear };
                }
                return { ...best, drawn: target.getBoundingClientRect().width };
            }, `m:${lamp}`);
            // The dot is drawn small, and the tap lands well outside it.
            expect(point.drawn).toBeLessThan(18);
            await page.touchscreen.tap(point.x, point.y);
            await expect(dot).toHaveAttribute('aria-pressed', 'true');
            await expect(drawer.getByRole('list', { name: 'Picked Memory' })).toContainText('Ash gave Mira the lamp.');

            // One Tab stop: the first person takes it, and arrows move on through the people to the dots.
            const people = graph.getByRole('button', { name: /Memor(y|ies)$/ });
            await expect(graph.locator('[tabindex="0"]')).toHaveCount(1);
            await graph.locator('[tabindex="0"]').focus();
            await page.keyboard.press('Home');
            await expect(people.first()).toBeFocused();
            await page.keyboard.press('ArrowRight');
            await expect(people.nth(1)).toBeFocused();
            await page.keyboard.press('End');
            await expect(graph.locator('g[data-memory-id]').last()).toBeFocused();
            await expect(graph.locator('[tabindex="0"]')).toHaveCount(1);

            // A person's name reads 12px or more as drawn.
            const nameSize = await graph.locator('.memory-graph-name').first().evaluate((text) => (text as SVGTextElement).getBoundingClientRect().height);
            expect(nameSize).toBeGreaterThanOrEqual(12);
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });

    test('a Bond chart says its axes in words, its labels are 12px or more, and its time runs from Start to Now', async ({ page, request }) => {
        const { storyId, chatId, mira } = await createStory(request);
        await request.post(`/api/stories/${storyId}/starting-bonds`, {
            data: { fromCharacterId: mira, toCharacterId: null, label: 'Wary', description: 'She expects the new keeper to leave.', trust: -1 },
        });
        await request.delete('/api/testing/fake-gateway');
        await request.post('/api/testing/fake-gateway/text', {
            data: { kind: 'turn', replies: [{ text: 'Mira looks up at last.\n\n@Mira: In this weather?', model: 'glm-5.3' }] },
        });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [JUDGEMENT] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: ['{"operations":[]}'] } });
        // The Chat made before the Bond was seeded has none: play in a new one.
        const chat = await request.post(`/api/stories/${storyId}/chats`);
        const playedId = (await chat.json()).id as number;
        await request.post(`/api/stories/${storyId}/chats/${playedId}/messages`, { data: { text: 'I climbed the cliff path in the storm.' } });
        await expect
            .poll(async () => (await (await request.get(`/api/stories/${storyId}/chats/${playedId}`)).json()).messages[2].judge.status as string)
            .toBe('done');
        try {
            await page.goto(`/stories/${storyId}/chats/${playedId}/dashboard`);
            const bond = page.getByRole('group', { name: 'Mira toward Ash' });
            await bond.locator('summary').click();
            const chart = bond.getByRole('group', { name: 'How Mira feels toward Ash over the Chat' });
            await expect(chart).toHaveAccessibleDescription(
                'Trust went from wary to unsure; Affection went from indifferent to fond; Desire stayed no pull; Tension went from at ease to uneasy.',
            );
            await expect(chart.getByText('Start', { exact: true })).toBeVisible();
            await expect(chart.getByText('Now', { exact: true })).toBeVisible();
            for (const words of ['Trust', 'betrayed … trusts completely']) {
                const size = await chart.getByText(words, { exact: true }).evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
                expect(size).toBeGreaterThanOrEqual(12);
            }
            // The pin is a 44px target.
            const pin = (await chart.getByRole('button', { name: /^Turning point/ }).boundingBox())!;
            expect(pin.width).toBeGreaterThanOrEqual(44);
            expect(pin.height).toBeGreaterThanOrEqual(44);
        } finally {
            await request.delete('/api/testing/fake-gateway');
            await request.delete(`/api/stories/${storyId}`);
        }
    });

    test('Rename on the Chats list has a label you can see, Escape cancels it, and focus comes back to Rename', async ({ page, request }) => {
        const { storyId } = await createStory(request);
        try {
            await page.goto(`/stories/${storyId}/chats`);
            await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
            const chat = page.getByRole('list', { name: 'Chats' }).getByRole('listitem').first();
            await chat.getByRole('button', { name: /^Rename/ }).click();
            const field = chat.getByLabel('Chat title');
            await expect(field).toBeFocused();
            await expect(chat.locator('label', { hasText: 'Chat title' })).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(field).toHaveCount(0);
            await expect(chat.getByRole('button', { name: /^Rename/ })).toBeFocused();
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });
});

test.describe('between a phone and a desktop', () => {
    test.use({ viewport: { width: 800, height: 900 } });

    test('the drawer covers part of the Chat over a scrim, as a dialog, and a tap on the scrim closes it', async ({ page, request }) => {
        const { storyId, chatId } = await createStory(request);
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            await openMemoryFromMenu(page);
            const drawer = page.getByRole('dialog', { name: 'Memory' });
            await expect(drawer).toBeVisible();
            const box = (await drawer.boundingBox())!;
            expect(box.x).toBeGreaterThan(300);
            expect(await isInert(page, 'Write as Ash')).toBe(true);
            await page.mouse.click(100, 450);
            await expect(drawer).toHaveCount(0);
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });
});

test.describe('on a desktop', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('the docked drawer leaves the Chat in use, and Escape closes it while focus is in it', async ({ page, request }) => {
        const { storyId, chatId } = await createStory(request);
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            await openMemoryFromMenu(page);
            const drawer = page.getByRole('complementary', { name: 'Memory' });
            await expect(drawer).toBeVisible();
            await expect(page.getByRole('dialog', { name: 'Memory' })).toHaveCount(0);
            expect(await isInert(page, 'Write as Ash')).toBe(false);
            await expect(drawer.getByRole('heading', { name: 'Memory' })).toBeFocused();
            await page.keyboard.press('Escape');
            await expect(drawer).toHaveCount(0);
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });
});
