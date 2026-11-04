import {
    ModelRefusalError,
    OutOfCreditError,
    ProviderOutageError,
} from '../../src/errors/model-gateway.errors.js';
import { FAKE_PNG } from '../../src/service/model-gateway/fake-model-gateway.js';
import { gatewayUnderTest } from '../harness/gateway-under-test.js';
import { recordedFetch, RecordedResponse } from '../harness/recorded-fetch.js';

const BASE = 'https://api.venice.ai/api/v1';
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');

/** `GET /models` is read once per client, for `image` then `inpaint`. */
const modelLists: RecordedResponse[] = [
    { fixture: 'venice/models.json' },
    { fixture: 'venice/models.json' },
];

const edited: RecordedResponse = { bytes: JPEG, contentType: 'image/jpeg' };

// Spec: Testing Decisions, "Model Gateway contract tests". Fixtures under test/fixtures/venice
// are synthetic; the image bytes are a bare JPEG header.
describe('Venice contract', () => {
    it('draws Reference images with qwen-image-3 at 2:3 and safe mode off, and records list price', async () => {
        const net = recordedFetch([...modelLists, { fixture: 'venice/generate.json' }]);
        const { gateway, records } = gatewayUnderTest(net.fetch);

        const result = await gateway.generateImage({
            kind: 'reference_image',
            prompt: 'Full-body portrait of a synthetic test character.',
            servedFor: { storyId: 7 },
        });

        const request = net.requests[2];
        expect(request.url).toBe(`${BASE}/image/generate`);
        expect(request.headers.Authorization).toMatch(/^Bearer /);
        expect(request.body).toEqual({
            model: 'qwen-image-3',
            prompt: 'Full-body portrait of a synthetic test character.',
            aspect_ratio: '2:3',
            format: 'jpeg',
            safe_mode: false,
            hide_watermark: true,
            return_binary: false,
            variants: 1,
        });
        expect(result.model).toBe('qwen-image-3');
        expect(result.costUsd).toBe(0.04);
        expect(Buffer.compare(result.image.bytes, FAKE_PNG.bytes)).toBe(0);
        expect(records).toEqual([
            {
                kind: 'reference_image',
                pool: 'image',
                model: 'qwen-image-3',
                host: 'venice',
                promptTokens: null,
                completionTokens: null,
                images: 1,
                costUsd: 0.04,
                storyId: 7,
                chatId: null,
            },
        ]);
    });

    it('draws Snapshots with seedream-v4-edit by default, sending the reference images and reading raw bytes', async () => {
        const net = recordedFetch([...modelLists, edited]);
        const { gateway, records } = gatewayUnderTest(net.fetch);

        const result = await gateway.generateImage({
            kind: 'snapshot_image',
            prompt: 'A synthetic test scene.',
            referenceImages: [FAKE_PNG, FAKE_PNG],
            servedFor: { chatId: 3 },
        });

        const request = net.requests[2];
        expect(request.url).toBe(`${BASE}/image/multi-edit`);
        expect(request.body).toEqual({
            modelId: 'seedream-v4-edit',
            prompt: 'A synthetic test scene.',
            images: [FAKE_PNG.bytes.toString('base64'), FAKE_PNG.bytes.toString('base64')],
            aspect_ratio: '2:3',
            output_format: 'jpeg',
            safe_mode: false,
        });
        expect(result.model).toBe('seedream-v4-edit');
        expect(result.image).toEqual({ bytes: JPEG, mimeType: 'image/jpeg' });
        expect(records[0]).toMatchObject({ kind: 'snapshot_image', pool: 'image', costUsd: 0.05, chatId: 3 });
    });

    it('draws a Snapshot with no reference image from text alone with the Settings model\x27s text-to-image sibling', async () => {
        for (const [imageModel, textOnly, price] of [
            ['seedream-v4-edit', 'seedream-v4', 0.05],
            ['qwen-edit-uncensored', 'qwen-image-3', 0.04],
        ] as const) {
            const net = recordedFetch([...modelLists, { fixture: 'venice/generate.json' }]);
            const { gateway, records } = gatewayUnderTest(net.fetch, { settings: { imageModel } });

            const result = await gateway.generateImage({ kind: 'snapshot_image', prompt: 'A synthetic scene.' });

            const request = net.requests[2];
            expect(request.url).toBe(`${BASE}/image/generate`);
            expect(request.body).toMatchObject({ model: textOnly, aspect_ratio: '2:3', safe_mode: false });
            expect(result).toMatchObject({ model: textOnly, costUsd: price });
            expect(records[0]).toMatchObject({ kind: 'snapshot_image', pool: 'image', model: textOnly, costUsd: price });
        }
    });

    it('uses the Settings image model and its prompt limit from GET /models', async () => {
        const net = recordedFetch([...modelLists, edited]);
        const { gateway } = gatewayUnderTest(net.fetch, { settings: { imageModel: 'qwen-edit-uncensored' } });

        const result = await gateway.generateImage({
            kind: 'snapshot_image',
            prompt: 'x'.repeat(2000),
            referenceImages: [FAKE_PNG],
        });

        expect(net.requests[0].url).toBe(`${BASE}/models?type=image`);
        expect(net.requests[1].url).toBe(`${BASE}/models?type=inpaint`);
        expect(net.requests[2].body.modelId).toBe('qwen-edit-uncensored');
        expect(net.requests[2].body.prompt).toHaveLength(1500);
        expect(result.costUsd).toBe(0.04);
    });

    it('refuses more than 3 reference images before calling Venice', async () => {
        const net = recordedFetch([]);
        const { gateway } = gatewayUnderTest(net.fetch);

        await expect(
            gateway.generateImage({
                kind: 'snapshot_image',
                prompt: 'p',
                referenceImages: [FAKE_PNG, FAKE_PNG, FAKE_PNG, FAKE_PNG],
            }),
        ).rejects.toThrow(RangeError);
        expect(net.requests).toHaveLength(0);
    });

    describe('error mapping', () => {
        it('maps a 402 to out of image credit', async () => {
            const net = recordedFetch([...modelLists, { status: 402, fixture: 'venice/error-402.json' }]);
            const { gateway, records } = gatewayUnderTest(net.fetch);

            const failure = gateway.generateImage({ kind: 'reference_image', prompt: 'p' });

            await expect(failure).rejects.toBeInstanceOf(OutOfCreditError);
            await expect(failure).rejects.toMatchObject({ code: '402.001.004', pool: 'image' });
            expect(records).toEqual([]);
        });

        it('maps a 422 to a refusal', async () => {
            const net = recordedFetch([...modelLists, { status: 422, fixture: 'venice/error-422.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch);

            await expect(gateway.generateImage({ kind: 'reference_image', prompt: 'p' })).rejects.toMatchObject(
                { code: '422.001.002' },
            );
        });

        it.each(['x-venice-is-blurred', 'x-venice-is-content-violation'])(
            'maps a %s result to a refusal and records nothing',
            async (header) => {
                const net = recordedFetch([...modelLists, { ...edited, headers: { [header]: 'true' } }]);
                const { gateway, records } = gatewayUnderTest(net.fetch);

                await expect(
                    gateway.generateImage({ kind: 'snapshot_image', prompt: 'p', referenceImages: [FAKE_PNG] }),
                ).rejects.toBeInstanceOf(ModelRefusalError);
                expect(records).toEqual([]);
            },
        );

        it('maps other failures to an outage', async () => {
            const net = recordedFetch([...modelLists, { status: 500, json: { error: 'Inference processing failed' } }]);
            const { gateway } = gatewayUnderTest(net.fetch);

            await expect(gateway.generateImage({ kind: 'reference_image', prompt: 'p' })).rejects.toMatchObject(
                { code: '502.001.001', message: 'Venice: Inference processing failed' },
            );
        });
    });

    it('retries a 503 honouring Retry-After, then an outage when it persists', async () => {
        const net = recordedFetch([
            ...modelLists,
            { status: 503, headers: { 'retry-after': '2' }, fixture: 'venice/error-503.json' },
            { status: 429, json: { error: 'Rate limit exceeded' } },
            { fixture: 'venice/generate.json' },
        ]);
        const { gateway, sleeps } = gatewayUnderTest(net.fetch);

        await gateway.generateImage({ kind: 'reference_image', prompt: 'p' });

        expect(net.requests.filter((r) => r.url.endsWith('/image/generate'))).toHaveLength(3);
        expect(sleeps).toEqual([2000, 2000]);

        const stuck = recordedFetch([
            ...modelLists,
            ...Array.from({ length: 4 }, () => ({ status: 503, fixture: 'venice/error-503.json' })),
        ]);
        const second = gatewayUnderTest(stuck.fetch);
        await expect(second.gateway.generateImage({ kind: 'reference_image', prompt: 'p' })).rejects.toBeInstanceOf(
            ProviderOutageError,
        );
    });

    it('still generates when GET /models fails, using the built-in prompt limits', async () => {
        const net = recordedFetch([
            { status: 500, json: { error: 'down' } },
            { fixture: 'venice/generate.json' },
        ]);
        const { gateway } = gatewayUnderTest(net.fetch);

        await gateway.generateImage({ kind: 'reference_image', prompt: 'p' });

        expect(net.requests[1].url).toBe(`${BASE}/image/generate`);
    });

    describe('remaining credit', () => {
        it('reads the balance with the Admin key', async () => {
            const net = recordedFetch([{ fixture: 'openrouter/credits.json' }, { fixture: 'venice/balance.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch);

            const credit = await gateway.remainingCredit();

            const balance = net.requests.find((r) => r.url === `${BASE}/billing/balance`)!;
            expect(balance.headers.Authorization).toBe('Bearer venice-admin-test-not-a-real-key');
            expect(credit.image).toEqual({ remainingUsd: 6.4, limitUsd: null });
        });

        it('reports the image pool as unknown without an Admin key, and asks Venice nothing', async () => {
            const net = recordedFetch([{ fixture: 'openrouter/credits.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch, { veniceAdminKey: undefined });

            const credit = await gateway.remainingCredit();

            expect(credit.image).toEqual({ remainingUsd: null, limitUsd: null });
            expect(net.requests.map((r) => r.url)).toEqual(['https://openrouter.ai/api/v1/credits']);
        });
    });
});
