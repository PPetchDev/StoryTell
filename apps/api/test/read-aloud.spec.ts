import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { FAKE_MP3, silentMp3 } from '../src/service/model-gateway/fake-model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Read aloud (.scratch/read-aloud/spec.md, "The play queue" and "Audio cache"): a Message's
 * queue as shown, each item's audio made once and kept per Message, pruned and swept. Through
 * the HTTP API with the fake gateway, each test app with its own speech folder.
 */

interface Message {
    id: number;
    kind: 'user' | 'ai';
    parts?: Array<{ kind: string; text: string }>;
    judge?: { status: string } | null;
    memory?: { status: string } | null;
}

interface Chat {
    id: number;
    messages: Message[];
}

interface QueueItem {
    index: number;
    partIndex: number;
    paragraph: number | null;
    voice: string;
    characters: number;
    cached: boolean;
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: *smiles* Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';
const NOT_READABLE = '404.004.022';
const NO_SUCH_ITEM = '404.004.023';

/** Reads an audio answer's body as bytes. */
function binary(res: { on: (event: string, listener: (chunk?: Buffer) => void) => void }, done: (error: Error | null, body: Buffer) => void) {
    const chunks: Buffer[] = [];
    res.on('data', (chunk) => chunks.push(chunk!));
    res.on('end', () => done(null, Buffer.concat(chunks)));
}

describe('Read aloud', () => {
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

    async function createChat(): Promise<{ storyId: number; chat: Chat; miraId: number }> {
        const { body: created } = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const { body: story } = await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' })
            .expect(201);
        const miraId = story.characters[0].id as number;
        await t.http.patch(`/api/stories/${storyId}/characters/${miraId}`).send({ speakingVoice: 'bf_emma' }).expect(200);
        const { body: chat } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        return { storyId, chat, miraId };
    }

    const base = (storyId: number, chatId: number, messageId: number) =>
        `/api/stories/${storyId}/chats/${chatId}/messages/${messageId}/speech`;

    async function queue(storyId: number, chatId: number, messageId: number): Promise<QueueItem[]> {
        const { body } = await t.http.get(base(storyId, chatId, messageId)).expect(200);
        return body.items;
    }

    function read(storyId: number, chatId: number, messageId: number, index: number | string) {
        return t.http.post(`${base(storyId, chatId, messageId)}/${index}`).buffer(true).parse(binary);
    }

    /** Whether a Message still has its audio folder, empty or not. */
    const hasFolder = (messageId: number): boolean => existsSync(path.join(t.speechDir, 'messages', String(messageId)));

    /** The audio files kept for a Message. */
    async function files(messageId: number): Promise<string[]> {
        const folder = path.join(t.speechDir, 'messages', String(messageId));
        return existsSync(folder) ? (await readdir(folder)).sort() : [];
    }

    async function settled(storyId: number, chatId: number): Promise<Chat> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200);
            const chat = body as Chat;
            const last = [...chat.messages].reverse().find((message) => message.kind === 'ai' && message.judge);
            if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    function scriptTurn(reply: string): void {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
    }

    async function play(storyId: number, chatId: number, text: string, reply: string): Promise<Chat> {
        scriptTurn(reply);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    async function again(storyId: number, chatId: number, messageId: number, reply: string): Promise<Chat> {
        scriptTurn(reply);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${messageId}/regenerate`).expect(200);
        return settled(storyId, chatId);
    }

    const newest = (chat: Chat) => chat.messages[chat.messages.length - 1];

    describe('the queue', () => {
        it("lists an AI Message's items as shown, with their voices and lengths, and makes no call", async () => {
            const { storyId, chat } = await createChat();

            const items = await queue(storyId, chat.id, chat.messages[0].id);

            expect(items).toEqual([
                { index: 0, partIndex: 0, paragraph: 0, voice: 'af_sky', characters: 30, cached: false },
                { index: 1, partIndex: 1, paragraph: null, voice: 'af_sky', characters: 6, cached: false },
                { index: 2, partIndex: 1, paragraph: null, voice: 'bf_emma', characters: 18, cached: false },
            ]);
            expect(t.gateway.speechCalls()).toEqual([]);
        });

        it('follows the Story voices as they are when asked', async () => {
            const { storyId, chat, miraId } = await createChat();
            await t.http.patch(`/api/stories/${storyId}`).send({ narrationVoice: 'bm_george' }).expect(200);
            await t.http.patch(`/api/stories/${storyId}/characters/${miraId}`).send({ speakingVoice: null }).expect(200);

            const items = await queue(storyId, chat.id, chat.messages[0].id);

            expect(items.map((item) => item.voice)).toEqual(['bm_george', 'bm_george', 'bm_george']);
        });

        it('has none for a User Message, which is refused as not readable', async () => {
            const { storyId, chat } = await createChat();
            const played = await play(storyId, chat.id, 'I take my boots off.', 'Mira grunts.');

            const { body } = await t.http.get(base(storyId, chat.id, played.messages[1].id)).expect(404);
            expect(body.error.code).toBe(NOT_READABLE);
            const posted = await t.http.post(`${base(storyId, chat.id, played.messages[1].id)}/0`).expect(404);
            expect(posted.body.error.code).toBe(NOT_READABLE);
        });

        it('refuses a Message of another Chat', async () => {
            const { storyId, chat } = await createChat();
            const other = await createChat();

            const { body } = await t.http.get(base(storyId, chat.id, other.chat.messages[0].id)).expect(404);
            expect(body.error.code).toBe('404.004.006');
        });
    });

    describe('an item', () => {
        it('is made once, kept on disk, and then answered from disk as cached with no call', async () => {
            const { storyId, chat } = await createChat();
            const opening = chat.messages[0].id;
            t.gateway.scriptSpeech('read_aloud', {});

            const first = await read(storyId, chat.id, opening, 0).expect(200);

            expect(first.headers['content-type']).toMatch(/^audio\/mpeg/);
            expect(first.headers['cache-control']).toBe('no-store');
            expect(Buffer.compare(first.body, FAKE_MP3.bytes)).toBe(0);
            expect(t.gateway.speechCalls()).toEqual([
                { kind: 'read_aloud', text: 'The lamp went out an hour ago.', voice: 'af_sky', servedFor: { storyId, chatId: chat.id } },
            ]);
            expect(await files(opening)).toHaveLength(1);
            expect((await files(opening))[0]).toMatch(/^[0-9a-f]{32}\.mp3$/);
            expect((await queue(storyId, chat.id, opening)).map((item) => item.cached)).toEqual([true, false, false]);

            const again = await read(storyId, chat.id, opening, 0).expect(200);
            expect(Buffer.compare(again.body, FAKE_MP3.bytes)).toBe(0);
            expect(t.gateway.speechCalls()).toHaveLength(1);
        });

        it("reads a line's action in the Narration voice and the words in the speaker's", async () => {
            const { storyId, chat } = await createChat();
            t.gateway.scriptSpeech('read_aloud', {}, {});

            await read(storyId, chat.id, chat.messages[0].id, 1).expect(200);
            await read(storyId, chat.id, chat.messages[0].id, 2).expect(200);

            expect(t.gateway.speechCalls().map(({ text, voice }) => ({ text, voice }))).toEqual([
                { text: 'smiles', voice: 'af_sky' },
                { text: 'Boots off, keeper.', voice: 'bf_emma' },
            ]);
        });

        it.each([3, 99])('refuses index %i, outside the queue, with no call', async (index) => {
            const { storyId, chat } = await createChat();

            const { body } = await t.http.post(`${base(storyId, chat.id, chat.messages[0].id)}/${index}`).expect(404);

            expect(body.error.code).toBe(NO_SUCH_ITEM);
            expect(t.gateway.speechCalls()).toEqual([]);
        });

        it('refuses a new item before any call while the Venice pool is out, and still plays one already made', async () => {
            const { storyId, chat } = await createChat();
            const opening = chat.messages[0].id;
            t.gateway.scriptSpeech('read_aloud', {});
            await read(storyId, chat.id, opening, 0).expect(200);
            t.gateway.reset();
            t.gateway.setRemainingCredit({ image: { remainingUsd: 0, limitUsd: 8 } });

            const { body } = await t.http.post(`${base(storyId, chat.id, opening)}/1`).expect(402);
            expect(body.error.code).toBe('402.001.004');
            const kept = await read(storyId, chat.id, opening, 0).expect(200);
            expect(Buffer.compare(kept.body, FAKE_MP3.bytes)).toBe(0);
            expect(t.gateway.speechCalls()).toEqual([]);
        });

        it('keeps nothing when the call fails, and makes it on the next try', async () => {
            const { storyId, chat } = await createChat();
            const opening = chat.messages[0].id;
            t.gateway.scriptSpeech('read_aloud', new ProviderOutageError('Venice is down.'), {});

            await t.http.post(`${base(storyId, chat.id, opening)}/0`).expect(502);
            expect(await files(opening)).toEqual([]);
            await read(storyId, chat.id, opening, 0).expect(200);
            expect(await files(opening)).toHaveLength(1);
        });
    });

    describe('what is shown', () => {
        it("speaks the words an On AI Messages Replace rule shows, and a rule added later makes a new item that replaces the old file", async () => {
            const { storyId, chat } = await createChat();
            const opening = chat.messages[0].id;
            t.gateway.scriptSpeech('read_aloud', {});
            await read(storyId, chat.id, opening, 2).expect(200);
            const before = await files(opening);
            expect(before).toHaveLength(1);

            await t.http.post(`/api/stories/${storyId}/replace-rules`).send({ find: 'keeper', replace: 'friend' }).expect(201);

            expect((await queue(storyId, chat.id, opening))[2]).toMatchObject({ characters: 18, cached: false });
            t.gateway.scriptSpeech('read_aloud', {});
            await read(storyId, chat.id, opening, 2).expect(200);
            expect(t.gateway.speechCalls()[1]).toMatchObject({ text: 'Boots off, friend.', voice: 'bf_emma' });
            const after = await files(opening);
            expect(after).toHaveLength(1);
            expect(after).not.toEqual(before);
        });

        it('leaves out a parked rule and a rule only on my Messages', async () => {
            const { storyId, chat } = await createChat();
            await t.http.post(`/api/stories/${storyId}/replace-rules`).send({ find: 'keeper', replace: 'friend', onAi: false, onMine: true }).expect(201);
            await t.http.post(`/api/stories/${storyId}/replace-rules`).send({ find: 'Boots', replace: 'Shoes', onAi: false }).expect(201);
            t.gateway.scriptSpeech('read_aloud', {});

            await read(storyId, chat.id, chat.messages[0].id, 2).expect(200);

            expect(t.gateway.speechCalls()[0].text).toBe('Boots off, keeper.');
        });
    });

    describe('Reply versions', () => {
        it('a Regenerate gives the changed item a new key, and the replaced reply keeps its audio while it is a version', async () => {
            const { storyId, chat } = await createChat();
            const played = await play(storyId, chat.id, 'I take my boots off.', 'Mira grunts.');
            const reply = newest(played).id;
            t.gateway.scriptSpeech('read_aloud', {}, {});
            await read(storyId, chat.id, reply, 0).expect(200);
            const first = await files(reply);

            await again(storyId, chat.id, reply, 'Mira laughs.\n\nThe wind drops.');

            expect(await queue(storyId, chat.id, reply)).toEqual([
                { index: 0, partIndex: 0, paragraph: 0, voice: 'af_sky', characters: 12, cached: false },
                { index: 1, partIndex: 0, paragraph: 1, voice: 'af_sky', characters: 15, cached: false },
            ]);
            await read(storyId, chat.id, reply, 0).expect(200);
            expect(t.gateway.speechCalls().map((call) => call.text)).toEqual(['Mira grunts.', 'Mira laughs.']);
            const both = await files(reply);
            expect(both).toHaveLength(2);
            expect(both).toEqual(expect.arrayContaining(first));

            // A send drops the versions: the replaced reply's file goes when the Message's next item is written.
            await play(storyId, chat.id, 'I sit.', 'Mira nods.');
            t.gateway.scriptSpeech('read_aloud', {});
            await read(storyId, chat.id, reply, 1).expect(200);
            const left = await files(reply);
            expect(left).toHaveLength(2);
            expect(left).not.toEqual(expect.arrayContaining(first));
            expect(t.gateway.speechCalls()).toHaveLength(3);
        });

        it("keeps a version's audio when another is chosen, and replays it for free", async () => {
            const { storyId, chat } = await createChat();
            const played = await play(storyId, chat.id, 'I take my boots off.', 'Mira grunts.');
            const reply = newest(played).id;
            t.gateway.scriptSpeech('read_aloud', {}, {});
            await read(storyId, chat.id, reply, 0).expect(200);
            await again(storyId, chat.id, reply, '@Mira: About time.');
            await read(storyId, chat.id, reply, 0).expect(200);
            const both = await files(reply);

            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.put(`/api/stories/${storyId}/chats/${chat.id}/messages/${reply}/version`).send({ version: 1 }).expect(200);
            await settled(storyId, chat.id);

            expect((await queue(storyId, chat.id, reply))[0]).toMatchObject({ voice: 'af_sky', cached: true });
            await read(storyId, chat.id, reply, 0).expect(200);
            expect(t.gateway.speechCalls()).toHaveLength(2);
            expect(await files(reply)).toEqual(both);
        });
    });

    describe('Messages that are gone', () => {
        async function chatWithAudio() {
            const made = await createChat();
            const played = await play(made.storyId, made.chat.id, 'I take my boots off.', 'Mira grunts.');
            const [opening, user, reply] = played.messages.map((message) => message.id);
            t.gateway.scriptSpeech('read_aloud', {}, {});
            await read(made.storyId, made.chat.id, opening, 0).expect(200);
            await read(made.storyId, made.chat.id, reply, 0).expect(200);
            expect(await files(opening)).toHaveLength(1);
            expect(await files(reply)).toHaveLength(1);
            return { ...made, opening, user, reply };
        }

        it('an edit that discards Messages takes their audio with them', async () => {
            const { storyId, chat, opening, user, reply } = await chatWithAudio();
            scriptTurn('Mira shrugs.');

            await t.http.patch(`/api/stories/${storyId}/chats/${chat.id}/messages/${user}`).send({ text: 'I keep my boots on.' }).expect(200);

            expect(await files(reply)).toEqual([]);
            expect(existsSync(path.join(t.speechDir, 'messages', String(reply)))).toBe(false);
            expect(await files(opening)).toHaveLength(1);
        });

        it('Reset takes every Message\'s audio', async () => {
            const { storyId, chat, opening, reply } = await chatWithAudio();

            await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/reset`).expect(200);

            expect(await files(opening)).toEqual([]);
            expect(await files(reply)).toEqual([]);
            expect([hasFolder(opening), hasFolder(reply)]).toEqual([false, false]);
        });

        it('Delete Chat takes its audio', async () => {
            const { storyId, chat, opening, reply } = await chatWithAudio();

            await t.http.delete(`/api/stories/${storyId}/chats/${chat.id}`).expect(204);

            expect(await files(opening)).toEqual([]);
            expect(await files(reply)).toEqual([]);
            expect([hasFolder(opening), hasFolder(reply)]).toEqual([false, false]);
        });

        it('Delete Story takes its audio, and leaves other Stories\' and the samples', async () => {
            const { storyId, opening, reply } = await chatWithAudio();
            const other = await createChat();
            t.gateway.scriptSpeech('read_aloud', {});
            t.gateway.scriptSpeech('voice_preview', {});
            await read(other.storyId, other.chat.id, other.chat.messages[0].id, 0).expect(200);
            await t.http.post('/api/voices/af_sky/preview').expect(200);

            await t.http.delete(`/api/stories/${storyId}`).expect(204);

            expect(await files(opening)).toEqual([]);
            expect(await files(reply)).toEqual([]);
            expect([hasFolder(opening), hasFolder(reply)]).toEqual([false, false]);
            expect(await files(other.chat.messages[0].id)).toHaveLength(1);
            expect(existsSync(path.join(t.speechDir, 'samples', 'af_sky.mp3'))).toBe(true);
        });

        it('an item still being made when its Chat is deleted leaves no folder behind', async () => {
            const { storyId, chat } = await createChat();
            const opening = chat.messages[0].id;
            t.gateway.scriptSpeech('read_aloud', { delayMs: 300 });

            const reading = read(storyId, chat.id, opening, 0).then((res) => res.status);
            await new Promise((resolve) => setTimeout(resolve, 100));
            await t.http.delete(`/api/stories/${storyId}/chats/${chat.id}`).expect(204);

            expect(await reading).toBe(200);
            expect(existsSync(path.join(t.speechDir, 'messages', String(opening)))).toBe(false);
        });

        it('sweeps folders of Messages that no longer exist when the API starts', async () => {
            const speechDir = await mkdtemp(path.join(os.tmpdir(), 'storytell-speech-start-'));
            try {
                await mkdir(path.join(speechDir, 'messages', '987654'), { recursive: true });
                await writeFile(path.join(speechDir, 'messages', '987654', 'a.mp3'), silentMp3(1));
                await mkdir(path.join(speechDir, 'samples'), { recursive: true });
                await writeFile(path.join(speechDir, 'samples', 'af_sky.mp3'), silentMp3(1));

                const started = await startTestApp({ speechDir });
                await started.close();

                expect(existsSync(path.join(speechDir, 'messages', '987654'))).toBe(false);
                expect(existsSync(path.join(speechDir, 'samples', 'af_sky.mp3'))).toBe(true);
            } finally {
                await rm(speechDir, { recursive: true, force: true });
            }
        });
    });

    // .scratch/read-aloud/spec.md, "Auto-read".
    describe('Read replies aloud', () => {
        const chatPath = (storyId: number, chatId: number) => `/api/stories/${storyId}/chats/${chatId}`;

        it('is off by default, round-trips through the Chat update, and leaves the title alone', async () => {
            const { storyId, chat } = await createChat();
            expect(chat).toMatchObject({ autoRead: false });

            const { body: on } = await t.http.patch(chatPath(storyId, chat.id)).send({ autoRead: true }).expect(200);
            expect(on).toMatchObject({ autoRead: true, title: 'Chat 1' });
            expect((await t.http.get(chatPath(storyId, chat.id)).expect(200)).body.autoRead).toBe(true);

            const { body: renamed } = await t.http.patch(chatPath(storyId, chat.id)).send({ title: 'Night watch' }).expect(200);
            expect(renamed).toMatchObject({ autoRead: true, title: 'Night watch' });

            const { body: off } = await t.http.patch(chatPath(storyId, chat.id)).send({ autoRead: false }).expect(200);
            expect(off).toMatchObject({ autoRead: false, title: 'Night watch' });
        });

        it('refuses a value that is not true or false', async () => {
            const { storyId, chat } = await createChat();

            await t.http.patch(chatPath(storyId, chat.id)).send({ autoRead: 'yes' }).expect(400);
        });

        it('survives Reset', async () => {
            const { storyId, chat } = await createChat();
            await t.http.patch(chatPath(storyId, chat.id)).send({ autoRead: true }).expect(200);

            const { body } = await t.http.post(`${chatPath(storyId, chat.id)}/reset`).expect(200);

            expect(body.autoRead).toBe(true);
        });

        it('is copied by a Branch, on or off', async () => {
            const { storyId, chat } = await createChat();
            await t.http.patch(chatPath(storyId, chat.id)).send({ autoRead: true }).expect(200);

            const { body: on } = await t.http.post(`${chatPath(storyId, chat.id)}/messages/${chat.messages[0].id}/branch`).expect(201);
            expect(on.autoRead).toBe(true);

            await t.http.patch(chatPath(storyId, chat.id)).send({ autoRead: false }).expect(200);
            const { body: off } = await t.http.post(`${chatPath(storyId, chat.id)}/messages/${chat.messages[0].id}/branch`).expect(201);
            expect(off.autoRead).toBe(false);
        });
    });

    describe('Branch', () => {
        it("replays the audio of the Messages it copies with no call", async () => {
            const { storyId, chat } = await createChat();
            const played = await play(storyId, chat.id, 'I take my boots off.', 'Mira grunts.\n\n@Mira: *sighs* Fine.');
            const reply = newest(played).id;
            const items = await queue(storyId, chat.id, reply);
            t.gateway.scriptSpeech('read_aloud', ...items.map(() => ({})));
            for (const item of items) await read(storyId, chat.id, reply, item.index).expect(200);
            t.gateway.reset();

            const { body: branch } = await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${reply}/branch`).expect(201);
            const copied = newest(branch).id;

            expect(copied).not.toBe(reply);
            expect((await queue(storyId, branch.id, copied)).every((item) => item.cached)).toBe(true);
            expect((await queue(storyId, branch.id, branch.messages[0].id)).every((item) => !item.cached)).toBe(true);
            for (const item of items) await read(storyId, branch.id, copied, item.index).expect(200);
            expect(t.gateway.speechCalls()).toEqual([]);
            // The source keeps its own.
            expect(await files(reply)).toHaveLength(items.length);
        });
    });
});
