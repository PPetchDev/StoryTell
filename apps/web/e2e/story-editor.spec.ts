import { expect, Page, test } from '@playwright/test';

async function expectSaved(page: Page) {
    await expect(page.getByRole('status')).toHaveText('Saved');
}

test('writes a Story by hand, sees it become playable, and the edits survive a reload', async ({
    page,
}) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New Story' }).click();
    await expect(page).toHaveURL(/\/stories\/\d+$/);
    const storyUrl = page.url();

    const status = page.getByRole('region', { name: 'Playable status' });
    await expect(status).toContainText('Not playable yet');
    await expect(status).toContainText('Title');
    await expect(status).toContainText('At least one Character');

    const storySection = page.getByRole('region', { name: 'Story' });
    await storySection.getByLabel('Title').fill('The Lighthouse');
    await storySection.getByLabel('Setting').fill('A lighthouse on a storm-cut island, 1890s.');
    await storySection.getByLabel('Opening').fill('The lamp went out an hour ago.');

    const style = page.getByRole('region', { name: 'Style' });
    await style.getByLabel('POV').selectOption('first');
    await style.getByLabel('Image style').fill('ink wash, muted');

    const role = page.getByRole('region', { name: 'Role' });
    await role.getByLabel('Name').fill('The new keeper');
    await role.getByLabel('Description').fill('Arrived this morning.');
    await expectSaved(page);

    await expect(status).not.toContainText('Title');
    await expect(status).not.toContainText('Role');
    await expect(status).toContainText('At least one Character');

    await page.getByRole('button', { name: 'Add Character' }).click();
    const character = page.getByRole('region', { name: 'Character 1' });
    await character.getByLabel('Name', { exact: true }).fill('Mira');
    await character.getByLabel('Appearance').fill('Tall, grey eyes.');
    await character.getByLabel('Personality').fill('Guarded and dry.');
    await expect(status).toContainText('Mira: Voice');
    await character.getByLabel('Voice').fill('Short sentences.');
    await character.getByRole('button', { name: 'Add example line' }).click();
    await character.getByLabel('Example line 1', { exact: true }).fill('Go away.');
    await expectSaved(page);

    await expect(status).toContainText('Playable');
    await expect(status).not.toContainText('Not playable yet');

    // A Scene before the last one needs its move-on condition; the last one does not.
    await page.getByRole('button', { name: 'Add Scene' }).click();
    const scene1 = page.getByRole('region', { name: 'Scene 1' });
    await scene1.getByLabel('Name').fill('Arrival');
    await scene1.getByLabel('Situation / goal').fill('Reach the lamp room.');
    await expectSaved(page);
    await expect(status).toContainText('Playable');
    await page.getByRole('button', { name: 'Add Scene' }).click();
    await expect(status).toContainText('Arrival: Move-on condition');
    await scene1.getByLabel('Move-on condition').fill('Once Mira lets you up the stairs.');
    const scene2 = page.getByRole('region', { name: 'Scene 2' });
    await scene2.getByLabel('Name').fill('The lamp');
    await scene2.getByLabel('Situation / goal').fill('Light it.');
    await expectSaved(page);
    await expect(status).toContainText('Playable');
    await expect(status).not.toContainText('Not playable yet');

    await page.reload();
    await expect(page.getByRole('region', { name: 'Story' }).getByLabel('Title')).toHaveValue('The Lighthouse');
    await expect(page.getByRole('region', { name: 'Style' }).getByLabel('POV')).toHaveValue('first');
    await expect(page.getByRole('region', { name: 'Style' }).getByLabel('Image style')).toHaveValue('ink wash, muted');
    await expect(page.getByRole('region', { name: 'Role' }).getByLabel('Name')).toHaveValue('The new keeper');
    const reloaded = page.getByRole('region', { name: 'Character 1' });
    await expect(reloaded.getByLabel('Voice')).toHaveValue('Short sentences.');
    await expect(reloaded.getByLabel('Example line 1', { exact: true })).toHaveValue('Go away.');
    await expect(page.getByRole('region', { name: 'Scene 2' }).getByLabel('Name')).toHaveValue('The lamp');
    await expect(page.getByRole('region', { name: 'Playable status' })).toContainText('Playable');

    // The home screen lists it as playable.
    await page.goto('/');
    const listed = page.getByRole('list', { name: 'Stories' }).getByRole('link', { name: /The Lighthouse/ });
    await expect(listed).toContainText('Playable');
    await listed.click();
    await expect(page).toHaveURL(storyUrl);

    // Delete after confirming, so the suite leaves the database as it found it.
    await page.getByRole('button', { name: 'Delete Story' }).click();
    await page.getByRole('group', { name: 'Delete this Story and everything under it?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('No Stories yet.')).toBeVisible();
});
