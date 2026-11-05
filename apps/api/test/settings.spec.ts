import { startTestApp, TestApp } from './harness/test-app.js';

describe('Settings', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    it('starts with the spec defaults and lists the models that can be chosen', async () => {
        const { body } = await t.http.get('/api/settings').expect(200);

        expect(body.settings).toMatchObject({
            playModel: 'glm-5.3',
            imageModel: 'seedream-v4-edit',
            textLowCreditPercent: 20,
            imageLowCreditPercent: 20,
            textCreditCapUsd: 22,
            imageCreditCapUsd: 8,
            snapshotSize: '1K',
        });
        expect(body.playModels.map((m: { id: string }) => m.id)).toEqual(['glm-5.3', 'deepseek-v4-pro']);
        expect(body.imageModels.map((m: { id: string }) => m.id)).toEqual([
            'seedream-v4-edit',
            'seedream-v5-pro-edit',
            'qwen-edit-uncensored',
        ]);
        expect(body.imageModels[1].label).toBe('Seedream V5 Pro edit (Venice, $0.06)');
        // Each Snapshot model with the sizes it is offered at and what one Snapshot costs at each.
        expect(body.imageModels.map((m: { id: string; sizes: unknown }) => [m.id, m.sizes])).toEqual([
            ['seedream-v4-edit', [{ size: '1K', priceUsd: 0.05 }]],
            [
                'seedream-v5-pro-edit',
                [
                    { size: '1K', priceUsd: 0.06 },
                    { size: '2K', priceUsd: 0.11 },
                ],
            ],
            ['qwen-edit-uncensored', [{ size: '1K', priceUsd: 0.04 }]],
        ]);
    });

    describe('Snapshot size', () => {
        afterEach(async () => {
            await t.http.put('/api/settings').send({ imageModel: 'seedream-v4-edit', snapshotSize: '1K' }).expect(200);
        });

        it('takes 2K for a model offered at 2K', async () => {
            await t.http.put('/api/settings').send({ imageModel: 'seedream-v5-pro-edit', snapshotSize: '2K' }).expect(200);

            const { body } = await t.http.get('/api/settings').expect(200);
            expect(body.settings).toMatchObject({ imageModel: 'seedream-v5-pro-edit', snapshotSize: '2K' });
        });

        it('refuses 2K for a model not offered at 2K', async () => {
            const { body } = await t.http
                .put('/api/settings')
                .send({ imageModel: 'seedream-v4-edit', snapshotSize: '2K' })
                .expect(422);

            expect(body.error.code).toBe('422.002.011');
            const after = await t.http.get('/api/settings').expect(200);
            expect(after.body.settings.snapshotSize).toBe('1K');
        });

        it('goes back to 1K when the model changes to one without 2K', async () => {
            await t.http.put('/api/settings').send({ imageModel: 'seedream-v5-pro-edit', snapshotSize: '2K' }).expect(200);

            const { body } = await t.http.put('/api/settings').send({ imageModel: 'qwen-edit-uncensored' }).expect(200);

            expect(body.settings).toMatchObject({ imageModel: 'qwen-edit-uncensored', snapshotSize: '1K' });
        });
    });

    it('persists what is sent and keeps the rest', async () => {
        await t.http
            .put('/api/settings')
            .send({ playModel: 'deepseek-v4-pro', imageLowCreditPercent: 35, textCreditCapUsd: 25.5 })
            .expect(200);

        const { body } = await t.http.get('/api/settings').expect(200);

        expect(body.settings).toMatchObject({
            playModel: 'deepseek-v4-pro',
            imageModel: 'seedream-v4-edit',
            textLowCreditPercent: 20,
            imageLowCreditPercent: 35,
            textCreditCapUsd: 25.5,
            imageCreditCapUsd: 8,
        });
    });

    it.each([
        { playModel: 'gpt-5' },
        { imageModel: 'flux' },
        { textLowCreditPercent: 120 },
        { imageCreditCapUsd: -1 },
        { snapshotSize: '4K' },
    ])('refuses %o', async (patch) => {
        const { body } = await t.http.put('/api/settings').send(patch).expect(400);

        expect(body.error.code).toBe('400.000.000');
    });
});
