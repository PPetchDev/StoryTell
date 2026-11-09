import { PLAY_MODEL_CATALOGUE } from '../src/service/model-gateway/model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// Spec (models-and-samplers): "Sampling", API.
describe('Sampling in Settings', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterEach(async () => {
        await t.http.put('/api/settings').send({ playModel: 'glm-5.3' }).expect(200);
        for (const model of ['glm-5.3', 'deepseek-v4-pro']) {
            await t.http
                .put(`/api/settings/samplers/${model}`)
                .send({ temperature: null, minP: null, topP: null, repetitionPenalty: null })
                .expect(200);
        }
    });

    afterAll(async () => {
        await t.close();
    });

    const samplersPath = (model: string) => `/api/settings/samplers/${model}`;

    it('starts with nothing set, and lists what each play model is offered with the maker’s suggestions', async () => {
        const { body } = await t.http.get('/api/settings').expect(200);

        expect(body.settings.samplers).toEqual({});
        const ranges = [
            { param: 'temperature', min: 0, max: 2, step: 0.05 },
            { param: 'minP', min: 0, max: 0.5, step: 0.01 },
            { param: 'topP', min: 0.05, max: 1, step: 0.01 },
            { param: 'repetitionPenalty', min: 1, max: 1.5, step: 0.01 },
        ];
        expect(body.playModels[0].samplers).toEqual(ranges.map((range) => ({ ...range, suggested: null })));
        // The DeepSeek V4 card suggests temperature 1.0 and top_p 1.0.
        expect(body.playModels[1].samplers).toEqual([
            { ...ranges[0], suggested: 1 },
            { ...ranges[1], suggested: null },
            { ...ranges[2], suggested: 1 },
            { ...ranges[3], suggested: null },
        ]);
    });

    it('sets values, leaves absent ones, resets with null and answers the whole Settings', async () => {
        const first = await t.http.put(samplersPath('glm-5.3')).send({ temperature: 0.8, minP: 0.05 }).expect(200);
        expect(first.body.settings.samplers).toEqual({ 'glm-5.3': { temperature: 0.8, minP: 0.05 } });
        expect(first.body.settings.playModel).toBe('glm-5.3');
        expect(first.body.playModels).toHaveLength(2);
        expect(first.body.imageModels).toHaveLength(3);

        await t.http.put(samplersPath('glm-5.3')).send({ topP: 0.9 }).expect(200);
        const reset = await t.http.put(samplersPath('glm-5.3')).send({ temperature: null }).expect(200);
        expect(reset.body.settings.samplers).toEqual({ 'glm-5.3': { minP: 0.05, topP: 0.9 } });

        const { body } = await t.http.get('/api/settings').expect(200);
        expect(body.settings.samplers).toEqual({ 'glm-5.3': { minP: 0.05, topP: 0.9 } });
    });

    it('drops a model’s entry once every value is reset', async () => {
        await t.http.put(samplersPath('glm-5.3')).send({ temperature: 0.8 }).expect(200);

        const { body } = await t.http
            .put(samplersPath('glm-5.3'))
            .send({ temperature: null, minP: null, topP: null, repetitionPenalty: null })
            .expect(200);

        expect(body.settings.samplers).toEqual({});
    });

    it('takes the ends of each range', async () => {
        const { body } = await t.http
            .put(samplersPath('glm-5.3'))
            .send({ temperature: 2, minP: 0, topP: 0.05, repetitionPenalty: 1.5 })
            .expect(200);

        expect(body.settings.samplers['glm-5.3']).toEqual({ temperature: 2, minP: 0, topP: 0.05, repetitionPenalty: 1.5 });
    });

    it.each([
        { temperature: 2.01 },
        { temperature: -0.05 },
        { temperature: 0.555 },
        { temperature: 'hot' },
        { minP: 0.51 },
        { topP: 0.04 },
        { topP: 1.01 },
        { repetitionPenalty: 0.99 },
        { repetitionPenalty: 1.51 },
    ])('refuses %o and keeps what was there', async (patch) => {
        await t.http.put(samplersPath('glm-5.3')).send({ temperature: 0.7 }).expect(200);

        const { body } = await t.http.put(samplersPath('glm-5.3')).send(patch).expect(400);

        expect(body.error.code).toBe('400.000.000');
        const after = await t.http.get('/api/settings').expect(200);
        expect(after.body.settings.samplers).toEqual({ 'glm-5.3': { temperature: 0.7 } });
    });

    it('refuses a model that is not a play model', async () => {
        const { body } = await t.http.put(samplersPath('gpt-5')).send({ temperature: 0.7 }).expect(400);

        expect(body.error.code).toBe('400.000.000');
    });

    it('refuses a parameter the model is not offered, but lets it be reset', async () => {
        // Every play model today is offered all four, so this narrows one for the test.
        const offered = PLAY_MODEL_CATALOGUE['glm-5.3'].samplers;
        PLAY_MODEL_CATALOGUE['glm-5.3'].samplers = ['temperature', 'topP'];
        try {
            const { body } = await t.http.put(samplersPath('glm-5.3')).send({ temperature: 0.7, minP: 0.05 }).expect(422);
            expect(body.error.code).toBe('422.001.006');
            expect(body.error.message).toBe('GLM-5.3 is not offered Min-p.');

            const settings = await t.http.get('/api/settings').expect(200);
            expect(settings.body.settings.samplers).toEqual({});
            expect(settings.body.playModels[0].samplers.map((s: { param: string }) => s.param)).toEqual(['temperature', 'topP']);

            await t.http.put(samplersPath('glm-5.3')).send({ minP: null, temperature: 0.7 }).expect(200);
        } finally {
            PLAY_MODEL_CATALOGUE['glm-5.3'].samplers = offered;
        }
    });

    it('keeps each model’s values across a play-model switch', async () => {
        await t.http.put(samplersPath('glm-5.3')).send({ temperature: 0.8 }).expect(200);
        await t.http.put('/api/settings').send({ playModel: 'deepseek-v4-pro' }).expect(200);
        await t.http.put(samplersPath('deepseek-v4-pro')).send({ topP: 0.95 }).expect(200);
        await t.http.put('/api/settings').send({ playModel: 'glm-5.3' }).expect(200);

        const { body } = await t.http.get('/api/settings').expect(200);

        expect(body.settings.samplers).toEqual({ 'glm-5.3': { temperature: 0.8 }, 'deepseek-v4-pro': { topP: 0.95 } });
    });
});
