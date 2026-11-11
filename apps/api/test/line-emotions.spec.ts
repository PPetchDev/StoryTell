import pg from 'pg';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { LedgerModelService } from '../src/model/ledger/ledger.service.js';
import type { Emotion } from '../src/model/story/emotion.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * The Judge tags each line (.scratch/expressions/issues/03-judge-tags-emotions.md): through the
 * HTTP API with the judge's output scripted on the fake gateway, plus the ledger's record at the
 * model level.
 */

type Status = 'pending' | 'done' | 'failed';

interface Part {
    kind: 'narration' | 'speech';
    text: string;
    speakerName?: string;
    emotion?: Emotion | null;
}

interface Message {
    id: number;
    kind: 'user' | 'ai';
    parts?: Part[];
    judge?: { status: Status; error: string | null } | null;
    memory?: { status: Status; error: string | null } | null;
}

interface Chat {
    id: number;
    messages: Message[];
}

interface Story {
    id: number;
    characters: Array<{ id: number; name: string }>;
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const REPLY = 'Mira watches the boots.\n\n@Mira: Better.\n\n@Kai: She means thank you.\n\n@Mira: I do not.';
const NO_OPS = '{"operations":[]}';

/** A judgement that changes nothing but tags the lines. */
function tags(expressions: unknown): string {
    return JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' }, time_of_day: null, expressions });
}

/** A real PNG signature followed by filler. */
function png(label: string): Buffer {
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(label)]);
}

/** Each part's emotion in order; narration, which never has one, as null. Speech always carries the field. */
function emotions(message: Message | undefined): Array<Emotion | null> {
    return (message?.parts ?? []).map((part) => (part.kind === 'narration' ? null : part.emotion!));
}

describe('The Judge tags each line a Character speaks', () => {
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

    /** A playable Story with Mira and Kai; Mira has a Happy Expression unless `expressions` is false. */
    async function createStory(options: { expressions?: boolean } = {}): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.' }).expect(201);
        const { body } = await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Kai', appearance: 'Wiry.', personality: 'Nosy.', voice: 'Rambling.' }).expect(201);
        const story = body as Story;
        if (options.expressions !== false) {
            await t.http.put(`/api/stories/${storyId}/characters/${story.characters[0].id}/expressions/joy`).attach('image', png('happy'), 'happy.png').expect(200);
        }
        return story;
    }

    async function createChat(storyId: number): Promise<Chat> {
        return (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
    }

    async function getChat(storyId: number, chatId: number): Promise<Chat> {
        return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as Chat;
    }

    /** Returns once neither of the latest reply's background calls is pending. */
    async function settled(storyId: number, chatId: number): Promise<Chat> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = await getChat(storyId, chatId);
            const last = lastAi(chat);
            if (last.judge?.status !== 'pending' && last.memory?.status !== 'pending') return chat;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
    }

    async function play(story: Story, chatId: number, judge: Array<string | ProviderOutageError> = [tags([])], reply = REPLY): Promise<Chat> {
        t.gateway.scriptText('turn', { text: reply, model: 'glm-5.3' });
        t.gateway.scriptText('judge', ...judge);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${story.id}/chats/${chatId}/messages`).send({ text: 'I set my boots by the door.' }).expect(201);
        return settled(story.id, chatId);
    }

    function lastAi(chat: Chat): Message {
        return [...chat.messages].reverse().find((message) => message.kind === 'ai')!;
    }

    it("stores the scripted emotion on each speech part of a judged reply, none on narration, and none on the Opening", async () => {
        const story = await createStory();
        const chat = await createChat(story.id);

        const played = await play(story, chat.id, [tags([{ line: 1, emotion: 'joy' }, { line: 2, emotion: 'Surprise' }, { line: 3, emotion: 'neutral' }])]);

        expect(emotions(lastAi(played))).toEqual([null, 'joy', 'surprise', 'neutral']);
        expect(lastAi(played).parts![0]).toEqual({ kind: 'narration', text: 'Mira watches the boots.' });
        // The Opening is never judged.
        expect(emotions(played.messages[0])).toEqual([null, null]);
        // The one judge call asked for it, with the latest exchange's lines numbered; no extra call.
        const calls = t.gateway.textCalls('judge');
        expect(calls).toHaveLength(1);
        expect(calls[0].messages[1].content).toContain('[1] @Mira: Better.\n\n[2] @Kai: She means thank you.\n\n[3] @Mira: I do not.');
        expect(calls[0].messages[0].content).toContain('Expression rule:');
        expect(calls[0].maxTokens).toBe(900);
        expect(t.gateway.textCalls().map((call) => call.kind).sort()).toEqual(['judge', 'memory_extraction', 'turn']);
    });

    it('drops tags for lines that are not there, and leaves an untagged line null', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);

        const played = await play(story, chat.id, [tags([{ line: 3, emotion: 'anger' }, { line: 9, emotion: 'joy' }, { line: 3, emotion: 'joy' }])]);

        expect(emotions(lastAi(played))).toEqual([null, null, null, 'anger']);
    });

    it('the first Chat read that shows the judge done already holds the tags', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        t.gateway.scriptText('turn', { text: REPLY, model: 'glm-5.3' });
        t.gateway.scriptText('judge', tags([{ line: 1, emotion: 'love' }]));
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'I set my boots by the door.' }).expect(201);

        const deadline = Date.now() + 5_000;
        for (;;) {
            const read = lastAi(await getChat(story.id, chat.id));
            if (read.judge?.status === 'done') {
                expect(emotions(read)).toEqual([null, 'love', null, null]);
                break;
            }
            expect(read.judge?.status).toBe('pending');
            expect(emotions(read)).toEqual([null, null, null, null]);
            if (Date.now() > deadline) throw new Error('The judge did not finish in time');
        }
    });

    it('a Story without Expressions sends the judge prompt it sent before, and tags nothing', async () => {
        const story = await createStory({ expressions: false });
        const chat = await createChat(story.id);

        const played = await play(story, chat.id, [tags([{ line: 1, emotion: 'joy' }])]);

        const [call] = t.gateway.textCalls('judge');
        expect(call.messages[0].content).not.toContain('Expression');
        expect(call.messages[0].content).not.toContain('"expressions"');
        expect(call.messages[1].content).toContain('Mira watches the boots.\n\n@Mira: Better.\n\n@Kai: She means thank you.\n\n@Mira: I do not.');
        expect(call.maxTokens).toBe(700);
        expect(emotions(lastAi(played))).toEqual([null, null, null, null]);
        // Speech always answers the field, null while untagged; narration has none.
        expect(lastAi(played).parts!.slice(0, 2)).toEqual([
            { kind: 'narration', text: 'Mira watches the boots.' },
            { kind: 'speech', characterId: story.characters[0].id, speakerName: 'Mira', text: 'Better.', emotion: null },
        ]);
    });

    it('Regenerate clears the tags with the parts, and the rerun judge writes the new reply\'s own', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        const played = await play(story, chat.id, [tags([{ line: 1, emotion: 'joy' }, { line: 2, emotion: 'joy' }])]);

        // Lines in the same places as before: a tag kept from the old reply would show on line 2.
        t.gateway.scriptText('turn', { text: '@Kai: Again?\n\n@Mira: Again.\n\nMira sighs.', model: 'glm-5.3' });
        t.gateway.scriptText('judge', tags([{ line: 1, emotion: 'fear' }]));
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${lastAi(played).id}/regenerate`).expect(200);

        const rejudged = await settled(story.id, chat.id);
        expect(emotions(lastAi(rejudged))).toEqual(['fear', null, null]);
        expect(t.gateway.textCalls('judge').at(-1)!.messages[1].content).toContain('[1] @Kai: Again?');
    });

    it('an AI Message edit clears the tags, and the rerun judge tags the edited words', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        const played = await play(story, chat.id, [tags([{ line: 1, emotion: 'joy' }, { line: 2, emotion: 'anger' }, { line: 3, emotion: 'sadness' }])]);

        t.gateway.scriptText('judge', tags([{ line: 2, emotion: 'embarrassment' }]));
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http
            .patch(`/api/stories/${story.id}/chats/${chat.id}/messages/${lastAi(played).id}`)
            .send({ text: '@Mira: Better.\n\n@Mira: Thank you, I mean.' })
            .expect(200);

        // Line 1 had joy before the edit: the edited words are judged afresh.
        const rejudged = await settled(story.id, chat.id);
        expect(emotions(lastAi(rejudged))).toEqual([null, 'embarrassment']);
    });

    it('choosing a Reply version tags it again with its own judge run', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        const played = await play(story, chat.id, [tags([{ line: 1, emotion: 'joy' }])]);
        const messageId = lastAi(played).id;
        t.gateway.scriptText('turn', { text: '@Kai: Again?', model: 'glm-5.3' });
        t.gateway.scriptText('judge', tags([{ line: 1, emotion: 'fear' }]));
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${messageId}/regenerate`).expect(200);
        await settled(story.id, chat.id);

        // Version 1 was kept with its joy on line 1; choosing it judges it again from nothing.
        t.gateway.scriptText('judge', tags([{ line: 3, emotion: 'love' }]));
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.put(`/api/stories/${story.id}/chats/${chat.id}/messages/${messageId}/version`).send({ version: 1 }).expect(200);

        const rejudged = await settled(story.id, chat.id);
        expect(emotions(lastAi(rejudged))).toEqual([null, null, null, 'love']);
        expect(t.gateway.textCalls('judge')).toHaveLength(3);
    });

    it('a failed judge leaves the lines untagged, and its Retry tags them', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        // The try and its automatic retry both fail.
        const outage = new ProviderOutageError('DeepInfra answered 503.');
        const stillFailed = await play(story, chat.id, [outage, outage]);
        expect(lastAi(stillFailed).judge?.status).toBe('failed');
        expect(emotions(lastAi(stillFailed))).toEqual([null, null, null, null]);

        t.gateway.scriptText('judge', tags([{ line: 2, emotion: 'joy' }]));
        await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${lastAi(stillFailed).id}/judge`).expect(200);

        const retried = await getChat(story.id, chat.id);
        expect(lastAi(retried).judge).toEqual({ status: 'done', error: null });
        expect(emotions(lastAi(retried))).toEqual([null, null, 'joy', null]);
    });

    it('a Branch of a judged reply carries its parts\' emotions', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        const played = await play(story, chat.id, [tags([{ line: 1, emotion: 'joy' }, { line: 3, emotion: 'anger' }])]);

        const { body } = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${lastAi(played).id}/branch`).expect(201);

        const branch = await getChat(story.id, (body as { chat?: Chat; id?: number }).chat?.id ?? (body as Chat).id);
        expect(branch.id).not.toBe(chat.id);
        expect(emotions(lastAi(branch))).toEqual([null, 'joy', null, 'anger']);
    });
});

describe('The ledger records the tags in the judgement\'s one transaction', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    it('a record whose emotion write fails commits nothing, and leaves the judge pending, so a retry records each change once', async () => {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const story = (await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.' }).expect(201)).body as Story;
        await t.http.post(`/api/stories/${storyId}/scenes`).send({ name: 'Arrival', situation: 'Reach the lamp.', moveOnCondition: 'Up the stairs.' }).expect(201);
        await t.http.post(`/api/stories/${storyId}/scenes`).send({ name: 'The lamp', situation: 'Light it.' }).expect(201);
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        const mira = story.characters[0].id;

        // A reply whose background calls are still pending, so the record is the judge's own.
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        const {
            rows: [message],
        } = await client.query<{ id: number }>(
            `INSERT INTO "message" ("chat_id", "position", "kind", "model", "judge_status", "memory_status") VALUES ($1, 1, 'ai', 'glm-5.3', 'pending', 'pending') RETURNING "id"`,
            [chatId],
        );
        const {
            rows: [part],
        } = await client.query<{ id: number }>(
            `INSERT INTO "message_part" ("message_id", "position", "kind", "character_id", "speaker_name", "text") VALUES ($1, 0, 'speech', $2, 'Mira', 'Fine.') RETURNING "id"`,
            [message.id, mira],
        );
        const counts = async () =>
            (
                await client.query(
                    `SELECT (SELECT count(*) FROM "bond_change" WHERE "message_id" = $1)::int AS bonds,
                            (SELECT count(*) FROM "arc_step" WHERE "message_id" = $1)::int AS arcs,
                            (SELECT count(*) FROM "scene_advance" WHERE "message_id" = $1)::int AS scenes,
                            (SELECT count(*) FROM "time_change" WHERE "message_id" = $1)::int AS times,
                            (SELECT "judge_status" FROM "message" WHERE "id" = $1) AS judge,
                            (SELECT "current_scene_id" FROM "chat" WHERE "id" = $2) AS scene,
                            (SELECT "time_of_day" FROM "chat" WHERE "id" = $2) AS time,
                            (SELECT "emotion" FROM "message_part" WHERE "id" = $3) AS emotion`,
                    [message.id, chatId, part.id],
                )
            ).rows[0];
        const before = await counts();
        const ledger = t.app.get(LedgerModelService);
        const scenes = (await t.http.get(`/api/stories/${storyId}`).expect(200)).body.scenes as Array<{ id: number; name: string }>;
        const changes = {
            bonds: [{ fromCharacterId: mira, toCharacterId: null, label: 'Curious', description: 'Curious.', levels: null, before: null, event: 'Ash stayed.' }],
            arcs: [{ characterId: mira, step: 'Softens.', event: 'Ash stayed.' }],
            scene: { fromSceneId: scenes[0].id, fromSceneName: 'Arrival', toSceneId: scenes[1].id, toSceneName: 'The lamp', event: 'Up the stairs.' },
            time: { fromTime: null, toTime: 'night' as const },
        };

        // A write the database refuses: not one of the eight emotions.
        await expect(ledger.record(chatId, message.id, { ...changes, emotions: [{ partId: part.id, emotion: 'bored' as Emotion }] })).rejects.toThrow();

        expect(await counts()).toEqual(before);
        expect(before).toMatchObject({ bonds: 0, arcs: 0, scenes: 0, times: 0, judge: 'pending', emotion: null });

        // The retry starts clean and records each change once.
        await ledger.record(chatId, message.id, { ...changes, emotions: [{ partId: part.id, emotion: 'joy' }] });
        expect(await counts()).toEqual({ bonds: 1, arcs: 1, scenes: 1, times: 1, judge: 'done', scene: scenes[1].id, time: 'night', emotion: 'joy' });
        await client.end();
    });
});
