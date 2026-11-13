import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// Folding cards that remember, Character pictures with an initial for those without, and the
// desktop layout (spec: .scratch/desktop-and-folds/spec.md).

const FAKE = '/api/testing/fake-gateway';

interface Fixture {
    storyId: number;
    chatId: number;
    miraId: number;
    jonahId: number;
}

/**
 * A Story with Mira, who has a Reference image, and Jonah, who has none and no Voice yet (so the
 * Story is missing one field), one Chat with a Memory naming both.
 */
async function createStory(request: APIRequestContext): Promise<Fixture> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: 'The lamp went out an hour ago.' },
    });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    const character = async (name: string, voice: string) => {
        const made = await request.post(`/api/stories/${storyId}/characters`, {
            data: { name, appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice },
        });
        expect(made.ok()).toBe(true);
        // Adding a Character answers with the whole Story.
        const story = (await made.json()) as { characters: { id: number; name: string }[] };
        return story.characters.find((each) => each.name === name)!.id;
    };
    const miraId = await character('Mira', 'Short sentences.');
    const jonahId = await character('Jonah', 'Slow and kind.');

    await request.delete(FAKE);
    await request.post(`${FAKE}/image`, { data: { kind: 'reference_image', replies: [{}, {}, {}] } });
    const round = await (await request.post(`/api/stories/${storyId}/characters/${miraId}/reference-image/candidates`)).json();
    const picked = await request.put(`/api/stories/${storyId}/characters/${miraId}/reference-image`, {
        data: { candidateId: round.candidates[0].id },
    });
    expect(picked.ok()).toBe(true);

    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;
    const memory = await request.post(`/api/stories/${storyId}/chats/${chatId}/memories`, {
        data: { text: 'Mira and Jonah mended the boat together.', knownBy: [miraId, jonahId] },
    });
    expect(memory.ok()).toBe(true);
    return { storyId, chatId, miraId, jonahId };
}

async function openMemory(page: Page): Promise<Locator> {
    await page.getByRole('button', { name: 'Chat menu' }).click();
    await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
    const drawer = page.getByRole('complementary', { name: 'Memory' }).or(page.getByRole('dialog', { name: 'Memory' }));
    await expect(drawer).toBeVisible();
    return drawer;
}

const REFERENCE = 'img[src*="reference-images"]';

test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('the Story so far folds, and stays folded after a reload and in another Chat', async ({ page, request }) => {
        const { storyId, chatId } = await createStory(request);
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            let drawer = await openMemory(page);
            const card = drawer.getByRole('region', { name: 'Story so far' });
            const fold = card.getByRole('button', { name: 'Story so far' });
            await expect(fold).toHaveAttribute('aria-expanded', 'true');
            await expect(card.getByText('Not needed yet')).toBeVisible();

            await fold.click();
            await expect(fold).toHaveAttribute('aria-expanded', 'false');
            await expect(card.getByText('Not needed yet')).toBeHidden();

            await page.reload();
            drawer = await openMemory(page);
            await expect(drawer.getByRole('region', { name: 'Story so far' }).getByRole('button', { name: 'Story so far' })).toHaveAttribute(
                'aria-expanded',
                'false',
            );

            // The fold is one for every Chat.
            const other = await request.post(`/api/stories/${storyId}/chats`);
            await page.goto(`/stories/${storyId}/chats/${(await other.json()).id}`);
            drawer = await openMemory(page);
            const otherFold = drawer.getByRole('region', { name: 'Story so far' }).getByRole('button', { name: 'Story so far' });
            await expect(otherFold).toHaveAttribute('aria-expanded', 'false');

            await otherFold.click();
            await page.reload();
            drawer = await openMemory(page);
            await expect(drawer.getByRole('region', { name: 'Story so far' }).getByText('Not needed yet')).toBeVisible();
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });

    test('the Memory graph shows a Character\'s picture in their node, and the initial of one without', async ({ page, request }) => {
        const { storyId, chatId } = await createStory(request);
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            const drawer = await openMemory(page);
            await drawer.getByRole('radio', { name: 'Graph' }).click();
            const graph = drawer.getByRole('group', { name: 'Memory graph' });

            const mira = graph.getByRole('button', { name: /^Mira,/ });
            await expect(mira.locator('image')).toHaveAttribute('href', /reference-images\//);
            await expect(mira.locator('.memory-graph-initial')).toHaveCount(0);

            const jonah = graph.getByRole('button', { name: /^Jonah,/ });
            await expect(jonah.locator('image')).toHaveCount(0);
            await expect(jonah.locator('.memory-graph-initial')).toHaveText('J');

            // The worn identity has no picture: its initial.
            await expect(graph.getByRole('button', { name: /^Ash \(you\),/ }).locator('.memory-graph-initial')).toHaveText('A');
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });

    test('the Dashboard shows each Character\'s picture or initial, and their feelings fold and stay folded', async ({ page, request }) => {
        const { storyId, chatId } = await createStory(request);
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}/dashboard`);
            const feel = page.getByRole('region', { name: 'How the Characters feel' });
            const mira = feel.getByRole('region', { name: 'Mira' });
            const jonah = feel.getByRole('region', { name: 'Jonah' });
            await expect(mira.locator(REFERENCE)).toHaveCount(1);
            await expect(jonah.locator(REFERENCE)).toHaveCount(0);
            await expect(jonah.getByText('J', { exact: true })).toBeVisible();

            const fold = jonah.getByRole('button', { name: 'Jonah', exact: true });
            await expect(jonah.getByText('A stranger to everyone so far.')).toBeVisible();
            await fold.click();
            await expect(fold).toHaveAttribute('aria-expanded', 'false');
            await expect(jonah.getByText('A stranger to everyone so far.')).toBeHidden();

            await page.reload();
            const reloaded = page.getByRole('region', { name: 'How the Characters feel' });
            await expect(reloaded.getByRole('region', { name: 'Jonah' }).getByRole('button', { name: 'Jonah', exact: true })).toHaveAttribute(
                'aria-expanded',
                'false',
            );
            await expect(reloaded.getByRole('region', { name: 'Mira' }).getByText('A stranger to everyone so far.')).toBeVisible();
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });

    test('Story editor cards start folded and remember being opened; a missing field\'s link opens its card', async ({ page, request }) => {
        const { storyId, jonahId } = await createStory(request);
        // Jonah loses his Voice, which a Story needs to be played.
        await request.patch(`/api/stories/${storyId}/characters/${jonahId}`, { data: { voice: '' } });
        try {
            await page.goto(`/stories/${storyId}?tab=characters`);
            const mira = page.getByRole('region', { name: 'Character 1' });
            const jonah = page.getByRole('region', { name: 'Character 2' });
            const miraFold = mira.getByRole('button', { name: 'Mira', exact: true });
            const jonahFold = jonah.getByRole('button', { name: 'Jonah', exact: true });
            await expect(mira.getByRole('heading', { name: 'Mira' }).locator(REFERENCE)).toHaveCount(1);
            await expect(jonah.getByRole('heading', { name: 'Jonah' }).getByText('J', { exact: true })).toBeVisible();

            // Both start folded, to their header (docs/ui-audit-2026-11-13.md, H2).
            await expect(miraFold).toHaveAttribute('aria-expanded', 'false');
            await expect(jonahFold).toHaveAttribute('aria-expanded', 'false');
            await expect(mira.getByLabel('Name')).toBeHidden();
            await expect(jonah.getByLabel('Name')).toBeHidden();
            // Folded, Jonah's card says it needs filling in; Mira's, with nothing missing, doesn't.
            await expect(jonah.getByText('Needs filling in')).toBeVisible();
            await expect(mira.getByText('Needs filling in')).toHaveCount(0);

            // Opened, Mira's card stays open after a reload; Jonah's stays folded.
            await miraFold.click();
            await expect(miraFold).toHaveAttribute('aria-expanded', 'true');
            await expect(mira.getByLabel('Name')).toBeVisible();
            await page.reload();
            await expect(page.getByRole('region', { name: 'Character 1' }).getByRole('button', { name: 'Mira', exact: true })).toHaveAttribute(
                'aria-expanded',
                'true',
            );
            await expect(page.getByRole('region', { name: 'Character 1' }).getByLabel('Name')).toBeVisible();
            await expect(page.getByRole('region', { name: 'Character 2' }).getByRole('button', { name: 'Jonah', exact: true })).toHaveAttribute(
                'aria-expanded',
                'false',
            );
            await expect(page.getByRole('region', { name: 'Character 2' }).getByLabel('Name')).toBeHidden();

            // Folded again, it stays folded after a reload.
            await miraFold.click();
            await expect(miraFold).toHaveAttribute('aria-expanded', 'false');
            await expect(mira.getByLabel('Name')).toBeHidden();
            await page.reload();
            await expect(page.getByRole('region', { name: 'Character 1' }).getByRole('button', { name: 'Mira', exact: true })).toHaveAttribute(
                'aria-expanded',
                'false',
            );
            await expect(page.getByRole('region', { name: 'Character 1' }).getByLabel('Name')).toBeHidden();

            // The missing item's link opens Jonah's folded card on the field.
            await expect(jonah.getByText('Needs filling in')).toBeVisible();
            // The list starts folded to its count (audit M47).
            await page.getByRole('region', { name: 'Playable status' }).getByRole('button', { name: /to fill in/ }).click();
            await page.getByRole('region', { name: 'Playable status' }).getByRole('button', { name: /Jonah: Voice/ }).click();
            await expect(jonahFold).toHaveAttribute('aria-expanded', 'true');
            await expect(jonah.getByLabel('Voice', { exact: true })).toBeFocused();
            await expect(jonah.getByText('Needs filling in')).toHaveCount(0);
            // Opened by the link, it is remembered as open too.
            await page.reload();
            await expect(page.getByRole('region', { name: 'Character 2' }).getByRole('button', { name: 'Jonah', exact: true })).toHaveAttribute(
                'aria-expanded',
                'true',
            );
            await expect(page.getByRole('region', { name: 'Character 2' }).getByLabel('Voice', { exact: true })).toBeVisible();
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });
});

test.describe('on a desktop', () => {
    test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });

    test('the nav is a side rail on every page, the Chat included, and Memory docks beside the thread', async ({ page, request }) => {
        const { storyId, chatId } = await createStory(request);
        try {
            await page.goto('/');
            const nav = page.getByRole('navigation', { name: 'Main' });
            const rail = (await nav.boundingBox())!;
            expect(rail.x).toBe(0);
            expect(rail.height).toBe(900);
            expect(rail.width).toBeLessThan(140);
            // Home's covers sit several to a row.
            await expect(page.getByRole('main')).toHaveCSS('max-width', '1152px');

            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
            const drawer = await openMemory(page);
            const thread = (await page.getByRole('region', { name: 'Messages' }).boundingBox())!;
            const docked = (await drawer.boundingBox())!;
            expect(thread.x).toBeGreaterThanOrEqual(rail.width - 1);
            expect(thread.x + thread.width).toBeLessThanOrEqual(docked.x + 1);
            // The thread is still there to read and the composer to write in.
            await expect(page.getByRole('textbox', { name: 'Write as Ash' })).toBeInViewport();

            // The editor's tabs are a list down the left of the panel.
            await page.goto(`/stories/${storyId}?tab=characters`);
            const tabs = (await page.getByRole('tablist', { name: 'Story sections' }).boundingBox())!;
            const panel = (await page.getByRole('tabpanel').boundingBox())!;
            expect(tabs.x + tabs.width).toBeLessThanOrEqual(panel.x);
            expect(tabs.height).toBeGreaterThan(tabs.width);
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });
});
