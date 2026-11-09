import { CANDIDATE_MODELS } from '../src/service/model-gateway/real/model-table.js';
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
        // List prices per million tokens from OpenRouter's endpoints API on DeepInfra, and a long
        // turn: 16k prompt tokens uncached plus the Long reply's 1,400 output tokens, to the cent.
        // GLM-5.3: 16,000 × $0.5625/M + 1,400 × $2.50/M = $0.0125 → $0.01.
        // DeepSeek V4 Pro: 16,000 × $1.30/M + 1,400 × $2.60/M = $0.02444 → $0.02.
        expect(
            body.playModels.map((m: Record<string, unknown>) => [m.id, m.label, m.priceUsdPerMillion, m.longTurnUsd]),
        ).toEqual([
            ['glm-5.3', 'GLM-5.3 (DeepInfra)', { input: 0.5625, output: 2.5, cachedInput: 0.125 }, 0.01],
            ['deepseek-v4-pro', 'DeepSeek V4 Pro (DeepInfra)', { input: 1.3, output: 2.6, cachedInput: 0.1 }, 0.02],
        ]);
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

    it('never offers or takes a candidate play model before it has passed the smoke run', async () => {
        const candidates = Object.keys(CANDIDATE_MODELS);
        expect(candidates).toEqual(['kimi-k3.1-pro', 'kimi-k2.6', 'qwen3.5-397b']);

        const { body } = await t.http.get('/api/settings').expect(200);
        expect(body.playModels.map((m: { id: string }) => m.id).filter((id: string) => candidates.includes(id))).toEqual([]);
        for (const candidate of candidates) {
            const refused = await t.http.put('/api/settings').send({ playModel: candidate }).expect(400);
            expect(refused.body.error.code).toBe('400.000.000');
            await t.http.put(`/api/settings/samplers/${candidate}`).send({ temperature: 0.7 }).expect(400);
        }
        expect((await t.http.get('/api/settings').expect(200)).body.settings.playModel).toBe(body.settings.playModel);
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
