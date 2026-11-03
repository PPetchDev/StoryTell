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
        });
        expect(body.playModels.map((m: { id: string }) => m.id)).toEqual(['glm-5.3', 'deepseek-v4-pro']);
        expect(body.imageModels.map((m: { id: string }) => m.id)).toEqual([
            'seedream-v4-edit',
            'qwen-edit-uncensored',
        ]);
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
    ])('refuses %o', async (patch) => {
        const { body } = await t.http.put('/api/settings').send(patch).expect(400);

        expect(body.error.code).toBe('400.000.000');
    });
});
