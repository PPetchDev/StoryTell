import { ModelRefusalError, OutOfCreditError, ProviderOutageError } from '../../src/errors/model-gateway.errors.js';
import { TranscriptionRequest } from '../../src/service/model-gateway/model-gateway.js';
import { gatewayUnderTest } from '../harness/gateway-under-test.js';
import { recordedFetch } from '../harness/recorded-fetch.js';

const BASE = 'https://api.venice.ai/api/v1';

/** An EBML header and filler: what a phone's WebM recording starts with. */
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('synthetic webm audio')]);

function dictation(overrides: Partial<TranscriptionRequest> = {}): TranscriptionRequest {
    return {
        kind: 'dictation',
        audio: { bytes: WEBM, mimeType: 'audio/webm;codecs=opus' },
        language: 'th',
        durationSeconds: 7.2,
        servedFor: { storyId: 4, chatId: 9 },
        ...overrides,
    };
}

// .scratch/dictation/spec.md, "Model Gateway". The request fields and the answer's shape are
// those of https://docs.venice.ai/api-reference/endpoint/audio/transcriptions (read 2026-11-09);
// the answers here are synthetic.
describe('Venice contract: transcription', () => {
    it("sends the audio as a multipart file named for its type, with Whisper, the language and a JSON answer", async () => {
        const net = recordedFetch([{ json: { text: '  สวัสดีค่ะ  ' } }]);
        const { gateway } = gatewayUnderTest(net.fetch);

        const result = await gateway.transcribe(dictation());

        expect(net.requests).toHaveLength(1);
        const [request] = net.requests;
        expect(request.url).toBe(`${BASE}/audio/transcriptions`);
        expect(request.method).toBe('POST');
        expect(request.headers.Authorization).toMatch(/^Bearer /);
        // fetch sets the multipart boundary itself, so no Content-Type is sent by hand.
        expect(Object.keys(request.headers).map((name) => name.toLowerCase())).not.toContain('content-type');
        const form = request.form!;
        expect(form.get('model')).toBe('openai/whisper-large-v3');
        expect(form.get('language')).toBe('th');
        expect(form.get('response_format')).toBe('json');
        expect(form.get('timestamps')).toBe('false');
        const file = form.get('file') as File;
        expect(file.name).toBe('dictation.webm');
        expect(file.type).toBe('audio/webm;codecs=opus');
        expect(Buffer.from(await file.arrayBuffer()).equals(WEBM)).toBe(true);

        expect(result).toEqual({ text: 'สวัสดีค่ะ', model: 'whisper-large-v3', costUsd: 0.0008 });
    });

    it.each([
        ['audio/mp4', 'm4a'],
        ['audio/ogg;codecs=opus', 'ogg'],
        ['audio/wav', 'wav'],
    ])('names a %s file with .%s', async (mimeType, extension) => {
        const net = recordedFetch([{ json: { text: 'Hello.' } }]);
        const { gateway } = gatewayUnderTest(net.fetch);

        await gateway.transcribe(dictation({ audio: { bytes: WEBM, mimeType }, language: 'en' }));

        expect((net.requests[0].form!.get('file') as File).name).toBe(`dictation.${extension}`);
        expect(net.requests[0].form!.get('language')).toBe('en');
    });

    it('records one UsageRecord in the Venice (image) pool at list price for whole seconds', async () => {
        const net = recordedFetch([{ json: { text: 'Boots off.' } }]);
        const { gateway, records } = gatewayUnderTest(net.fetch);

        await gateway.transcribe(dictation({ durationSeconds: 7.2 }));

        expect(records).toEqual([
            {
                kind: 'dictation',
                pool: 'image',
                model: 'whisper-large-v3',
                host: 'venice',
                promptTokens: null,
                completionTokens: null,
                images: null,
                costUsd: 0.0008,
                storyId: 4,
                chatId: 9,
            },
        ]);
    });

    it("prices Venice's reported duration over the measured one, clamped to 1 to 120 seconds", async () => {
        const net = recordedFetch([
            { json: { text: 'a', duration: 12.01 } },
            { json: { text: 'b' } },
            { json: { text: 'c' } },
        ]);
        const { gateway, records } = gatewayUnderTest(net.fetch);

        await gateway.transcribe(dictation({ durationSeconds: 3 }));
        await gateway.transcribe(dictation({ durationSeconds: 0.2 }));
        await gateway.transcribe(dictation({ durationSeconds: 400 }));

        expect(records.map((record) => record.costUsd)).toEqual([0.0013, 0.0001, 0.012]);
    });

    it('maps a 402 to the Venice pool being out, with one request', async () => {
        const net = recordedFetch([{ status: 402, json: { error: 'Insufficient balance' } }]);
        const { gateway, records } = gatewayUnderTest(net.fetch);

        const error = await gateway.transcribe(dictation()).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(OutOfCreditError);
        expect((error as OutOfCreditError).pool).toBe('image');
        expect(net.requests).toHaveLength(1);
        expect(records).toEqual([]);
    });

    it('maps a 422 to a refusal, with one request', async () => {
        const net = recordedFetch([{ status: 422, json: { error: 'Rejected' } }]);
        const { gateway } = gatewayUnderTest(net.fetch);

        await expect(gateway.transcribe(dictation())).rejects.toBeInstanceOf(ModelRefusalError);
        expect(net.requests).toHaveLength(1);
    });

    it.each([400, 500])('maps a %i to an outage carrying Venice\'s message, not retried', async (status) => {
        const net = recordedFetch([{ status, json: { error: 'Unsupported audio format' } }]);
        const { gateway, records } = gatewayUnderTest(net.fetch);

        const error = await gateway.transcribe(dictation()).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ProviderOutageError);
        expect((error as Error).message).toContain('Unsupported audio format');
        expect(net.requests).toHaveLength(1);
        expect(records).toEqual([]);
    });

    it('retries a 429 on the same model, and records the one answered call', async () => {
        const net = recordedFetch([{ status: 429, json: { error: 'Slow down' } }, { json: { text: 'Again.' } }]);
        const { gateway, records, sleeps } = gatewayUnderTest(net.fetch);

        const result = await gateway.transcribe(dictation());

        expect(result.text).toBe('Again.');
        expect(net.requests).toHaveLength(2);
        expect(net.requests[1].form!.get('model')).toBe('openai/whisper-large-v3');
        expect(sleeps).toHaveLength(1);
        expect(records).toHaveLength(1);
    });

    it('reads an answer with no text as unreadable rather than as silence', async () => {
        const net = recordedFetch([{ json: { duration: 3 } }]);
        const { gateway } = gatewayUnderTest(net.fetch);

        await expect(gateway.transcribe(dictation())).rejects.toThrow(/no text/);
    });
});
