import { expect, Page, test } from '@playwright/test';

async function expectSaved(page: Page) {
    await expect(page.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');
}

async function openTab(page: Page, name: string) {
    await page.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
}

test('writes a Story by hand, sees it become playable, and the edits survive a reload', async ({
    page,
}) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New Story' }).click();
    // The blank path beside "Draft from idea" (ticket 22).
    await page.getByRole('region', { name: 'New Story' }).getByRole('button', { name: 'Start blank' }).click();
    await expect(page).toHaveURL(/\/stories\/\d+$/);
    const storyUrl = page.url();

    const status = page.getByRole('region', { name: 'Playable status' });
    const play = page.getByRole('button', { name: 'Play', exact: true });
    await expect(status).toContainText('before you can play');
    // The list starts folded to its count (audit M47); opened, it stays open on this Story.
    const toggle = status.getByRole('button', { name: /to fill in/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(status.getByRole('button', { name: 'Title' })).toHaveCount(0);
    await toggle.click();
    await expect(status.getByRole('button', { name: 'Title' })).toBeVisible();
    await expect(status.getByRole('button', { name: 'At least one Character' })).toBeVisible();
    await expect(play).toBeDisabled();

    const storySection = page.getByRole('region', { name: 'Story' });
    await storySection.getByLabel('Title').fill('The Lighthouse');
    await storySection.getByLabel('Setting').fill('A lighthouse on a storm-cut island, 1890s.');
    await storySection.getByLabel('Opening').fill('The lamp went out an hour ago.');

    await openTab(page, 'Style');
    const style = page.getByRole('region', { name: 'Style' });
    const pov = style.getByRole('radiogroup', { name: 'Point of view' });
    await expect(pov.getByRole('radio', { name: '2nd person' })).toBeChecked();
    await pov.getByRole('radio', { name: '1st person' }).click();
    await expect(pov.getByRole('radio', { name: '1st person' })).toBeChecked();
    await style.getByLabel('Image style').fill('ink wash, muted');

    await openTab(page, 'Role');
    const role = page.getByRole('region', { name: 'Role' });
    await role.getByLabel('Name').fill('The new keeper');
    await role.getByLabel('Description').fill('Arrived this morning.');
    await expectSaved(page);

    await expect(status).not.toContainText('Title');
    await expect(status).not.toContainText('Role');
    // "At least one Character" takes the author to Add Character.
    await status.getByRole('button', { name: 'At least one Character' }).click();
    await expect(page).toHaveURL(/\?tab=characters$/);
    await expect(page.getByRole('button', { name: 'Add Character' })).toBeFocused();

    await page.getByRole('button', { name: 'Add Character' }).click();
    const character = page.getByRole('region', { name: 'Character 1' });
    await character.getByLabel('Name', { exact: true }).fill('Mira');
    await character.getByLabel('Appearance').fill('Tall, grey eyes.');
    await character.getByLabel('Personality').fill('Guarded and dry.');
    await expect(status).toContainText('Mira: Voice');
    await expect(character.getByText('Needed to play')).toHaveCount(1);
    await character.getByLabel('Voice', { exact: true }).fill('Short sentences.');
    await character.getByRole('button', { name: 'Add example line' }).click();
    await character.getByLabel('Example line 1', { exact: true }).fill('Go away.');
    await expectSaved(page);

    await expect(status).toContainText('Playable');
    await expect(status).not.toContainText('before you can play');
    await expect(play).toBeEnabled();

    // Starting Bonds have a tab of their own.
    await openTab(page, 'Bonds');
    const miraBonds = page.getByRole('region', { name: 'Starting Bonds from Mira' });
    await miraBonds.getByRole('button', { name: 'Add Bond' }).click();
    const bond = miraBonds.getByRole('group', { name: 'Bond toward The new keeper (the Role)' });
    await bond.getByLabel('Label').fill('wary');
    await expectSaved(page);

    // A Scene before the last one needs its move-on condition; the last one does not.
    await openTab(page, 'Scenes');
    await page.getByRole('button', { name: 'Add Scene' }).click();
    const scene1 = page.getByRole('region', { name: 'Scene 1' });
    await scene1.getByLabel('Name').fill('Arrival');
    await scene1.getByLabel('Situation / goal').fill('Reach the lamp room.');
    await expectSaved(page);
    await expect(status).toContainText('Playable');
    await page.getByRole('button', { name: 'Add Scene' }).click();
    await expect(status).toContainText('Arrival: Move-on condition');
    await expect(play).toBeDisabled();
    await scene1.getByLabel('Move-on condition').fill('Once Mira lets you up the stairs.');
    const scene2 = page.getByRole('region', { name: 'Scene 2' });
    await scene2.getByLabel('Name').fill('The lamp');
    await scene2.getByLabel('Situation / goal').fill('Light it.');
    await expectSaved(page);
    await expect(status).toContainText('Playable');
    await expect(play).toBeEnabled();

    await page.reload();
    await expect(page.getByRole('region', { name: 'Scene 2' }).getByLabel('Name')).toHaveValue('The lamp');
    await openTab(page, 'Story');
    await expect(page.getByRole('region', { name: 'Story' }).getByLabel('Title')).toHaveValue('The Lighthouse');
    await openTab(page, 'Style');
    await expect(
        page.getByRole('region', { name: 'Style' }).getByRole('radiogroup', { name: 'Point of view' }).getByRole('radio', { name: '1st person' }),
    ).toBeChecked();
    await expect(page.getByRole('region', { name: 'Style' }).getByLabel('Image style')).toHaveValue('ink wash, muted');
    await openTab(page, 'Role');
    await expect(page.getByRole('region', { name: 'Role' }).getByLabel('Name')).toHaveValue('The new keeper');
    await openTab(page, 'Characters');
    const reloaded = page.getByRole('region', { name: 'Character 1' });
    await expect(reloaded.getByLabel('Voice', { exact: true })).toHaveValue('Short sentences.');
    await expect(reloaded.getByLabel('Example line 1', { exact: true })).toHaveValue('Go away.');
    await openTab(page, 'Bonds');
    await expect(
        page.getByRole('region', { name: 'Starting Bonds from Mira' }).getByRole('group', { name: /Bond toward/ }).getByLabel('Label'),
    ).toHaveValue('wary');
    await expect(page.getByRole('region', { name: 'Playable status' })).toContainText('Playable');

    // Home shows its card without the Draft badge, and the card's sheet opens the editor.
    await page.goto('/');
    const card = page.getByRole('list', { name: 'Stories' }).getByRole('button', { name: /The Lighthouse/ });
    await expect(card).not.toContainText('Draft');
    await card.click();
    await page.getByRole('dialog', { name: 'The Lighthouse' }).getByRole('link', { name: 'Edit Story' }).click();
    await expect(page).toHaveURL(storyUrl);

    // Delete after confirming, so the suite leaves the database as it found it.
    await page.getByRole('button', { name: 'Delete Story' }).click();
    await page.getByRole('group', { name: 'Delete this Story and everything under it?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('No Stories yet.')).toBeVisible();
});
