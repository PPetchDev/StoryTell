import { FAKE_PNG } from '../src/service/model-gateway/fake-model-gateway.js';
import { ModelGateway } from '../src/service/model-gateway/model-gateway.js';
import { TEST_KEYS } from './harness/gateway-under-test.js';
import { recordedFetch } from './harness/recorded-fetch.js';
import { startTestApp, TestApp } from './harness/test-app.js';

const thisMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

describe('Usage', () => {
    describe('monthly spend', () => {
        let t: TestApp;

        beforeAll(async () => {
            // The real gateway against recorded responses, so its UsageRecords are the real ones.
            const net = recordedFetch([
                { fixture: 'openrouter/chat-success.json' },
                { fixture: 'openrouter/chat-json.json' },
                { fixture: 'venice/models.json' },
                { fixture: 'venice/models.json' },
                { fixture: 'venice/generate.json' },
                { fixture: 'openrouter/credits.json' },
                { fixture: 'venice/balance.json' },
            ]);
            t = await startTestApp({ modelGateway: 'real', fetch: net.fetch, providerKeys: TEST_KEYS });
        });

        afterAll(async () => {
            await t.close();
        });

        it('sums the UsageRecords of each pool this month', async () => {
            const gateway = t.app.get(ModelGateway);
            await gateway.completeText({ kind: 'turn', messages: [{ role: 'user', content: 'hi' }] });
            await gateway.completeText({ kind: 'judge', messages: [], json: true });
            await gateway.generateImage({ kind: 'reference_image', prompt: 'p' });

            const { body } = await t.http.get('/api/usage').expect(200);

            expect(body.month).toBe(thisMonth());
            expect(body.pools.text).toMatchObject({
                spentUsd: 0.000987 + 0.000112,
                calls: 2,
                remainingUsd: 4.5,
                capUsd: 22,
                lowCreditPercent: 20,
                // 20% of $22 is $4.40, so $4.50 is just above the line.
                lowCredit: false,
            });
            expect(body.pools.text.byKind).toEqual([
                { kind: 'turn', spentUsd: 0.000987, calls: 1 },
                { kind: 'judge', spentUsd: 0.000112, calls: 1 },
            ]);
            expect(body.pools.image).toEqual({
                spentUsd: 0.04,
                calls: 1,
                byKind: [{ kind: 'reference_image', spentUsd: 0.04, calls: 1 }],
                remainingUsd: 6.4,
                capUsd: 8,
                lowCreditPercent: 20,
                lowCredit: false,
            });
        });
    });

    describe('low-credit warning', () => {
        let t: TestApp;

        beforeAll(async () => {
            t = await startTestApp();
        });

        afterEach(() => {
            t.gateway.reset();
        });

        afterAll(async () => {
            await t.close();
        });

        it('is off while both pools are above their thresholds', async () => {
            const { body } = await t.http.get('/api/usage').expect(200);

            expect(body.pools.text).toMatchObject({ spentUsd: 0, calls: 0, lowCredit: false });
            expect(body.pools.image).toMatchObject({ spentUsd: 0, calls: 0, lowCredit: false });
        });

        it('turns on for a pool at or below its threshold', async () => {
            t.gateway.setRemainingCredit({ text: { remainingUsd: 4.4, limitUsd: 22 } });

            const { body } = await t.http.get('/api/usage').expect(200);

            expect(body.pools.text).toMatchObject({ remainingUsd: 4.4, lowCredit: true });
            expect(body.pools.image.lowCredit).toBe(false);
        });

        it('follows the threshold in Settings', async () => {
            t.gateway.setRemainingCredit({ image: { remainingUsd: 3, limitUsd: 8 } });
            await t.http.put('/api/settings').send({ imageLowCreditPercent: 50 }).expect(200);
            expect((await t.http.get('/api/usage')).body.pools.image.lowCredit).toBe(true);

            await t.http.put('/api/settings').send({ imageLowCreditPercent: 20 }).expect(200);
            expect((await t.http.get('/api/usage')).body.pools.image.lowCredit).toBe(false);
        });

        it('stays off when the remaining credit is unknown, and still shows spend', async () => {
            t.gateway.setRemainingCredit({ image: { remainingUsd: null, limitUsd: null } });
            t.gateway.scriptImage('snapshot_image', { image: FAKE_PNG, costUsd: 0.05 });
            await t.gateway.generateImage({ kind: 'snapshot_image', prompt: 'p' });

            const { body } = await t.http.get('/api/usage').expect(200);

            expect(body.pools.image).toMatchObject({ remainingUsd: null, lowCredit: false });
        });
    });
});
