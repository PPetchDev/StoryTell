import { APIRequestContext, expect, Page, test } from '@playwright/test';

// Used on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const ALL_NULL = { temperature: null, minP: null, topP: null, repetitionPenalty: null };

/** Leaves the shared e2e database as it was found. */
async function resetSampling(request: APIRequestContext) {
    await request.put('/api/settings', { data: { playModel: 'glm-5.3' } });
    for (const model of ['glm-5.3', 'deepseek-v4-pro']) {
        await request.put(`/api/settings/samplers/${model}`, { data: ALL_NULL });
    }
}

async function openSampling(page: Page) {
    const fold = page.getByRole('button', { name: 'Sampling' });
    if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click();
}

async function saved(page: Page) {
    await expect(page.getByRole('status').filter({ hasText: /Sav|save/ })).toHaveText('Saved');
}

test.beforeEach(async ({ request }) => {
    await resetSampling(request);
});

test.afterEach(async ({ request }) => {
    await resetSampling(request);
});

test('a temperature saves as it is typed and survives a reload', async ({ page, request }) => {
    await page.goto('/settings');
    await openSampling(page);
    await expect(page.getByText("Blank uses the host's default and sends nothing. Used for turns, Suggested replies and Write for me.")).toBeVisible();
    const temperature = page.getByLabel('Temperature');
    await expect(temperature).toHaveValue('');
    await expect(temperature).toHaveAttribute('placeholder', 'Default');

    await temperature.fill('0.85');
    await saved(page);
    const stored = await (await request.get('/api/settings')).json();
    expect(stored.settings.samplers).toEqual({ 'glm-5.3': { temperature: 0.85 } });

    await page.reload();
    await openSampling(page);
    await expect(page.getByLabel('Temperature')).toHaveValue('0.85');

    // Clearing the field resets it: nothing is sent for it any more.
    await page.getByLabel('Temperature').fill('');
    await saved(page);
    const cleared = await (await request.get('/api/settings')).json();
    expect(cleared.settings.samplers).toEqual({});
});

test('an out-of-range temperature is refused beside the field and not saved', async ({ page, request }) => {
    await page.goto('/settings');
    await openSampling(page);
    const temperature = page.getByLabel('Temperature');

    await temperature.fill('0.7');
    await saved(page);
    await temperature.fill('2.5');

    await expect(page.getByRole('alert').filter({ hasText: 'Enter a number from 0 to 2' })).toBeVisible();
    await expect(temperature).toHaveAttribute('aria-invalid', 'true');
    // Wait past the autosave delay, then check nothing new landed.
    await page.waitForTimeout(1000);
    const stored = await (await request.get('/api/settings')).json();
    expect(stored.settings.samplers).toEqual({ 'glm-5.3': { temperature: 0.7 } });

    // Too many decimals is refused the same way.
    await temperature.fill('0.555');
    await expect(page.getByRole('alert').filter({ hasText: 'Enter a number from 0 to 2' })).toBeVisible();
});

test('every offered parameter has its field, explanation and the maker’s suggestion', async ({ page }) => {
    await page.goto('/settings');
    await openSampling(page);

    for (const [label, explanation] of [
        ['Temperature', 'Higher is more surprising, lower more predictable.'],
        ['Min-p', 'Trims unlikely word choices; higher trims more.'],
        ['Top-p', 'Keeps only the likeliest words; lower is narrower.'],
        ['Repetition penalty', 'Above 1 pushes back on repeated words and details.'],
    ]) {
        await expect(page.getByLabel(label, { exact: true })).toHaveValue('');
        await expect(page.getByLabel(label, { exact: true })).toHaveAccessibleDescription(explanation);
    }
    // GLM-5.3's maker gives no suggestion; DeepSeek V4's suggests temperature 1.0 and top_p 1.0.
    await expect(page.getByText(/Maker suggests/)).toHaveCount(0);
    await page.getByLabel('Play model').selectOption('deepseek-v4-pro');
    await expect(page.getByText('Maker suggests 1')).toHaveCount(2);
    await expect(page.getByLabel('Temperature')).toHaveAccessibleDescription(/Maker suggests 1/);
    await expect(page.getByLabel('Min-p')).not.toHaveAccessibleDescription(/Maker suggests/);
});

test('min-p and top-p save and survive a reload; Reset blanks every field and saves that', async ({ page, request }) => {
    await page.goto('/settings');
    await openSampling(page);
    const reset = page.getByRole('button', { name: 'Reset to defaults' });
    await expect(reset).toBeDisabled();

    await page.getByLabel('Min-p').fill('0.05');
    await page.getByLabel('Top-p').fill('0.9');
    await expect(reset).toBeEnabled();
    await saved(page);

    await page.reload();
    await openSampling(page);
    await expect(page.getByLabel('Min-p')).toHaveValue('0.05');
    await expect(page.getByLabel('Top-p')).toHaveValue('0.9');
    const stored = await (await request.get('/api/settings')).json();
    expect(stored.settings.samplers).toEqual({ 'glm-5.3': { minP: 0.05, topP: 0.9 } });

    await page.getByRole('button', { name: 'Reset to defaults' }).click();
    await page.getByRole('group', { name: /Blank all four/ }).getByRole('button', { name: 'Reset' }).click();
    for (const label of ['Temperature', 'Min-p', 'Top-p', 'Repetition penalty']) {
        await expect(page.getByLabel(label, { exact: true })).toHaveValue('');
    }
    await expect(page.getByRole('button', { name: 'Reset to defaults' })).toBeDisabled();
    await saved(page);
    const cleared = await (await request.get('/api/settings')).json();
    expect(cleared.settings.samplers).toEqual({});

    await page.reload();
    await openSampling(page);
    await expect(page.getByLabel('Min-p')).toHaveValue('');
});

test('Reset also drops an edit still waiting to be sent', async ({ page, request }) => {
    await page.goto('/settings');
    await openSampling(page);

    await page.getByLabel('Temperature').fill('1.1');
    await page.getByRole('button', { name: 'Reset to defaults' }).click();
    await page.getByRole('group', { name: /Blank all four/ }).getByRole('button', { name: 'Reset' }).click();

    await saved(page);
    await page.waitForTimeout(1000);
    const stored = await (await request.get('/api/settings')).json();
    expect(stored.settings.samplers).toEqual({});
    await expect(page.getByLabel('Temperature')).toHaveValue('');
});

test('switching the play model shows that model’s values, and switching back the first one’s', async ({ page, request }) => {
    await page.goto('/settings');
    await openSampling(page);
    await page.getByLabel('Temperature').fill('0.6');
    await saved(page);

    await page.getByLabel('Play model').selectOption('deepseek-v4-pro');
    await expect(page.getByLabel('Temperature')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Reset to defaults' })).toBeDisabled();
    await page.getByLabel('Repetition penalty').fill('1.05');
    await saved(page);

    await page.getByLabel('Play model').selectOption('glm-5.3');
    await expect(page.getByLabel('Temperature')).toHaveValue('0.6');
    await expect(page.getByLabel('Repetition penalty')).toHaveValue('');
    await saved(page);

    const stored = await (await request.get('/api/settings')).json();
    expect(stored.settings.samplers).toEqual({ 'glm-5.3': { temperature: 0.6 }, 'deepseek-v4-pro': { repetitionPenalty: 1.05 } });
});

test('a parameter the model is not offered has no field', async ({ page }) => {
    // Every play model today is offered all four, so the Settings answer is narrowed here.
    await page.route('**/api/settings', async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        const response = await route.fetch();
        const body = await response.json();
        body.playModels[0].samplers = body.playModels[0].samplers.filter((s: { param: string }) => s.param !== 'minP');
        await route.fulfill({ response, json: body });
    });
    await page.goto('/settings');
    await openSampling(page);

    await expect(page.getByLabel('Temperature')).toBeVisible();
    await expect(page.getByLabel('Top-p')).toBeVisible();
    await expect(page.getByLabel('Min-p')).toHaveCount(0);
});
