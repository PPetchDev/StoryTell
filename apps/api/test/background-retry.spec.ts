import { ModelRefusalError, ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { FakeTextReply } from '../src/service/model-gateway/fake-model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';
import { takeSnapshot } from './harness/snapshot.js';

/**
 * Gentler background failures (.scratch/background-retry/spec.md): a failed judge, Memory
 * extraction or Snapshot is tried once more on its own after `backgroundRetryMs`, and only a
 * failed retry blocks the send or shows as failed. Through the HTTP API with the fake gateway.
 */

type Status = 'pending' | 'done' | 'failed';

interface Message {
    id: number;
    kind: 'user' | 'ai';
    parts?: Array<{ kind: string; text: string }>;
    judge?: { status: Status; error: string | null } | null;
    memory?: { status: Status; error: string | null } | null;
}

interface Chat {
    id: number;
    messages: Message[];
}

interface SnapshotJob {
    id: string;
    status: 'pending' | 'failed';
    error: { code: string; message: string } | null;
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';

async function createStory(t: TestApp): Promise<number> {
    const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
    const storyId = created.body.id as number;
    await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING }).expect(200);
    await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
    await t.http
        .post(`/api/stories/${storyId}/characters`)
        .send({ name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' })
        .expect(201);
    return storyId;
}

async function createChat(t: TestApp, storyId: number): Promise<number> {
    return (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
}

async function getChat(t: TestApp, storyId: number, chatId: number): Promise<Chat> {
    return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as Chat;
}

function lastAi(chat: Chat): Message {
    const last = chat.messages[chat.messages.length - 1];
    expect(last.kind).toBe('ai');
    return last;
}

async function settled(t: TestApp, storyId: number, chatId: number): Promise<Chat> {
    const deadline = Date.now() + 5_000;
    for (;;) {
        const chat = await getChat(t, storyId, chatId);
        const last = [...chat.messages].reverse().find((message) => message.kind === 'ai' && message.judge);
        if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
        if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

describe('Gentler background failures', () => {
    describe('with the retry at once', () => {
        let t: TestApp;

        beforeAll(async () => {
            t = await startTestApp({ backgroundRetryMs: 0 });
        });

        afterEach(() => {
            t.gateway.reset();
        });

        afterAll(async () => {
            await t.close();
        });

        async function send(storyId: number, chatId: number, text: string, judge: FakeTextReply[], extraction: FakeTextReply[]): Promise<Chat> {
            t.gateway.scriptText('turn', `Mira hears: ${text}`);
            t.gateway.scriptText('judge', ...judge);
            t.gateway.scriptText('memory_extraction', ...extraction);
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
            return settled(t, storyId, chatId);
        }

        it('a judge and an extraction that fail once are retried on their own, and the next send goes through', async () => {
            const storyId = await createStory(t);
            const chatId = await createChat(t, storyId);

            const chat = await send(storyId, chatId, 'Hello?', [new ProviderOutageError('DeepInfra answered 503.'), NO_CHANGE], [new ProviderOutageError(), NO_OPS]);

            expect(lastAi(chat)).toMatchObject({ judge: { status: 'done', error: null }, memory: { status: 'done', error: null } });
            expect(t.gateway.textCalls('judge')).toHaveLength(2);
            expect(t.gateway.textCalls('memory_extraction')).toHaveLength(2);
            // The retry asks the same thing again.
            expect(t.gateway.textCalls('judge')[1].messages).toEqual(t.gateway.textCalls('judge')[0].messages);
            await send(storyId, chatId, 'Tea?', [NO_CHANGE], [NO_OPS]);
        });

        it('a call whose retry fails too is marked failed with the retry\'s reason and blocks the send, until Retry', async () => {
            const storyId = await createStory(t);
            const chatId = await createChat(t, storyId);

            const chat = await send(storyId, chatId, 'Hello?', [NO_CHANGE], [new ProviderOutageError('first'), new ProviderOutageError('DeepInfra answered 503.')]);

            expect(lastAi(chat)).toMatchObject({ judge: { status: 'done' }, memory: { status: 'failed', error: 'DeepInfra answered 503.' } });
            const blocked = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Tea?' }).expect(409);
            expect(blocked.body.error).toEqual({ code: '409.004.008', message: "Couldn't save the Memories from the last reply. Retry before sending." });

            // The Retry endpoint runs once: a failed press is failed at once, with no automatic retry.
            t.gateway.scriptText('memory_extraction', new ProviderOutageError('still down'));
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${lastAi(chat).id}/memory`).expect(200);
            expect(lastAi(await getChat(t, storyId, chatId)).memory).toEqual({ status: 'failed', error: 'still down' });
            expect(t.gateway.textCalls('memory_extraction')).toHaveLength(3);

            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${lastAi(chat).id}/memory`).expect(200);
            await send(storyId, chatId, 'Tea?', [NO_CHANGE], [NO_OPS]);
        });

        it('names both calls in plain words when both failed twice', async () => {
            const storyId = await createStory(t);
            const chatId = await createChat(t, storyId);
            await send(storyId, chatId, 'Hello?', [new ProviderOutageError(), new ProviderOutageError()], [new ProviderOutageError(), new ProviderOutageError()]);

            const blocked = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Tea?' }).expect(409);

            expect(blocked.body.error.message).toBe("Couldn't save the Memories, feelings and Scene from the last reply. Retry before sending.");
        });

        it('a Snapshot that fails once is drawn on the second try; one that fails twice waits for Retry; neither writes the Snapshot prompt again', async () => {
            const storyId = await createStory(t);
            const chatId = await createChat(t, storyId);
            const path = `/api/stories/${storyId}/chats/${chatId}/snapshots`;
            const written = JSON.stringify({ in_frame: ['Mira'], scene: 'Mira at the window, lamp in hand.' });
            const image = { image: { bytes: Buffer.from('jpeg'), mimeType: 'image/jpeg' }, model: 'seedream-v4-edit', costUsd: 0.05 };
            async function jobsSettled(): Promise<{ snapshots: unknown[]; jobs: SnapshotJob[] }> {
                const deadline = Date.now() + 5_000;
                for (;;) {
                    const { body } = await t.http.get(path).expect(200);
                    if ((body.jobs as SnapshotJob[]).every((job) => job.status !== 'pending')) return body;
                    if (Date.now() > deadline) throw new Error('The Snapshot did not settle in time');
                    await new Promise((resolve) => setTimeout(resolve, 20));
                }
            }

            t.gateway.scriptText('snapshot_prompt', written);
            t.gateway.scriptImage('snapshot_image', new ModelRefusalError('Venice returned the image blurred.'), image);
            await takeSnapshot(t.http, storyId, chatId);
            const made = await jobsSettled();
            expect(made.jobs).toEqual([]);
            expect(made.snapshots).toHaveLength(1);

            t.gateway.scriptText('snapshot_prompt', written);
            t.gateway.scriptImage('snapshot_image', new ModelRefusalError('blurred'), new ModelRefusalError('Venice returned the image blurred.'));
            await takeSnapshot(t.http, storyId, chatId);
            const failed = await jobsSettled();
            expect(failed.jobs).toMatchObject([{ status: 'failed', error: { code: '422.001.002', message: 'Venice returned the image blurred.' } }]);
            expect(t.gateway.imageCalls('snapshot_image')).toHaveLength(4);

            t.gateway.scriptImage('snapshot_image', image);
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/snapshot-jobs/${failed.jobs[0].id}/retry`).expect(202);
            expect((await jobsSettled()).snapshots).toHaveLength(2);
            // The approved Snapshot prompt is drawn again as it was: one writer call per Snapshot.
            expect(t.gateway.textCalls('snapshot_prompt')).toHaveLength(2);
            const prompts = t.gateway.imageCalls('snapshot_image').map((call) => call.prompt);
            expect(new Set(prompts.slice(2)).size).toBe(1);
        });
    });

    describe('with a long retry delay', () => {
        let t: TestApp;

        beforeAll(async () => {
            t = await startTestApp({ backgroundRetryMs: 60_000 });
        });

        afterEach(() => {
            t.gateway.reset();
        });

        afterAll(async () => {
            await t.close();
        });

        it('a failed call reads pending while its retry waits, and a send runs the retry at once and goes through', async () => {
            const storyId = await createStory(t);
            const chatId = await createChat(t, storyId);
            t.gateway.scriptText('turn', 'Mira nods.');
            t.gateway.scriptText('judge', new ProviderOutageError(), NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Hello?' }).expect(201);
            const deadline = Date.now() + 5_000;
            while (t.gateway.textCalls('judge').length < 1 || t.gateway.textCalls('memory_extraction').length < 1) {
                if (Date.now() > deadline) throw new Error('The background calls did not start');
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
            expect(lastAi(await getChat(t, storyId, chatId)).judge).toEqual({ status: 'pending', error: null });

            t.gateway.scriptText('turn', 'Mira pours tea.');
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            const started = Date.now();
            const { body } = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Tea?' }).expect(201);

            expect(Date.now() - started).toBeLessThan(5_000);
            expect((body as Chat).messages[2].judge).toEqual({ status: 'done', error: null });
            expect(t.gateway.textCalls('judge').length).toBeGreaterThanOrEqual(2);
            await settled(t, storyId, chatId);
        });

        it('an edit while the retry waits runs it first, then judges the edited reply afresh', async () => {
            const storyId = await createStory(t);
            const chatId = await createChat(t, storyId);
            t.gateway.scriptText('turn', 'Mira nods.');
            t.gateway.scriptText('judge', new ProviderOutageError());
            t.gateway.scriptText('memory_extraction', NO_OPS);
            const sent = (await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Hello?' }).expect(201)).body as Chat;
            const deadline = Date.now() + 5_000;
            while (t.gateway.textCalls('judge').length < 1) {
                if (Date.now() > deadline) throw new Error('The judge did not start');
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
            await new Promise((resolve) => setTimeout(resolve, 100));

            // The edit settles first, which runs the waiting retry at once; then the edited reply is judged.
            t.gateway.scriptText('judge', NO_CHANGE, NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.patch(`/api/stories/${storyId}/chats/${chatId}/messages/${lastAi(sent).id}`).send({ text: 'Mira shakes her head.' }).expect(200);
            const after = await settled(t, storyId, chatId);

            expect(lastAi(after)).toMatchObject({ judge: { status: 'done' }, memory: { status: 'done' } });
            expect(t.gateway.textCalls('judge')).toHaveLength(3);
            expect(JSON.stringify(t.gateway.textCalls('judge')[2].messages)).toContain('Mira shakes her head.');
        });
    });
});
