import pg from 'pg';

import { UsageRecordModelService } from '../src/model/usage-record/usage-record.service.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { IMAGE_MODELS, imageListPrice, snapshotListPrice } from '../src/service/model-gateway/real/model-table.js';
import { NewUsageRecord } from '../src/service/model-gateway/real/real-model-gateway.js';
import { TEST_KEYS } from './harness/gateway-under-test.js';
import { fixture, RecordedRequest } from './harness/recorded-fetch.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * .scratch/cost-view/spec.md: every call a reply caused names its AI Message, so the Chat can show
 * what each reply cost; the Usage page splits the month by model and by host; a Snapshot prompt
 * carries the price of drawing it.
 */

const MIRA = {
    name: 'Mira',
    appearance: 'Tall, grey eyes.',
    personality: 'Guarded and dry.',
    voice: 'Short sentences.',
};

interface Message {
    id: number;
    kind: 'user' | 'ai';
    judge?: { status: string } | null;
    memory?: { status: string } | null;
}

async function playableChat(t: TestApp): Promise<{ storyId: number; chatId: number }> {
    const created = await t.http.post('/api/stories').send({ title: 'Costs' }).expect(201);
    const storyId = created.body.id as number;
    await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'An island.', opening: 'The lamp is out.' }).expect(200);
    await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The keeper.' }).expect(200);
    await t.http.post(`/api/stories/${storyId}/characters`).send(MIRA).expect(201);
    const chat = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
    return { storyId, chatId: chat.body.id as number };
}

/** The Chat once its newest reply's Judge and Memory keeping settled. */
async function settled(t: TestApp, storyId: number, chatId: number): Promise<Message[]> {
    const deadline = Date.now() + 5_000;
    for (;;) {
        const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200);
        const messages = body.messages as Message[];
        const last = messages.at(-1)!;
        if (last.judge?.status !== 'pending' && last.memory?.status !== 'pending') return messages;
        if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

async function sql(t: TestApp, text: string, params: unknown[] = []): Promise<any[]> {
    const client = new pg.Client({ connectionString: t.databaseUrl });
    await client.connect();
    try {
        return (await client.query(text, params)).rows;
    } finally {
        await client.end();
    }
}

describe('Cost of a reply through the real gateway', () => {
    let t: TestApp;

    beforeAll(async () => {
        // Routed by URL and model, as chats.spec.ts does: the turn on the play model, the Judge and Memory keeping on V4 Flash.
        const routed: FetchLike = async (url, init) => {
            const request: RecordedRequest = {
                url,
                method: init.method ?? 'GET',
                headers: (init.headers ?? {}) as Record<string, string>,
                body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
            };
            const json = url.endsWith('/credits')
                ? fixture('openrouter/credits.json')
                : url.endsWith('/billing/balance')
                  ? fixture('venice/balance.json')
                  : url.endsWith('/embeddings')
                    ? fixture('openrouter/embeddings.json')
                    : request.body?.model !== 'deepseek/deepseek-v4-flash'
                      ? fixture('openrouter/chat-success.json')
                      : String(request.body.messages?.[0]?.content).includes('Memory of an interactive story')
                        ? fixture('openrouter/chat-memory.json')
                        : fixture('openrouter/chat-judge.json');
            return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
        };
        t = await startTestApp({ modelGateway: 'real', fetch: routed, providerKeys: TEST_KEYS });
    });

    afterAll(async () => {
        await t.close();
    });

    it('names the reply on its turn, its Judge and its Memory keeping, and sums them per Message and kind', async () => {
        const { storyId, chatId } = await playableChat(t);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Hello?' }).expect(201);
        const messages = await settled(t, storyId, chatId);
        const reply = messages.at(-1)!;

        const records = await sql(t, 'SELECT kind, message_id, cost_usd FROM usage_record WHERE chat_id = $1 ORDER BY id', [chatId]);
        const kinds = records.map((record) => record.kind);
        expect(kinds).toEqual(expect.arrayContaining(['turn', 'judge', 'memory_extraction']));
        // Every call this Chat made was the reply's.
        expect(records.every((record) => record.message_id === reply.id)).toBe(true);

        const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/costs`).expect(200);
        const total = records.reduce((sum, record) => sum + Number(record.cost_usd), 0);
        expect(body.chatId).toBe(chatId);
        expect(body.messages).toHaveLength(1);
        expect(body.messages[0]).toMatchObject({ messageId: reply.id, calls: records.length });
        expect(body.messages[0].costUsd).toBeCloseTo(total, 6);
        expect(body.messages[0].byKind.map((kind: { kind: string }) => kind.kind)).toEqual(expect.arrayContaining(['turn', 'judge', 'memory_extraction']));
        const turn = body.messages[0].byKind.find((kind: { kind: string }) => kind.kind === 'turn');
        expect(turn).toMatchObject({ calls: 1 });
        expect(turn.costUsd).toBeGreaterThan(0);
    });

    it('adds a Regenerate to the same Message: every take is its cost', async () => {
        const { storyId, chatId } = await playableChat(t);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Hello?' }).expect(201);
        const first = await settled(t, storyId, chatId);
        const reply = first.at(-1)!;
        const before = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/costs`).expect(200)).body.messages[0];

        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${reply.id}/regenerate`).expect(200);
        await settled(t, storyId, chatId);

        const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/costs`).expect(200);
        expect(body.messages).toHaveLength(1);
        expect(body.messages[0].messageId).toBe(reply.id);
        expect(body.messages[0].byKind.find((kind: { kind: string }) => kind.kind === 'turn')).toMatchObject({ calls: 2 });
        expect(body.messages[0].costUsd).toBeGreaterThan(before.costUsd);
    });

    it("answers a Chat of another Story, or a missing one, as not found", async () => {
        const { storyId, chatId } = await playableChat(t);
        const other = await playableChat(t);
        await t.http.get(`/api/stories/${other.storyId}/chats/${chatId}/costs`).expect(404);
        await t.http.get(`/api/stories/${storyId}/chats/999999/costs`).expect(404);
        // A Chat with no reply yet costs nothing.
        const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/costs`).expect(200);
        expect(body).toEqual({ chatId, messages: [] });
    });
});

describe('Cost view on the fake gateway', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    const record = (fields: Partial<NewUsageRecord>): NewUsageRecord => ({
        kind: 'turn',
        pool: 'text',
        model: 'glm-5.3',
        host: 'deepinfra',
        promptTokens: 1000,
        completionTokens: 50,
        images: null,
        costUsd: 0.001,
        storyId: null,
        chatId: null,
        ...fields,
    });

    it("gives a reply only its turn's kinds of its own Chat, recorded since the turn began and naming no Message yet", async () => {
        const usage = t.app.get(UsageRecordModelService);
        await usage.record(record({ chatId: 701, kind: 'turn' })); // a stopped turn before: not this reply's
        const from = await usage.lastId();
        for (const kind of ['turn', 'context_search', 'character_thought', 'speech_repair', 'speech_repair_fallback'] as const) {
            await usage.record(record({ chatId: 701, kind }));
        }
        await usage.record(record({ chatId: 701, kind: 'suggested_replies' })); // asked for by the user
        await usage.record(record({ chatId: 701, kind: 'judge', messageId: 41 })); // the previous reply's
        await usage.record(record({ chatId: 702, kind: 'turn' })); // another Chat's

        await usage.claimForReply(701, from, 42);

        const rows = await sql(t, 'SELECT kind, chat_id, message_id FROM usage_record WHERE chat_id IN (701, 702) ORDER BY id');
        expect(rows.map((row) => [row.kind, row.chat_id, row.message_id])).toEqual([
            ['turn', 701, null],
            ['turn', 701, 42],
            ['context_search', 701, 42],
            ['character_thought', 701, 42],
            ['speech_repair', 701, 42],
            ['speech_repair_fallback', 701, 42],
            ['suggested_replies', 701, null],
            ['judge', 701, 41],
            ['turn', 702, null],
        ]);

        const costs = await usage.costsOfChat(701);
        expect(costs.map((cost) => [cost.messageId, cost.calls])).toEqual([
            [41, 1],
            [42, 5],
        ]);
        expect(costs[1].costUsd).toBeCloseTo(0.005, 6);
    });

    it('names the reply on its Judge and Memory keeping as they are made, and on its Thoughts once it is stored', async () => {
        const { storyId, chatId } = await playableChat(t);
        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}`).send({ characterThoughts: true }).expect(200);
        t.gateway.scriptText('character_thought', 'She does not trust him yet.');
        t.gateway.scriptText('turn', '@Mira: Go away.');
        t.gateway.scriptText('judge', '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}');
        t.gateway.scriptText('memory_extraction', '{"operations":[]}');
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Hello?' }).expect(201);
        const reply = (await settled(t, storyId, chatId)).at(-1)!;

        const served = t.gateway.calls.flatMap((call) =>
            'request' in call && call.request && 'servedFor' in call.request && call.request.servedFor?.chatId === chatId
                ? [{ kind: (call.request as { kind: string }).kind, messageId: call.request.servedFor.messageId }]
                : [],
        );
        // The Judge and Memory keeping name it as they are made; the turn's own calls are claimed once it is stored.
        expect(served).toEqual(
            expect.arrayContaining([
                { kind: 'judge', messageId: reply.id },
                { kind: 'memory_extraction', messageId: reply.id },
            ]),
        );
        expect(served.filter((call) => call.kind === 'turn' || call.kind === 'character_thought').every((call) => call.messageId === undefined)).toBe(true);
    });

    it("splits the Owner's month by model and by host, with each one's cached share", async () => {
        const usage = t.app.get(UsageRecordModelService);
        await usage.record(record({ model: 'deepseek-v4-pro', host: 'deepinfra', costUsd: 0.01, promptTokens: 10_000, cachedTokens: 6_000 }));
        await usage.record(record({ model: 'deepseek-v4-pro', host: 'venice', costUsd: 0.02, promptTokens: 10_000, cachedTokens: 0 }));
        await usage.record(record({ kind: 'judge', model: 'deepseek-v4-flash', host: 'deepinfra', costUsd: 0.001, promptTokens: 2_000 }));
        await usage.record(record({ kind: 'snapshot_image', pool: 'image', model: 'seedream-v4-edit', host: 'venice', costUsd: 0.05, promptTokens: null, completionTokens: null, images: 1 }));
        await usage.record(record({ kind: 'snapshot_image', pool: 'image', model: 'qwen-image-3', host: 'venice', costUsd: 0.04, promptTokens: null, completionTokens: null, images: 1 }));

        const { body } = await t.http.get('/api/usage').expect(200);
        const pro = body.pools.text.byModel.find((model: { name: string }) => model.name === 'deepseek-v4-pro');
        expect(pro).toMatchObject({ calls: 2, cache: { promptTokens: 20_000, cachedTokens: 6_000 } });
        expect(pro.spentUsd).toBeCloseTo(0.03, 6);
        // A host that reported no cache has none, rather than a miss.
        expect(body.pools.text.byModel.find((model: { name: string }) => model.name === 'deepseek-v4-flash').cache).toBeNull();
        const venice = body.pools.text.byHost.find((host: { name: string }) => host.name === 'venice');
        expect(venice).toMatchObject({ calls: 1, spentUsd: 0.02, cache: { promptTokens: 10_000, cachedTokens: 0 } });
        // Most spent first.
        const spent = body.pools.text.byModel.map((model: { spentUsd: number }) => model.spentUsd);
        expect(spent).toEqual([...spent].sort((a, b) => b - a));
        // The image pool's By model is the Snapshot spend per model.
        expect(body.pools.image.byModel.map((model: { name: string }) => model.name)).toEqual(['seedream-v4-edit', 'qwen-image-3']);
        expect(body.pools.image.byHost).toEqual([{ name: 'venice', spentUsd: 0.09, calls: 2, cache: null }]);
    });

    it('carries the price of drawing on a written Snapshot prompt', async () => {
        const { storyId, chatId } = await playableChat(t);
        await t.http.put('/api/settings').send({ imageModel: 'seedream-v5-pro-edit', snapshotSize: '2K' }).expect(200);
        t.gateway.scriptText('snapshot_prompt', JSON.stringify({ in_frame: ['Mira'], scene: 'Mira at the window.' }));
        const { body } = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/snapshot-prompts`).send({}).expect(201);
        // Mira has no Reference image: drawn by the text-only sibling, at the 2K asked for.
        expect(body.priceUsd).toBe(0.11);
    });
});

describe('Snapshot list price', () => {
    it('is the edit model with a Reference image, the text-only sibling without', () => {
        expect(snapshotListPrice({ imageModel: 'seedream-v4-edit', snapshotSize: '1K' }, 1)).toBe(IMAGE_MODELS['seedream-v4-edit'].prices['1K']);
        expect(snapshotListPrice({ imageModel: 'seedream-v4-edit', snapshotSize: '1K' }, 0)).toBe(0.05);
        expect(snapshotListPrice({ imageModel: 'qwen-edit-uncensored', snapshotSize: '1K' }, 0)).toBe(0.04);
    });

    it('is the size drawn, with Venice price for each input image past the first', () => {
        expect(snapshotListPrice({ imageModel: 'seedream-v5-pro-edit', snapshotSize: '2K' }, 3)).toBe(imageListPrice(IMAGE_MODELS['seedream-v5-pro-edit'], '2K', 3));
        expect(snapshotListPrice({ imageModel: 'seedream-v5-pro-edit', snapshotSize: '1K' }, 3)).toBeCloseTo(IMAGE_MODELS['seedream-v5-pro-edit'].prices['1K'] + 2 * 0.00345, 6);
        // A model with no 2K price is drawn at 1K whatever is asked.
        expect(snapshotListPrice({ imageModel: 'seedream-v4-edit', snapshotSize: '2K' }, 0)).toBe(0.05);
    });
});
