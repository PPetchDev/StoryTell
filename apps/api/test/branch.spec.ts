import pg from 'pg';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { FAKE_TEXT_MODEL } from '../src/service/model-gateway/fake-model-gateway.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Branch (.scratch/branch/spec.md): "Branch from here" on a Message makes a new Chat holding
 * the source's Messages up to and including it, with everything the Chat knew there, and the
 * source is not touched. Through the HTTP API with the fake gateway scripted.
 */

type Status = 'pending' | 'done' | 'failed';

interface Part {
    kind: string;
    text: string;
    speakerName?: string;
}

interface Message {
    id: number;
    kind: 'user' | 'ai';
    text?: string;
    parts?: Part[];
    judge?: { status: Status; error: string | null } | null;
    memory?: { status: Status; error: string | null } | null;
    versions?: { current: number; count: number } | null;
}

interface Chat {
    id: number;
    storyId: number;
    title: string;
    lastPlayedAt: string;
    currentScene: { id: number; name: string } | null;
    timeOfDay: string | null;
    identityName: string;
    personaId: number | null;
    messages: Message[];
    awaitingReply: boolean;
    playable: boolean;
}

interface Story {
    id: number;
    characters: Array<{ id: number; name: string }>;
    scenes: Array<{ id: number; name: string }>;
}

interface Memory {
    id: number;
    text: string;
    knownBy: number[];
    writtenBy: 'ai' | 'user';
    locked: boolean;
    archived: boolean;
}

interface Dashboard {
    characters: Array<{
        name: string;
        bonds: Array<{ toward: { name: string }; label: string; history: Array<{ label: string }> }>;
        arcSteps: Array<{ step: string }>;
        arcDirection: string;
    }>;
    scene: { current: { name: string } | null };
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';

function judgement(fields: { bonds?: Array<{ from: string; to: string; label: string }>; arcs?: Array<{ character: string; step: string }>; moveOn?: boolean; time?: string }): string {
    return JSON.stringify({
        bond_changes: (fields.bonds ?? []).map((bond) => ({ ...bond, description: `${bond.label}, in a word.`, cause: 'it happened' })),
        arc_steps: (fields.arcs ?? []).map((arc) => ({ ...arc, cause: 'it happened' })),
        scene: { move_on: fields.moveOn ?? false, reason: 'because' },
        ...(fields.time ? { time_of_day: fields.time } : {}),
    });
}

function extraction(operations: object[]): string {
    return JSON.stringify({ operations: operations.map((operation) => ({ cause: 'it happened', ...operation })) });
}

describe('Branch', () => {
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

    /** A playable Story: Mira (wary of the Role at the start, with Arc directions) and Kai, with two Scenes. */
    async function createStory(): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const mira = await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short sentences.', arcDirections: 'If trusted, she softens.' })
            .expect(201);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Kai', appearance: 'Wiry.', personality: 'Nosy.', voice: 'Rambling.' })
            .expect(201);
        await t.http
            .post(`/api/stories/${storyId}/starting-bonds`)
            .send({ fromCharacterId: mira.body.characters[0].id, toCharacterId: null, label: 'Wary', description: 'She expects Ash to leave.' })
            .expect(201);
        await t.http.post(`/api/stories/${storyId}/scenes`).send({ name: 'Arrival', situation: 'Reach the lamp room.', moveOnCondition: 'Mira lets Ash up.' }).expect(201);
        await t.http.post(`/api/stories/${storyId}/scenes`).send({ name: 'The lamp', situation: 'Light it.' }).expect(201);
        return (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story;
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
            const last = [...chat.messages].reverse().find((message) => message.kind === 'ai' && message.judge);
            if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    async function play(storyId: number, chatId: number, text: string, reply: string, judge: string | ProviderOutageError[] = NO_CHANGE, memory: string | ProviderOutageError[] = NO_OPS): Promise<Chat> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', ...(Array.isArray(judge) ? judge : [judge]));
        t.gateway.scriptText('memory_extraction', ...(Array.isArray(memory) ? memory : [memory]));
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    function branch(storyId: number, chatId: number, messageId: number) {
        return t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${messageId}/branch`);
    }

    async function branched(storyId: number, chatId: number, messageId: number): Promise<Chat> {
        return (await branch(storyId, chatId, messageId).expect(201)).body as Chat;
    }

    async function memories(storyId: number, chatId: number): Promise<Memory[]> {
        return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/memories`).expect(200)).body.memories as Memory[];
    }

    async function dashboard(storyId: number, chatId: number): Promise<Dashboard> {
        return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/dashboard`).expect(200)).body as Dashboard;
    }

    /** The dashboard as the story reads it, without ids or times: Bonds with their history, Arc steps, Arc directions and the Scene. */
    async function feelings(storyId: number, chatId: number) {
        const board = await dashboard(storyId, chatId);
        return {
            characters: board.characters.map((character) => ({
                name: character.name,
                bonds: character.bonds.map((bond) => [bond.toward.name, bond.label, bond.history.map((change) => change.label)]),
                arcSteps: character.arcSteps.map((step) => step.step),
                arcDirection: character.arcDirection,
            })),
            scene: board.scene.current?.name ?? null,
        };
    }

    /** Memory as the story reads it, without ids: text, Known by, who wrote it, the flags. */
    async function memoryFacts(storyId: number, chatId: number) {
        return (await memories(storyId, chatId)).map((memory) => ({
            text: memory.text,
            knownBy: memory.knownBy,
            writtenBy: memory.writtenBy,
            locked: memory.locked,
            archived: memory.archived,
        }));
    }

    /** Everything a read of the Chat answers, to show the source was not touched. */
    async function everything(storyId: number, chatId: number) {
        return {
            chat: await getChat(storyId, chatId),
            memories: await memories(storyId, chatId),
            dashboard: await dashboard(storyId, chatId),
            storySoFar: (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/story-so-far`).expect(200)).body,
        };
    }

    function contentOf(message: Message) {
        return { kind: message.kind, text: message.text, parts: message.parts, judge: message.judge, memory: message.memory };
    }

    /** Makes calls of `kind` hang until `release`; the rest go through as scripted. */
    function hold(kind: TextCompletionRequest['kind']): { release(text: string): void; restore(): void } {
        let release: (text: string) => void = () => {};
        const result = new Promise<string>((resolve) => (release = resolve));
        const original = t.gateway.completeText.bind(t.gateway);
        t.gateway.completeText = async (request) => {
            if (request.kind !== kind) return original(request);
            t.gateway.calls.push({ method: 'completeText', request });
            return { text: await result, model: FAKE_TEXT_MODEL, usage: { promptTokens: 0, completionTokens: 0 }, costUsd: 0 };
        };
        return { release: (text) => release(text), restore: () => (t.gateway.completeText = original) };
    }

    async function sql(text: string, params: unknown[] = []): Promise<any[]> {
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        try {
            return (await client.query(text, params)).rows;
        } finally {
            await client.end();
        }
    }

    /** Two turns: the first makes Mira curious, steps Kai's Arc and sets the evening; the second moves the Scene on, makes her trusting and sets the night. */
    async function twoTurns(storyId: number, chatId: number): Promise<Chat> {
        await play(
            storyId,
            chatId,
            'I climb the stairs.',
            '@Mira: Fine. Come up.',
            judgement({ bonds: [{ from: 'Mira', to: 'user', label: 'Curious' }], arcs: [{ character: 'Kai', step: 'Grows loyal.' }], time: 'evening' }),
            extraction([{ op: 'add', text: 'Mira let {user} up the stairs.', known_by: ['Mira'] }]),
        );
        return play(
            storyId,
            chatId,
            'I light the lamp.',
            '@Mira: It burns.\n\nThe beam sweeps the sea.',
            judgement({ bonds: [{ from: 'Mira', to: 'user', label: 'Trusting' }], arcs: [{ character: 'Mira', step: 'Softens.' }], moveOn: true, time: 'night' }),
            extraction([{ op: 'add', text: '{user} lit the lamp.', known_by: ['Mira', 'Kai'] }]),
        );
    }

    describe('the copy', () => {
        it('holds Messages 1…N with the same parts, and the Bonds, Arcs, Scene and Memory an edit of N + 1 leaves, at N\'s Time of day', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const source = await twoTurns(story.id, chat.id);
            const n = source.messages[2];

            const made = await branched(story.id, chat.id, n.id);

            expect(made.id).not.toBe(chat.id);
            expect(made.title).toBe('Chat 1 (branch)');
            expect(made.messages.map(contentOf)).toEqual(source.messages.slice(0, 3).map(contentOf));
            expect(made.messages.map((message) => message.id)).not.toContain(n.id);
            expect(made.timeOfDay).toBe('evening');
            expect(made.currentScene?.name).toBe('Arrival');
            expect(made.awaitingReply).toBe(false);

            // A twin Chat played the same way, then Message N + 1 edited: the state Branch must match.
            const twin = await createChat(story.id);
            const twinPlayed = await twoTurns(story.id, twin.id);
            t.gateway.scriptText('turn', 'Mira waits.');
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.patch(`/api/stories/${story.id}/chats/${twin.id}/messages/${twinPlayed.messages[3].id}`).send({ text: 'I wait.' }).expect(200);
            const twinEdited = await settled(story.id, twin.id);

            expect(await feelings(story.id, made.id)).toEqual(await feelings(story.id, twin.id));
            expect(await memoryFacts(story.id, made.id)).toEqual(await memoryFacts(story.id, twin.id));
            expect(twinEdited.timeOfDay).toBe(made.timeOfDay);
            expect(await feelings(story.id, made.id)).toMatchObject({
                characters: [
                    { name: 'Mira', bonds: [['Ash', 'Curious', ['Curious', 'Wary']]], arcSteps: [], arcDirection: 'If trusted, she softens.' },
                    { name: 'Kai', bonds: [], arcSteps: ['Grows loyal.'] },
                ],
                scene: 'Arrival',
            });
        });

        it('leaves the source exactly as it was, last played time included, and heads the Chat list', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const source = await twoTurns(story.id, chat.id);
            const before = await everything(story.id, chat.id);

            const made = await branched(story.id, chat.id, source.messages[2].id);

            expect(await everything(story.id, chat.id)).toEqual(before);
            const list = (await t.http.get(`/api/stories/${story.id}/chats`).expect(200)).body.chats as Chat[];
            expect(list.map((item) => item.id)).toEqual([made.id, chat.id]);
        });

        it('keeps the Arc directions the source holds, not the Story\'s current ones, and wears the identity the source wears now', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await play(story.id, chat.id, 'Hello.', 'Mira nods.');
            await t.http.patch(`/api/stories/${story.id}/characters/${story.characters[0].id}`).send({ arcDirections: 'If betrayed, she hardens.' }).expect(200);
            const persona = await t.http.post('/api/personas').send({ name: 'Rowan', description: 'A drifter.' }).expect(201);
            await t.http.put(`/api/stories/${story.id}/chats/${chat.id}/identity`).send({ personaId: persona.body.id }).expect(200);

            const made = await branched(story.id, chat.id, (await getChat(story.id, chat.id)).messages[0].id);

            expect(made.messages).toHaveLength(1);
            expect(made.identityName).toBe('Rowan');
            expect(made.personaId).toBe(persona.body.id);
            const mira = (await dashboard(story.id, made.id)).characters.find((character) => character.name === 'Mira')!;
            expect(mira.arcDirection).toBe('If trusted, she softens.');
            expect(mira.bonds.map((bond) => bond.label)).toEqual(['Wary']);
        });

        it('leaves out a later Memory, puts back later updates, archives, Known-by additions and deletes, keeps the user\'s own work as an edit would', async () => {
            const story = await createStory();
            const [mira, kai] = story.characters;
            const chat = await createChat(story.id);
            await play(
                story.id,
                chat.id,
                'I look around.',
                'Mira watches.',
                NO_CHANGE,
                extraction([
                    { op: 'add', text: 'Mira keeps a knife.', known_by: ['Mira'] },
                    { op: 'add', text: 'Kai owes {user} money.', known_by: ['Kai'] },
                    { op: 'add', text: 'The lamp is cracked.', known_by: ['Mira'] },
                    { op: 'add', text: 'Kai drinks.', known_by: ['Kai'] },
                    { op: 'add', text: 'The ferry runs weekly.', known_by: ['Mira'] },
                ]),
            );
            const n = (await getChat(story.id, chat.id)).messages[2];
            const atN = await memoryFacts(story.id, chat.id);
            const [knife, debt, lamp, drink, ferry] = await memories(story.id, chat.id);
            await play(
                story.id,
                chat.id,
                'I sit down.',
                'Kai grins.',
                NO_CHANGE,
                extraction([
                    { op: 'add', text: 'Kai found the key.', known_by: ['Kai'] },
                    { op: 'add', text: 'Mira hums at night.', known_by: ['Mira'] },
                    { op: 'update', id: knife.id, text: 'Mira keeps two knives.' },
                    { op: 'archive', id: debt.id },
                    { op: 'known_by', id: lamp.id, names: ['Kai'] },
                    { op: 'delete', id: drink.id },
                    { op: 'update', id: ferry.id, text: 'The ferry runs daily.' },
                ]),
            );
            const memoryPath = `/api/stories/${story.id}/chats/${chat.id}/memories`;
            await t.http.post(memoryPath).send({ text: '{user} hid a letter.', knownBy: [] }).expect(201);
            const hums = (await memories(story.id, chat.id)).find((memory) => memory.text === 'Mira hums at night.')!;
            await t.http.patch(`${memoryPath}/${hums.id}`).send({ text: 'Mira hums sea shanties.' }).expect(200);
            await t.http.patch(`${memoryPath}/${ferry.id}`).send({ text: 'The ferry runs when it likes.' }).expect(200);
            const sourceBefore = await memories(story.id, chat.id);

            const made = await branched(story.id, chat.id, n.id);

            const facts = await memoryFacts(story.id, made.id);
            const byText = new Map(atN.map((fact) => [fact.text, fact]));
            // As at N: the update undone, the archive lifted, Kai off the Known by, the deleted one back.
            expect(facts).toContainEqual(byText.get('Mira keeps a knife.'));
            expect(facts).toContainEqual(byText.get('Kai owes {user} money.'));
            expect(facts).toContainEqual({ ...byText.get('The lamp is cracked.')!, knownBy: [mira.id] });
            expect(facts).toContainEqual(byText.get('Kai drinks.'));
            // The user's own work, exactly as an edit of N + 1 leaves it.
            expect(facts).toContainEqual(expect.objectContaining({ text: 'The ferry runs when it likes.', locked: true }));
            expect(facts).toContainEqual(expect.objectContaining({ text: '{user} hid a letter.', writtenBy: 'user' }));
            expect(facts.map((fact) => fact.text)).not.toContain('Kai found the key.');
            expect(facts.map((fact) => fact.text)).not.toContain('Mira hums sea shanties.');
            expect(facts).toHaveLength(6);
            // The source keeps its own Memories, and the Branch shares none of their ids.
            expect(await memories(story.id, chat.id)).toEqual(sourceBefore);
            const sourceIds = new Set(sourceBefore.map((memory) => memory.id));
            expect((await memories(story.id, made.id)).some((memory) => sourceIds.has(memory.id))).toBe(false);
            expect(kai.id).toBeGreaterThan(0);
        });

        it('copies the Reply versions of the newest reply, and choosing one in the Branch leaves the source\'s shown version', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const played = await play(story.id, chat.id, 'Hello.', 'Mira nods.');
            t.gateway.scriptText('turn', 'Mira shrugs.');
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${played.messages[2].id}/regenerate`).expect(200);
            const source = await settled(story.id, chat.id);
            expect(source.messages[2].versions).toEqual({ current: 2, count: 2 });

            const made = await branched(story.id, chat.id, source.messages[2].id);
            expect(made.messages[2].versions).toEqual({ current: 2, count: 2 });
            expect(made.messages[2].parts).toEqual(source.messages[2].parts);

            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            const chosen = await t.http.put(`/api/stories/${story.id}/chats/${made.id}/messages/${made.messages[2].id}/version`).send({ version: 1 }).expect(200);
            expect(chosen.body.messages[2].versions).toEqual({ current: 1, count: 2 });
            expect(chosen.body.messages[2].parts.map((part: Part) => part.text)).toEqual(['Mira nods.']);
            await settled(story.id, made.id);
            expect((await getChat(story.id, chat.id)).messages[2]).toEqual(source.messages[2]);
        });

        it('brings no Reply versions from an earlier reply', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await play(story.id, chat.id, 'Hello.', 'Mira nods.');
            const played = await play(story.id, chat.id, 'Again.', 'Kai waves.');
            t.gateway.scriptText('turn', 'Kai shrugs.');
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${played.messages[4].id}/regenerate`).expect(200);
            await settled(story.id, chat.id);

            const made = await branched(story.id, chat.id, played.messages[2].id);

            expect(made.messages.map((message) => message.versions ?? null)).toEqual([null, null, null]);
        });

        it('copies the Story so far only when it covers nothing past N', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const source = await twoTurns(story.id, chat.id);
            await sql(`UPDATE "chat" SET "story_so_far" = 'Ash arrived in the storm.', "story_so_far_through" = 2, "story_so_far_by" = 'user', "story_so_far_corrections" = 'Ash arrived in the storm.' WHERE "id" = $1`, [chat.id]);
            const path = (chatId: number) => `/api/stories/${story.id}/chats/${chatId}/story-so-far`;

            const atTwo = await branched(story.id, chat.id, source.messages[2].id);
            expect((await t.http.get(path(atTwo.id)).expect(200)).body).toMatchObject({ text: 'Ash arrived in the storm.', writtenBy: 'user' });

            const atZero = await branched(story.id, chat.id, source.messages[0].id);
            expect((await t.http.get(path(atZero.id)).expect(200)).body).toMatchObject({ text: null });
            expect((await t.http.get(path(chat.id)).expect(200)).body).toMatchObject({ text: 'Ash arrived in the storm.' });
        });

        it('leaves the source\'s Snapshots under the source', async () => {
            const story = await createStory();
            const mira = story.characters[0];
            t.gateway.scriptImage('reference_image', ...[1, 2, 3, 4].map(() => ({ image: { bytes: Buffer.from('mira'), mimeType: 'image/jpeg' } })));
            const round = await t.http.post(`/api/stories/${story.id}/characters/${mira.id}/reference-image/candidates`).expect(201);
            await t.http.put(`/api/stories/${story.id}/characters/${mira.id}/reference-image`).send({ candidateId: round.body.candidates[0].id }).expect(200);
            const chat = await createChat(story.id);
            const played = await play(story.id, chat.id, 'Hello.', '@Mira: Took you long enough.');
            t.gateway.scriptText('snapshot_prompt', JSON.stringify({ in_frame: ['Mira'], scene: 'Mira at the window.' }));
            t.gateway.scriptImage('snapshot_image', { image: { bytes: Buffer.from('snap'), mimeType: 'image/jpeg' }, model: 'seedream-v4-edit', costUsd: 0.05 });
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/snapshots`).send({ messageId: played.messages[2].id }).expect(202);
            const deadline = Date.now() + 5_000;
            while ((await t.http.get(`/api/stories/${story.id}/chats/${chat.id}/snapshots`)).body.snapshots.length === 0) {
                if (Date.now() > deadline) throw new Error('The Snapshot did not land in time');
                await new Promise((resolve) => setTimeout(resolve, 20));
            }

            const made = await branched(story.id, chat.id, played.messages[2].id);

            const gallery = async (chatId: number) => (await t.http.get(`/api/stories/${story.id}/gallery?chatId=${chatId}`).expect(200)).body.snapshots as unknown[];
            expect(await gallery(chat.id)).toHaveLength(1);
            expect(await gallery(made.id)).toEqual([]);
            expect((await t.http.get(`/api/stories/${story.id}/chats/${made.id}/snapshots`).expect(200)).body.snapshots).toEqual([]);
        });

        it('from a User Message ends on the Message before it, awaiting nothing, with no model called', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const source = await twoTurns(story.id, chat.id);
            const calls = t.gateway.textCalls().length + t.gateway.imageCalls().length;

            const made = await branched(story.id, chat.id, source.messages[3].id);

            expect(made.messages.map(contentOf)).toEqual(source.messages.slice(0, 3).map(contentOf));
            expect(made.awaitingReply).toBe(false);
            expect(made.timeOfDay).toBe('evening');
            expect(t.gateway.textCalls().length + t.gateway.imageCalls().length).toBe(calls);
        });

        it("sends only Messages 1…N on the Branch's next turn, with Memory and Feelings as at N", async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const source = await twoTurns(story.id, chat.id);
            const made = await branched(story.id, chat.id, source.messages[2].id);

            await play(story.id, made.id, 'I say no.', 'Mira frowns.');

            const call = t.gateway.textCalls('turn').at(-1)!;
            const system = call.messages[0].content;
            expect(system).toContain('Curious');
            expect(system).not.toContain('Trusting');
            expect(system).toContain('# Current Scene: Arrival');
            expect(system).toContain('Mira let Ash up the stairs.');
            expect(system).not.toContain('Ash lit the lamp.');
            const history = call.messages.slice(1).map((message) => message.content).join('\n');
            expect(history).toContain('I climb the stairs.');
            expect(history).toContain('I say no.');
            expect(history).not.toContain('I light the lamp.');
            expect(history).not.toContain('It burns.');
        });
    });

    describe('separation', () => {
        it('a Memory deleted or edited in the Branch leaves the source\'s alone', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const source = await twoTurns(story.id, chat.id);
            const made = await branched(story.id, chat.id, source.messages[4].id);
            const sourceBefore = await memories(story.id, chat.id);
            const [first, second] = await memories(story.id, made.id);

            await t.http.delete(`/api/stories/${story.id}/chats/${made.id}/memories/${first.id}`).expect(204);
            await t.http.patch(`/api/stories/${story.id}/chats/${made.id}/memories/${second.id}`).send({ text: 'Changed in the Branch.' }).expect(200);

            expect(await memories(story.id, chat.id)).toEqual(sourceBefore);
            expect((await memories(story.id, made.id)).map((memory) => memory.text)).toEqual(['Changed in the Branch.']);
        });

        /** A Chat whose second reply deletes the Memory its first reply added. */
        async function deletedBeforeN(storyId: number, chatId: number): Promise<Chat> {
            await play(storyId, chatId, 'I look around.', 'Mira watches.', NO_CHANGE, extraction([{ op: 'add', text: 'Kai drinks.', known_by: ['Kai'] }]));
            const [drink] = await memories(storyId, chatId);
            return play(storyId, chatId, 'I sit.', 'Kai grins.', NO_CHANGE, extraction([{ op: 'delete', id: drink.id }]));
        }

        async function editUserMessage(storyId: number, chatId: number, messageId: number): Promise<void> {
            t.gateway.scriptText('turn', 'Mira waits.');
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.patch(`/api/stories/${storyId}/chats/${chatId}/messages/${messageId}`).send({ text: 'I stand.' }).expect(200);
            await settled(storyId, chatId);
        }

        it('an edit in the Branch that rolls back a delete from before N puts the Memory back in the Branch only, while the source has deleted it too', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const source = await deletedBeforeN(story.id, chat.id);
            const made = await branched(story.id, chat.id, source.messages[4].id);
            expect(await memories(story.id, made.id)).toEqual([]);

            await editUserMessage(story.id, made.id, made.messages[3].id);

            expect((await memories(story.id, made.id)).map((memory) => memory.text)).toEqual(['Kai drinks.']);
            expect(await memories(story.id, chat.id)).toEqual([]);
            // And the source's own rollback still puts back its own.
            await editUserMessage(story.id, chat.id, source.messages[3].id);
            expect((await memories(story.id, chat.id)).map((memory) => memory.text)).toEqual(['Kai drinks.']);
            expect((await memories(story.id, made.id)).map((memory) => memory.text)).toEqual(['Kai drinks.']);
            expect((await memories(story.id, chat.id))[0].id).not.toBe((await memories(story.id, made.id))[0].id);
        });

        it('…and while the source still holds that Memory', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const source = await deletedBeforeN(story.id, chat.id);
            const made = await branched(story.id, chat.id, source.messages[4].id);
            await editUserMessage(story.id, chat.id, source.messages[3].id);
            const sourceHeld = await memories(story.id, chat.id);
            expect(sourceHeld.map((memory) => memory.text)).toEqual(['Kai drinks.']);

            await editUserMessage(story.id, made.id, made.messages[3].id);

            expect((await memories(story.id, made.id)).map((memory) => memory.text)).toEqual(['Kai drinks.']);
            expect(await memories(story.id, chat.id)).toEqual(sourceHeld);
        });
    });

    describe('the gate', () => {
        it('is refused while the source\'s turn is being written', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const turn = hold('turn');
            try {
                const sending = t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Hello.' }).then((response) => response);
                await new Promise((resolve) => setTimeout(resolve, 200));
                const refused = await branch(story.id, chat.id, chat.messages[0].id).expect(409);
                expect(refused.body.error.code).toBe('409.004.004');
                t.gateway.scriptText('judge', NO_CHANGE);
                t.gateway.scriptText('memory_extraction', NO_OPS);
                turn.release('Mira nods.');
                expect((await sending).status).toBe(201);
            } finally {
                turn.restore();
            }
            await settled(story.id, chat.id);
            expect((await t.http.get(`/api/stories/${story.id}/chats`).expect(200)).body.chats).toHaveLength(1);
        });

        it('waits for a pending judge, and the Branch holds what it saved', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const judge = hold('judge');
            try {
                t.gateway.scriptText('turn', 'Mira nods.');
                t.gateway.scriptText('memory_extraction', NO_OPS);
                const sent = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Hello.' }).expect(201);
                const reply = sent.body.messages[2] as Message;
                const branching = branch(story.id, chat.id, reply.id).then((response) => response);
                await new Promise((resolve) => setTimeout(resolve, 300));
                judge.release(judgement({ bonds: [{ from: 'Mira', to: 'user', label: 'Curious' }] }));
                const done = await branching;
                expect(done.status).toBe(201);
                expect(done.body.messages[2].judge).toEqual({ status: 'done', error: null });
                const mira = (await dashboard(story.id, done.body.id)).characters.find((character) => character.name === 'Mira')!;
                expect(mira.bonds.map((bond) => bond.label)).toEqual(['Curious']);
            } finally {
                judge.release(NO_CHANGE);
                judge.restore();
            }
        });

        it('answers 409.004.007 when the judge outlasts the wait, making no Chat', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const judge = hold('judge');
            try {
                t.gateway.scriptText('turn', 'Mira nods.');
                t.gateway.scriptText('memory_extraction', NO_OPS);
                const sent = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Hello.' }).expect(201);
                const refused = await branch(story.id, chat.id, sent.body.messages[2].id).expect(409);
                expect(refused.body.error.code).toBe('409.004.007');
                expect((await t.http.get(`/api/stories/${story.id}/chats`).expect(200)).body.chats).toHaveLength(1);
            } finally {
                judge.release(NO_CHANGE);
                judge.restore();
            }
            await settled(story.id, chat.id);
        });

        it('is allowed with failed background calls, and the Branch carries the same statuses', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const failed = await play(
                story.id,
                chat.id,
                'Hello.',
                'Mira nods.',
                [new ProviderOutageError('first try'), new ProviderOutageError('DeepInfra answered 503.')],
                [new ProviderOutageError('first try'), new ProviderOutageError('Memory call failed.')],
            );
            expect(failed.messages[2].judge).toEqual({ status: 'failed', error: 'DeepInfra answered 503.' });

            const made = await branched(story.id, chat.id, failed.messages[2].id);

            expect(made.messages[2].judge).toEqual({ status: 'failed', error: 'DeepInfra answered 503.' });
            expect(made.messages[2].memory).toEqual({ status: 'failed', error: 'Memory call failed.' });
            // The Retry in the Branch runs the call there, by the user's tap.
            t.gateway.scriptText('judge', judgement({ bonds: [{ from: 'Mira', to: 'user', label: 'Curious' }] }));
            await t.http.post(`/api/stories/${story.id}/chats/${made.id}/messages/${made.messages[2].id}/judge`).expect(200);
            expect((await getChat(story.id, chat.id)).messages[2].judge?.status).toBe('failed');
        });

        it('is allowed with the Story unplayable and with text credit out', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const played = await play(story.id, chat.id, 'Hello.', 'Mira nods.');

            t.gateway.setRemainingCredit({ text: { remainingUsd: 0, limitUsd: 22 } });
            await branch(story.id, chat.id, played.messages[1].id).expect(201);
            t.gateway.setRemainingCredit({ text: { remainingUsd: null, limitUsd: null } });

            await t.http.patch(`/api/stories/${story.id}`).send({ setting: '' }).expect(200);
            expect((await getChat(story.id, chat.id)).playable).toBe(false);
            await branch(story.id, chat.id, played.messages[2].id).expect(201);
            expect(t.gateway.textCalls('turn')).toHaveLength(1);
        });

        it('answers 404 for a Message of another Chat, and for a Chat of another Story', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const other = await createChat(story.id);
            expect((await branch(story.id, chat.id, other.messages[0].id).expect(404)).body.error.code).toBe('404.004.006');
            const elsewhere = await createStory();
            await branch(elsewhere.id, chat.id, chat.messages[0].id).expect(404);
        });

        it('leaves no new Chat when it fails partway', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const played = await play(story.id, chat.id, 'Hello.', 'Mira nods.');
            const chatRows = await sql('SELECT count(*)::int AS "n" FROM "chat"');
            await sql(`CREATE FUNCTION branch_test_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'copy step failed'; END $$ LANGUAGE plpgsql`);
            await sql(`CREATE TRIGGER branch_test_fail BEFORE INSERT ON "chat_arc_direction" FOR EACH ROW EXECUTE FUNCTION branch_test_fail()`);
            try {
                await branch(story.id, chat.id, played.messages[2].id).expect(500);
            } finally {
                await sql('DROP TRIGGER branch_test_fail ON "chat_arc_direction"');
                await sql('DROP FUNCTION branch_test_fail()');
            }
            expect((await t.http.get(`/api/stories/${story.id}/chats`).expect(200)).body.chats).toHaveLength(1);
            expect(await sql('SELECT count(*)::int AS "n" FROM "chat"')).toEqual(chatRows);
            await branch(story.id, chat.id, played.messages[2].id).expect(201);
        });
    });

    describe('isolation from a manual Retry', () => {
        async function failedJudge(): Promise<{ story: Story; chat: Chat; reply: Message }> {
            const story = await createStory();
            const created = await createChat(story.id);
            const chat = await play(story.id, created.id, 'Hello.', 'Mira nods.', [new ProviderOutageError('first try'), new ProviderOutageError('again')]);
            return { story, chat, reply: chat.messages[2] };
        }

        it('a Branch while a manual Retry of the judge runs is 409.004.004, and the Retry then answers as before', async () => {
            const { story, chat, reply } = await failedJudge();
            const judge = hold('judge');
            try {
                const retrying = t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${reply.id}/judge`).then((response) => response);
                await new Promise((resolve) => setTimeout(resolve, 200));
                expect((await branch(story.id, chat.id, reply.id).expect(409)).body.error.code).toBe('409.004.004');
                judge.release(judgement({ bonds: [{ from: 'Mira', to: 'user', label: 'Curious' }] }));
                const done = await retrying;
                expect(done.status).toBe(200);
                expect(done.body.background[0].judge).toEqual({ status: 'done', error: null });
            } finally {
                judge.release(NO_CHANGE);
                judge.restore();
            }
            await branch(story.id, chat.id, reply.id).expect(201);
        });

        it('a manual Retry while a Branch holds the lock is 409.004.004', async () => {
            const { story, chat, reply } = await failedJudge();
            // Holds the Branch mid-copy: its insert of the Arc directions waits on this lock.
            const blocker = new pg.Client({ connectionString: t.databaseUrl });
            await blocker.connect();
            try {
                await blocker.query('BEGIN');
                await blocker.query('LOCK TABLE "chat_arc_direction" IN ACCESS EXCLUSIVE MODE');
                const branching = branch(story.id, chat.id, reply.id).then((response) => response);
                await new Promise((resolve) => setTimeout(resolve, 300));
                const refused = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${reply.id}/judge`).expect(409);
                expect(refused.body.error.code).toBe('409.004.004');
                await blocker.query('COMMIT');
                expect((await branching).status).toBe(201);
            } finally {
                await blocker.end();
            }
            t.gateway.scriptText('judge', NO_CHANGE);
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${reply.id}/judge`).expect(200);
        });
    });

    describe('titles and the link back (ticket 03)', () => {
        interface Linked {
            id: number;
            title: string;
            branchedFrom: { chatId: number; title: string; messageId?: number | null } | null;
        }

        async function list(storyId: number): Promise<Linked[]> {
            return (await t.http.get(`/api/stories/${storyId}/chats`).expect(200)).body.chats as Linked[];
        }

        it('names "(branch)", then "(branch 2)", and a Branch of a Branch "(branch 3)" rather than a stacked suffix', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const opening = chat.messages[0].id;

            const first = await branched(story.id, chat.id, opening);
            const second = await branched(story.id, chat.id, opening);
            const ofBranch = await branched(story.id, first.id, first.messages[0].id);

            expect([first.title, second.title, ofBranch.title]).toEqual(['Chat 1 (branch)', 'Chat 1 (branch 2)', 'Chat 1 (branch 3)']);
        });

        it('gives a Branch of a Branch "(branch 2)" when that is the next free one', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const first = await branched(story.id, chat.id, chat.messages[0].id);

            const ofBranch = await branched(story.id, first.id, first.messages[0].id);

            expect(ofBranch.title).toBe('Chat 1 (branch 2)');
        });

        it('cuts a long title to the 200-character limit', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const long = 'L'.repeat(200);
            await t.http.patch(`/api/stories/${story.id}/chats/${chat.id}`).send({ title: long }).expect(200);

            const first = await branched(story.id, chat.id, chat.messages[0].id);
            const second = await branched(story.id, chat.id, chat.messages[0].id);

            expect(first.title).toBe(`${'L'.repeat(191)} (branch)`);
            expect(second.title).toBe(`${'L'.repeat(189)} (branch 2)`);
            expect(second.title).toHaveLength(200);
        });

        it('links back on the detail and the list, with the source\'s live title and the Message tapped', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const source = await play(story.id, chat.id, 'Hello.', 'Mira nods.');

            const made = await branch(story.id, chat.id, source.messages[1].id).expect(201);

            expect(made.body.branchedFrom).toEqual({ chatId: chat.id, title: 'Chat 1', messageId: source.messages[1].id });
            expect((await getChat(story.id, chat.id)) as unknown as Linked).toMatchObject({ branchedFrom: null });
            expect(await list(story.id)).toEqual([
                expect.objectContaining({ id: made.body.id, branchedFrom: { chatId: chat.id, title: 'Chat 1' } }),
                expect.objectContaining({ id: chat.id, branchedFrom: null }),
            ]);

            await t.http.patch(`/api/stories/${story.id}/chats/${chat.id}`).send({ title: 'The gate' }).expect(200);
            expect(((await getChat(story.id, made.body.id)) as unknown as Linked).branchedFrom).toEqual({
                chatId: chat.id,
                title: 'The gate',
                messageId: source.messages[1].id,
            });
            expect((await list(story.id))[0].branchedFrom).toEqual({ chatId: chat.id, title: 'The gate' });
        });

        it('keeps the link through a Reset, and drops it, keeping the Branch, when the source is deleted', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const made = await branched(story.id, chat.id, chat.messages[0].id);

            const reset = await t.http.post(`/api/stories/${story.id}/chats/${made.id}/reset`).expect(200);
            expect(reset.body.branchedFrom).toEqual({ chatId: chat.id, title: 'Chat 1', messageId: chat.messages[0].id });

            await t.http.delete(`/api/stories/${story.id}/chats/${chat.id}`).expect(204);

            expect(((await getChat(story.id, made.id)) as unknown as Linked).branchedFrom).toBeNull();
            expect(await list(story.id)).toEqual([expect.objectContaining({ id: made.id, title: 'Chat 1 (branch)', branchedFrom: null })]);
        });

        it('deleting a Branch does nothing to the source, and a Story never branched answers branchedFrom null everywhere', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const other = await createChat(story.id);
            expect((await list(story.id)).map((item) => item.branchedFrom)).toEqual([null, null]);
            expect(((await getChat(story.id, other.id)) as unknown as Linked).branchedFrom).toBeNull();

            const made = await branched(story.id, chat.id, chat.messages[0].id);
            await t.http.delete(`/api/stories/${story.id}/chats/${made.id}`).expect(204);

            expect((await getChat(story.id, chat.id)).messages).toHaveLength(1);
            expect((await list(story.id)).map((item) => item.id).sort()).toEqual([chat.id, other.id].sort());
        });

        it('keeps the link to the Chat when the tapped Message is gone, with no Message to land on', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const source = await twoTurns(story.id, chat.id);
            const made = await branched(story.id, chat.id, source.messages[4].id);

            // An edit of an earlier Message in the source deletes the one the Branch was tapped on.
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.patch(`/api/stories/${story.id}/chats/${chat.id}/messages/${source.messages[2].id}`).send({ text: '@Mira: No.' }).expect(200);
            await settled(story.id, chat.id);

            expect(((await getChat(story.id, made.id)) as unknown as Linked).branchedFrom).toEqual({ chatId: chat.id, title: 'Chat 1', messageId: null });
        });
    });

    describe('the draft (ticket 04)', () => {
        it('answers a User Message\'s text as draft, and null from an AI Message', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const source = await twoTurns(story.id, chat.id);

            const fromUser = await branch(story.id, chat.id, source.messages[3].id).expect(201);
            const fromAi = await branch(story.id, chat.id, source.messages[2].id).expect(201);

            expect(fromUser.body.draft).toBe('I light the lamp.');
            expect(fromUser.body.branchedFrom.messageId).toBe(source.messages[3].id);
            expect(fromAi.body.draft).toBeNull();
            // The draft is only the answer's: reading the Branch again has none.
            expect((await t.http.get(`/api/stories/${story.id}/chats/${fromUser.body.id}`).expect(200)).body.draft).toBeUndefined();
        });
    });
});
