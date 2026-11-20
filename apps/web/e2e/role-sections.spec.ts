import { expect, test } from '@playwright/test';

// The Role's own sections (.scratch/role-sections/spec.md), on a 360px phone: the author adds
// headed blocks of free text under the Description, reorders and removes them, and they are kept.
test.use({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true });

test('the author writes their own Role sections, reorders and removes them, on the Role tab', async ({ page, request }) => {
    const created = await request.post('/api/stories', { data: { title: 'The Moonwood', setting: 'A silver forest.', opening: '@Mira: Who goes there?' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Rin', description: 'A fox reborn.' } });
    const sections = async () => (await (await request.get(`/api/stories/${storyId}`)).json()).role.sections;
    try {
        await page.goto(`/stories/${storyId}`);
        await page.getByRole('tab', { name: /^Role/ }).tap();
        const card = page.getByRole('region', { name: 'Your own sections' });
        const section = (n: number) => card.getByRole('group', { name: `Section ${n}` });

        await card.getByRole('button', { name: '+ Add a section' }).tap();
        // Text typed before the heading is saved too: the heading is optional.
        await expect(section(1)).toContainText('Optional. Without one, the text is read on its own.');
        await section(1).getByRole('textbox', { name: 'Text' }).fill('Reads a fight before it happens.');
        await expect(async () => {
            expect(await sections()).toEqual([{ heading: '', text: 'Reads a fight before it happens.' }]);
        }).toPass();
        await section(1).getByRole('textbox', { name: 'Heading' }).fill('Powers');
        await card.getByRole('button', { name: '+ Add a section' }).tap();
        await section(2).getByRole('textbox', { name: 'Heading' }).fill('Appearance');
        await section(2).getByRole('textbox', { name: 'Text' }).fill('Nine fluffy tails.');
        await expect(page.getByText('Saved', { exact: true })).toBeVisible();
        await expect(async () => {
            expect(await sections()).toEqual([
                { heading: 'Powers', text: 'Reads a fight before it happens.' },
                { heading: 'Appearance', text: 'Nine fluffy tails.' },
            ]);
        }).toPass();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

        await card.getByRole('button', { name: 'Move section 2 up' }).tap();
        await expect(async () => {
            expect((await sections()).map((s: { heading: string }) => s.heading)).toEqual(['Appearance', 'Powers']);
        }).toPass();

        // Kept through a reload; a removed one goes, and Undo brings it back.
        await page.reload();
        await page.getByRole('tab', { name: /^Role/ }).tap();
        await expect(section(1).getByRole('textbox', { name: 'Heading' })).toHaveValue('Appearance');
        await card.getByRole('button', { name: 'Remove section 2' }).tap();
        await expect(async () => {
            expect((await sections()).map((s: { heading: string }) => s.heading)).toEqual(['Appearance']);
        }).toPass();
        await card.getByRole('button', { name: 'Undo' }).tap();
        await expect(async () => {
            expect((await sections()).map((s: { heading: string }) => s.heading)).toEqual(['Appearance', 'Powers']);
        }).toPass();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});
