import pg from 'pg';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { FAKE_TEXT_MODEL } from '../src/service/model-gateway/fake-model-gateway.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * The Bond, Arc and Scene judge, the change ledger and the dashboard (ticket 27), through the
 * HTTP API with the judge's output scripted on the fake gateway.
 */

type Status = 'pending' | 'done' | 'failed';

interface Message {
    id: number;
    kind: 'user' | 'ai';
    text?: string;
    model?: string;
    parts?: Array<{ kind: string; text: string; speakerName?: string }>;
    judge?: { status: Status; error: string | null } | null;
    memory?: { status: Status; error: string | null } | null;
}

interface Chat {
    id: number;
    storyId: number;
    currentScene: { id: number; name: string } | null;
    messages: Message[];
    awaitingReply: boolean;
    rolledBack?: { memoryChanges: number; bondChanges: number; arcSteps: number; sceneAdvances: number };
}

interface BondChange {
    id: number;
    label: string;
    description: string;
    before: { label: string; description: string } | null;
    event: string | null;
    messageId: number | null;
    createdAt: string;
}

interface Dashboard {
    chatId: number;
    storyId: number;
    title: string;
    identityName: string;
    characters: Array<{
        id: number;
        name: string;
        bonds: Array<{
            toward: { characterId: number | null; name: string };
            label: string;
            description: string;
            levels: { trust: number; affection: number; desire: number; tension: number } | null;
            history: BondChange[];
        }>;
        arcSteps: Array<{ id: number; characterId: number; step: string; event: string; messageId: number }>;
        arcDirection: string;
    }>;
    scene: {
        current: { id: number; name: string } | null;
        advance: { id: number; fromSceneName: string; toSceneName: string | null; event: string; messageId: number } | null;
    };
    background: Array<{
        messageId: number;
        position: number;
        judge: { status: Status; error: string | null };
        memory: { status: Status; error: string | null } | null;
    }>;
}

interface Story {
    id: number;
    characters: Array<{ id: number; name: string }>;
    scenes: Array<{ id: number; name: string }>;
    startingBonds: Array<{ id: number }>;
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';

const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
/** An extraction that changes nothing, for turns whose Memory is not under test. */
const NO_OPS = '{"operations":[]}';

/** A judgement as the judge writes it. */
function judgement(fields: {
    bonds?: Array<{ from: string; to: string; label: string; description?: string; cause?: string }>;
    arcs?: Array<{ character: string; step: string; cause?: string }>;
    scene?: unknown;
}): string {
    return JSON.stringify({
        bond_changes: (fields.bonds ?? []).map((bond) => ({ description: `${bond.label}, in a word.`, cause: `Because ${bond.label}.`, ...bond })),
        arc_steps: (fields.arcs ?? []).map((arc) => ({ cause: `Because ${arc.step}.`, ...arc })),
        scene: fields.scene ?? { move_on: false, reason: 'not yet' },
    });
}

describe('The Bond, Arc and Scene judge, the ledger and the dashboard', () => {
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

    /** A playable Story: Mira (wary of the Role at the start) and Kai (with an Arc direction), two Scenes by default. */
    async function createStory(options: { scenes?: boolean } = {}): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http
            .patch(`/api/stories/${storyId}`)
            .send({ setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING })
            .expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const mira = await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' })
            .expect(201);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({
                name: 'Kai',
                appearance: 'Wiry, sunburnt.',
                personality: 'Cheerful, nosy.',
                voice: 'Rambling.',
                arcDirections: 'If trusted, his cheer turns to loyalty.',
            })
            .expect(201);
        // Adding a Character answers with the whole Story; Mira is its first Character.
        await t.http
            .post(`/api/stories/${storyId}/starting-bonds`)
            .send({
                fromCharacterId: mira.body.characters[0].id,
                toCharacterId: null,
                label: 'Wary',
                description: 'She expects the new keeper to leave by spring.',
            })
            .expect(201);
        if (options.scenes !== false) {
            await t.http
                .post(`/api/stories/${storyId}/scenes`)
                .send({ name: 'Arrival', situation: 'Reach the lamp room.', moveOnCondition: 'Mira lets Ash up the stairs.' })
                .expect(201);
            await t.http.post(`/api/stories/${storyId}/scenes`).send({ name: 'The lamp', situation: 'Light it.' }).expect(201);
        }
        const { body } = await t.http.get(`/api/stories/${storyId}`).expect(200);
        return body as Story;
    }

    async function createChat(storyId: number): Promise<Chat> {
        const { body } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        return body as Chat;
    }

    async function getChat(storyId: number, chatId: number): Promise<Chat> {
        const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200);
        return body as Chat;
    }

    async function dashboard(storyId: number, chatId: number): Promise<Dashboard> {
        const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/dashboard`).expect(200);
        return body as Dashboard;
    }

    /** Returns once neither of the latest reply's background calls is pending. */
    async function awaitJudge(storyId: number, chatId: number): Promise<Chat> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = await getChat(storyId, chatId);
            const last = [...chat.messages].reverse().find((message) => message.kind === 'ai' && message.judge);
            if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
            if (Date.now() > deadline) throw new Error('The judge did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    /** A turn with the given reply and judge output and an extraction that changes nothing, settled. */
    async function play(storyId: number, chatId: number, text: string, reply: string, judge: string = NO_CHANGE): Promise<Chat> {
        t.gateway.scriptText('turn', { text: reply, model: 'glm-5.3' });
        t.gateway.scriptText('judge', judge);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return awaitJudge(storyId, chatId);
    }

    function lastAi(chat: Chat): Message {
        const last = chat.messages[chat.messages.length - 1];
        expect(last.kind).toBe('ai');
        return last;
    }

    function character(board: Dashboard, name: string) {
        const found = board.characters.find((candidate) => candidate.name === name);
        if (!found) throw new Error(`No ${name} on the dashboard`);
        return found;
    }

    function systemPrompt(request: TextCompletionRequest): string {
        return request.messages[0].content;
    }

    function lastCall(kind: 'turn' | 'judge'): TextCompletionRequest {
        const calls = t.gateway.textCalls(kind);
        return calls[calls.length - 1];
    }

    async function countRows(table: string, chatId: number): Promise<number> {
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        try {
            const { rows } = await client.query(`SELECT count(*)::int AS n FROM "${table}" WHERE chat_id = $1`, [chatId]);
            return rows[0].n as number;
        } finally {
            await client.end();
        }
    }

    describe('seeding and the prompt layers', () => {
        it('seeds StartingBonds and Arc directions at Chat start, and the first prompt carries them as Feelings and Arcs', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);

            const board = await dashboard(story.id, chat.id);
            expect(board).toMatchObject({ chatId: chat.id, storyId: story.id, title: 'Chat 1', identityName: 'Ash' });
            expect(character(board, 'Mira').bonds).toEqual([
                {
                    toward: { characterId: null, name: 'Ash' },
                    label: 'Wary',
                    description: 'She expects the new keeper to leave by spring.',
                    levels: { trust: 0, affection: 0, desire: 0, tension: 0 },
                    history: [
                        {
                            id: expect.any(Number),
                            fromCharacterId: story.characters[0].id,
                            toCharacterId: null,
                            label: 'Wary',
                            description: 'She expects the new keeper to leave by spring.',
                            before: null,
                            event: null,
                            messageId: null,
                            createdAt: expect.any(String),
                        },
                    ],
                    trend: [
                        {
                            id: expect.any(Number),
                            messageId: null,
                            position: null,
                            levels: { trust: 0, affection: 0, desire: 0, tension: 0 },
                            labelChanged: false,
                        },
                    ],
                },
            ]);
            expect(character(board, 'Kai')).toMatchObject({ bonds: [], arcSteps: [], arcDirection: 'If trusted, his cheer turns to loyalty.' });
            expect(character(board, 'Mira').arcDirection).toBe('');
            expect(board.scene).toEqual({ current: { id: story.scenes[0].id, name: 'Arrival' }, advance: null });
            expect(board.background).toEqual([]);

            await play(story.id, chat.id, 'I knock.', 'Mira looks up.');

            const system = systemPrompt(lastCall('turn'));
            expect(system).toContain(
                '# Feelings (hidden from the user; show them only through behaviour)\n- Mira → the user (Ash): "Wary" — She expects the new keeper to leave by spring. (Trust: unsure · Affection: indifferent · Desire: no pull · Tension: at ease)\nEach Character knows only its OWN feelings.',
            );
            expect(system).toContain(
                '# Arcs\n- Mira: Arc so far: unchanged from the core definition.\n- Kai: Arc so far: unchanged from the core definition. Possible direction (author\'s intent, not yet happened): If trusted, his cheer turns to loyalty.',
            );
            expect(system.indexOf('# Current Scene')).toBeLessThan(system.indexOf('# Feelings'));
            expect(system.indexOf('# Feelings')).toBeLessThan(system.indexOf('# Arcs'));
        });

        it('says everyone is a stranger when the Story has no StartingBonds', async () => {
            const story = await createStory();
            await t.http.delete(`/api/stories/${story.id}/starting-bonds/${story.startingBonds[0].id}`).expect(200);
            const chat = await createChat(story.id);

            await play(story.id, chat.id, 'I knock.', 'Mira looks up.');

            expect(systemPrompt(lastCall('turn'))).toContain(
                '# Feelings (hidden from the user; show them only through behaviour)\nNo feelings have formed yet — everyone is a stranger unless the story says otherwise.',
            );
            expect(character(await dashboard(story.id, chat.id), 'Mira').bonds).toEqual([]);
        });
    });

    describe('the judge call', () => {
        it('runs once per turn in JSON mode with the cast, Bonds, Arcs, Scene, recent story and the exchange', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await play(story.id, chat.id, 'I knock.', 'Mira looks up.\n\n@Mira: Boots.');
            t.gateway.reset();

            const played = await play(story.id, chat.id, 'I take them off.', '@Mira: Better.');

            expect(lastAi(played).judge).toEqual({ status: 'done', error: null });
            const calls = t.gateway.textCalls('judge');
            expect(calls).toHaveLength(1);
            expect(calls[0]).toMatchObject({ kind: 'judge', json: true, maxTokens: 700, servedFor: { storyId: story.id, chatId: chat.id } });
            expect(calls[0].messages.map((message) => message.role)).toEqual(['system', 'user']);
            expect(calls[0].messages[0].content).toContain('At most one change per Bond per turn.');
            expect(calls[0].messages[1].content).toBe(`# Cast
- Mira: Guarded and dry.
- Kai: Cheerful, nosy. (Author's Arc direction: If trusted, his cheer turns to loyalty.)
The user plays Ash (refer to them as "user").

# Current Bonds
- Mira → user: "Wary" — She expects the new keeper to leave by spring. (Trust: unsure · Affection: indifferent · Desire: no pull · Tension: at ease)

# Arc steps so far
- Mira: no steps yet
- Kai: no steps yet

# Current Scene
Arrival. Move-on condition: Mira lets Ash up the stairs.

# Time of day
not yet known

# Recent story (context)
${OPENING}

Ash: I knock.

Mira looks up.

@Mira: Boots.

# LATEST EXCHANGE (judge this)
Ash: I take them off.

@Mira: Better.`);
        });

        it('applies a judgement: the Bond change, Arc step and Scene advance are recorded with their events, before and after, and the causing Message', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);

            const played = await play(
                story.id,
                chat.id,
                'I pull a letter from my coat: her brother sent me.',
                'Mira goes still.\n\n@Mira: Come up, then.',
                judgement({
                    bonds: [{ from: 'Mira', to: 'user', label: 'Curious', description: 'The letter changes things.', cause: 'Ash brought a letter from her brother.' }],
                    arcs: [{ character: 'Mira', step: 'Lets herself hope for company.', cause: 'The letter from her brother.' }],
                    scene: { move_on: true, reason: 'Mira told Ash to come up.' },
                }),
            );
            const reply = lastAi(played);

            expect(played.currentScene).toEqual({ id: story.scenes[1].id, name: 'The lamp' });
            const board = await dashboard(story.id, chat.id);
            const mira = character(board, 'Mira');
            expect(mira.bonds).toHaveLength(1);
            expect(mira.bonds[0]).toMatchObject({ toward: { characterId: null, name: 'Ash' }, label: 'Curious', description: 'The letter changes things.' });
            expect(mira.bonds[0].history).toHaveLength(2);
            expect(mira.bonds[0].history[0]).toMatchObject({
                label: 'Curious',
                before: { label: 'Wary', description: 'She expects the new keeper to leave by spring.' },
                event: 'Ash brought a letter from her brother.',
                messageId: reply.id,
            });
            expect(mira.bonds[0].history[1]).toMatchObject({ label: 'Wary', before: null, event: null, messageId: null });
            expect(mira.arcSteps).toEqual([
                {
                    id: expect.any(Number),
                    characterId: story.characters[0].id,
                    step: 'Lets herself hope for company.',
                    event: 'The letter from her brother.',
                    messageId: reply.id,
                    createdAt: expect.any(String),
                },
            ]);
            expect(board.scene).toEqual({
                current: { id: story.scenes[1].id, name: 'The lamp' },
                advance: {
                    id: expect.any(Number),
                    fromSceneName: 'Arrival',
                    toSceneName: 'The lamp',
                    event: 'Mira told Ash to come up.',
                    messageId: reply.id,
                    createdAt: expect.any(String),
                },
            });
            expect(board.background).toEqual([
                { messageId: reply.id, position: 2, judge: { status: 'done', error: null }, memory: { status: 'done', error: null } },
            ]);

            // The next prompt sees the new Scene, the new Bond and the Arc step.
            await play(story.id, chat.id, 'I climb.', 'The stairs creak.');
            const system = systemPrompt(lastCall('turn'));
            expect(system).toContain('# Current Scene: The lamp\nLight it.');
            expect(system).toContain('- Mira → the user (Ash): "Curious" — The letter changes things.');
            expect(system).toContain('- Mira: Arc so far: Lets herself hope for company.');
            expect(lastCall('judge').messages[1].content).toContain('# Current Scene\nThe lamp. Move-on condition: (none)');
            expect(lastCall('judge').messages[1].content).toContain('- Mira: Lets herself hope for company.');
        });

        it('moves on from the last Scene into free play, and reads the Role name as "user"', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await play(story.id, chat.id, 'Up?', '@Mira: Up.', judgement({ scene: { move_on: true, reason: 'She let Ash up.' } }));

            const played = await play(
                story.id,
                chat.id,
                'I light the lamp.',
                'Light floods the gallery.',
                judgement({ bonds: [{ from: 'Mira', to: 'Ash', label: 'Grateful' }], scene: { move_on: true, reason: 'The lamp is lit.' } }),
            );

            expect(played.currentScene).toBeNull();
            const board = await dashboard(story.id, chat.id);
            expect(board.scene).toMatchObject({ current: null, advance: { fromSceneName: 'The lamp', toSceneName: null, event: 'The lamp is lit.' } });
            expect(character(board, 'Mira').bonds[0]).toMatchObject({ toward: { characterId: null, name: 'Ash' }, label: 'Grateful' });
            expect(systemPrompt((await (async () => {
                await play(story.id, chat.id, 'Now what?', 'Mira shrugs.');
                return lastCall('turn');
            })()))).toContain('No Scene — the story unfolds freely.');
        });
    });

    describe('the filters', () => {
        it('drops unknown names, self-Bonds, a same-label change, a second change of one Bond, and a second Scene advance', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);

            await play(
                story.id,
                chat.id,
                'I wait.',
                'Nothing moves.',
                judgement({
                    bonds: [
                        { from: 'Ghost', to: 'user', label: 'Haunting' },
                        { from: 'Mira', to: 'Nobody', label: 'Lost' },
                        { from: 'Mira', to: 'Mira', label: 'Proud' },
                        { from: 'Mira', to: 'user', label: 'wary', description: 'Rephrased, not changed.' },
                        { from: 'mira', to: 'KAI', label: 'Fond', description: 'An old friend.', cause: 'Kai brought bread.' },
                        { from: 'Mira', to: 'Kai', label: 'Irritated' },
                    ],
                    arcs: [{ character: 'Ghost', step: 'Fades.' }],
                    scene: [
                        { move_on: true, reason: 'Met once.' },
                        { move_on: true, reason: 'Met twice.' },
                    ],
                }),
            );

            const board = await dashboard(story.id, chat.id);
            const mira = character(board, 'Mira');
            expect(mira.bonds.map((bond) => [bond.toward.name, bond.label])).toEqual([
                ['Ash', 'Wary'],
                ['Kai', 'Fond'],
            ]);
            expect(mira.bonds[0].history).toHaveLength(1);
            expect(mira.bonds[1]).toMatchObject({ toward: { characterId: story.characters[1].id, name: 'Kai' }, description: 'An old friend.' });
            expect(mira.bonds[1].history).toMatchObject([{ before: null, event: 'Kai brought bread.' }]);
            expect(character(board, 'Kai').bonds).toEqual([]);
            expect(board.characters.flatMap((entry) => entry.arcSteps)).toEqual([]);
            expect(board.scene).toMatchObject({ current: { name: 'The lamp' }, advance: { fromSceneName: 'Arrival', toSceneName: 'The lamp', event: 'Met once.' } });
            expect(await countRows('scene_advance', chat.id)).toBe(1);
            expect(await countRows('bond_change', chat.id)).toBe(2);
        });

        it('ignores a Scene move-on while the Chat is in free play', async () => {
            const story = await createStory({ scenes: false });
            const chat = await createChat(story.id);

            const played = await play(story.id, chat.id, 'I wait.', 'Nothing moves.', judgement({ scene: { move_on: true, reason: 'Done.' } }));

            expect(played.currentScene).toBeNull();
            expect((await dashboard(story.id, chat.id)).scene).toEqual({ current: null, advance: null });
            expect(lastAi(played).judge).toEqual({ status: 'done', error: null });
        });
    });

    describe('rollback on edit', () => {
        /** Three judged turns: a Bond and a Scene advance, then an Arc and a second Bond, then a third Bond. */
        async function playThree(story: Story, chatId: number): Promise<Chat> {
            await play(
                story.id,
                chatId,
                'One.',
                'Reply one.',
                judgement({ bonds: [{ from: 'Mira', to: 'user', label: 'Curious' }], scene: { move_on: true, reason: 'She let Ash up.' } }),
            );
            await play(
                story.id,
                chatId,
                'Two.',
                'Reply two.',
                judgement({ arcs: [{ character: 'Kai', step: 'Grows loyal.' }], bonds: [{ from: 'Mira', to: 'Kai', label: 'Fond' }] }),
            );
            return play(story.id, chatId, 'Three.', 'Reply three.', judgement({ bonds: [{ from: 'Mira', to: 'user', label: 'Trusting' }] }));
        }

        it('editing a User Message rolls back every change of the discarded Messages, with counts, and judges the new reply', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const played = await playThree(story, chat.id);
            expect(played.currentScene).toEqual({ id: story.scenes[1].id, name: 'The lamp' });
            t.gateway.scriptText('turn', 'Reply two, again.');
            t.gateway.scriptText('judge', judgement({ bonds: [{ from: 'Kai', to: 'user', label: 'Amused' }] }));
            t.gateway.scriptText('memory_extraction', NO_OPS);

            const { body } = await t.http
                .patch(`/api/stories/${story.id}/chats/${chat.id}/messages/${played.messages[3].id}`)
                .send({ text: 'Two, differently.' })
                .expect(200);

            expect(body.rolledBack).toEqual({ memoryChanges: 0, bondChanges: 2, arcSteps: 1, sceneAdvances: 0 });
            expect(body.messages).toHaveLength(5);
            expect(body.currentScene).toEqual({ id: story.scenes[1].id, name: 'The lamp' });
            const settled = await awaitJudge(story.id, chat.id);
            const board = await dashboard(story.id, chat.id);
            expect(character(board, 'Mira').bonds.map((bond) => [bond.toward.name, bond.label])).toEqual([['Ash', 'Curious']]);
            expect(character(board, 'Mira').bonds[0].history.map((change) => change.label)).toEqual(['Curious', 'Wary']);
            expect(character(board, 'Kai')).toMatchObject({ arcSteps: [], bonds: [{ toward: { name: 'Ash' }, label: 'Amused' }] });
            expect(character(board, 'Kai').bonds[0].history[0].messageId).toBe(lastAi(settled).id);
            expect(board.scene).toMatchObject({ current: { name: 'The lamp' }, advance: { event: 'She let Ash up.' } });
            // The new turn's prompt saw the rolled-back state: no Arc step for Kai, no Fond, no Trusting.
            const system = systemPrompt(lastCall('turn'));
            expect(system).toContain('- Kai: Arc so far: unchanged from the core definition.');
            expect(system).not.toContain('Fond');
            expect(system).not.toContain('Trusting');
        });

        it("editing an AI Message rolls back its own changes too, re-judges the new text, and the Opening's edit judges nothing", async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const played = await playThree(story, chat.id);
            const firstReply = played.messages[2];
            t.gateway.scriptText('judge', judgement({ bonds: [{ from: 'Mira', to: 'user', label: 'Amused', cause: 'Ash slipped on the step.' }] }));
            t.gateway.scriptText('memory_extraction', NO_OPS);

            const { body } = await t.http
                .patch(`/api/stories/${story.id}/chats/${chat.id}/messages/${firstReply.id}`)
                .send({ text: 'Mira snorts.\n\n@Mira: Mind the step.' })
                .expect(200);

            expect(body.rolledBack).toEqual({ memoryChanges: 0, bondChanges: 3, arcSteps: 1, sceneAdvances: 1 });
            expect(body.messages).toHaveLength(3);
            expect(body.messages[2]).toMatchObject({ id: firstReply.id, judge: { error: null }, memory: { error: null } });
            // The fake's calls can finish before the edit answers, under a loaded full-suite run; that the
            // judge runs again on the new text is checked below by its call count and the Bond it lands.
            expect(['pending', 'done']).toContain(body.messages[2].judge.status);
            expect(['pending', 'done']).toContain(body.messages[2].memory.status);
            // Back on the first Scene: the advance this Message caused is undone.
            expect(body.currentScene).toEqual({ id: story.scenes[0].id, name: 'Arrival' });
            expect(t.gateway.textCalls('turn')).toHaveLength(3);
            const settled = await awaitJudge(story.id, chat.id);
            expect(lastAi(settled).judge).toEqual({ status: 'done', error: null });
            expect(t.gateway.textCalls('judge')).toHaveLength(4);
            expect(lastCall('judge').messages[1].content).toContain('# LATEST EXCHANGE (judge this)\nAsh: One.\n\nMira snorts.\n\n@Mira: Mind the step.');
            const board = await dashboard(story.id, chat.id);
            expect(character(board, 'Mira').bonds[0]).toMatchObject({ label: 'Amused', history: [{ event: 'Ash slipped on the step.', messageId: firstReply.id }, { label: 'Wary' }] });
            expect(board.scene).toEqual({ current: { id: story.scenes[0].id, name: 'Arrival' }, advance: null });

            // The Opening is never judged: its edit rolls back the rest and makes no call.
            t.gateway.reset();
            const opening = await t.http
                .patch(`/api/stories/${story.id}/chats/${chat.id}/messages/${played.messages[0].id}`)
                .send({ text: '@Mira: Boots off.' })
                .expect(200);
            expect(opening.body.rolledBack).toEqual({ memoryChanges: 0, bondChanges: 1, arcSteps: 0, sceneAdvances: 0 });
            expect(opening.body.messages).toHaveLength(1);
            expect(opening.body.messages[0].judge).toBeNull();
            expect(t.gateway.textCalls()).toHaveLength(0);
            expect(character(await dashboard(story.id, chat.id), 'Mira').bonds[0]).toMatchObject({ label: 'Wary', history: [{ messageId: null }] });
        });

        it('rolls back newest first: two Scene advances put the Chat back on the Scene it first left', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await play(story.id, chat.id, 'One.', 'Reply one.', judgement({ scene: { move_on: true, reason: 'Up.' } }));
            const played = await play(story.id, chat.id, 'Two.', 'Reply two.', judgement({ scene: { move_on: true, reason: 'Lit.' } }));
            expect(played.currentScene).toBeNull();
            t.gateway.scriptText('turn', 'Reply one, again.');
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);

            const { body } = await t.http
                .patch(`/api/stories/${story.id}/chats/${chat.id}/messages/${played.messages[1].id}`)
                .send({ text: 'One, differently.' })
                .expect(200);

            expect(body.rolledBack).toEqual({ memoryChanges: 0, bondChanges: 0, arcSteps: 0, sceneAdvances: 2 });
            expect(body.currentScene).toEqual({ id: story.scenes[0].id, name: 'Arrival' });
            await awaitJudge(story.id, chat.id);
            expect(systemPrompt(lastCall('turn'))).toContain('# Current Scene: Arrival');
            expect(await countRows('scene_advance', chat.id)).toBe(0);
        });
    });

    describe('reset', () => {
        it('clears the Bond history, Arc steps, Scene advances and Arc directions, then re-seeds them from the current Story', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await play(
                story.id,
                chat.id,
                'One.',
                'Reply one.',
                judgement({
                    bonds: [{ from: 'Mira', to: 'user', label: 'Curious' }],
                    arcs: [{ character: 'Kai', step: 'Grows loyal.' }],
                    scene: { move_on: true, reason: 'Up.' },
                }),
            );
            // StartingBond and Arc direction edits reach a Chat only through reset.
            await t.http
                .patch(`/api/stories/${story.id}/starting-bonds/${story.startingBonds[0].id}`)
                .send({ label: 'Hostile', description: 'She wants the keeper gone.' })
                .expect(200);
            await t.http.patch(`/api/stories/${story.id}/characters/${story.characters[1].id}`).send({ arcDirections: 'If betrayed, he hardens.' }).expect(200);
            expect(character(await dashboard(story.id, chat.id), 'Kai').arcDirection).toBe('If trusted, his cheer turns to loyalty.');

            const { body } = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/reset`).expect(200);

            expect(body.currentScene).toEqual({ id: story.scenes[0].id, name: 'Arrival' });
            const board = await dashboard(story.id, chat.id);
            expect(character(board, 'Mira').bonds).toMatchObject([
                { toward: { name: 'Ash' }, label: 'Hostile', description: 'She wants the keeper gone.', history: [{ before: null, event: null, messageId: null }] },
            ]);
            expect(character(board, 'Mira').bonds[0].history).toHaveLength(1);
            expect(character(board, 'Kai')).toMatchObject({ bonds: [], arcSteps: [], arcDirection: 'If betrayed, he hardens.' });
            expect(board.scene).toEqual({ current: { id: story.scenes[0].id, name: 'Arrival' }, advance: null });
            expect(board.background).toEqual([]);
            expect(await countRows('bond_change', chat.id)).toBe(1);
            expect(await countRows('arc_step', chat.id)).toBe(0);
            expect(await countRows('scene_advance', chat.id)).toBe(0);
            expect(await countRows('chat_arc_direction', chat.id)).toBe(1);
        });
    });

    describe('the send gate', () => {
        /** Makes judge calls hang until `release` is called; turn calls go through as scripted. */
        function slowJudge(): { release(text: string): void; restore(): void; judgeCalls: number } {
            let release: (text: string) => void = () => {};
            const result = new Promise<string>((resolve) => (release = resolve));
            const original = t.gateway.completeText.bind(t.gateway);
            const state = { release, judgeCalls: 0, restore: () => (t.gateway.completeText = original) };
            t.gateway.completeText = async (request) => {
                if (request.kind !== 'judge') return original(request);
                state.judgeCalls++;
                t.gateway.calls.push({ method: 'completeText', request });
                return { text: await result, model: FAKE_TEXT_MODEL, usage: { promptTokens: 0, completionTokens: 0 }, costUsd: 0 };
            };
            return state;
        }

        it('waits for a pending judge, then sends with the judged state in the prompt', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const judge = slowJudge();
            try {
                t.gateway.scriptText('turn', 'Reply one.');
                t.gateway.scriptText('memory_extraction', NO_OPS, NO_OPS);
                const first = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'One.' }).expect(201);
                expect(lastAi(first.body as Chat).judge).toEqual({ status: 'pending', error: null });

                t.gateway.scriptText('turn', 'Reply two.');
                const second = t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Two.' }).then((response) => response);
                await new Promise((resolve) => setTimeout(resolve, 300));
                // Still waiting: nothing stored for the second send yet.
                expect((await getChat(story.id, chat.id)).messages).toHaveLength(3);
                expect(t.gateway.textCalls('turn')).toHaveLength(1);

                judge.release(judgement({ bonds: [{ from: 'Mira', to: 'user', label: 'Curious' }], scene: { move_on: true, reason: 'Up.' } }));
                const done = await second;
                expect(done.status).toBe(201);
                expect(done.body.messages).toHaveLength(5);
                expect(done.body.messages[2].judge.status).toBe('done');
                // The second turn's prompt saw what the first judge saved, Scene included.
                const system = systemPrompt(t.gateway.textCalls('turn')[1]);
                expect(system).toContain('"Curious"');
                expect(system).toContain('# Current Scene: The lamp');
            } finally {
                judge.release(NO_CHANGE);
                judge.restore();
            }
        });

        it('tells the user the previous turn is still saving when the judge outlasts the wait, storing nothing', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const judge = slowJudge();
            try {
                t.gateway.scriptText('turn', 'Reply one.');
                t.gateway.scriptText('memory_extraction', NO_OPS);
                await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'One.' }).expect(201);

                const blocked = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Two.' }).expect(409);
                expect(blocked.body.error.code).toBe('409.004.007');
                expect((await getChat(story.id, chat.id)).messages).toHaveLength(3);
                expect(t.gateway.textCalls('turn')).toHaveLength(1);
                // So do an AI Message edit and a reset: they must not race the judge.
                const edit = await t.http.patch(`/api/stories/${story.id}/chats/${chat.id}/messages/${chat.messages[0].id}`).send({ text: 'Nope.' }).expect(409);
                expect(edit.body.error.code).toBe('409.004.007');
                expect((await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/reset`).expect(409)).body.error.code).toBe('409.004.007');
            } finally {
                judge.release(NO_CHANGE);
                judge.restore();
            }
            await awaitJudge(story.id, chat.id);
        });

        it('blocks the send while the judge failed, and Retry re-runs only the judge', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            t.gateway.scriptText('turn', 'Reply one.');
            // The try and its automatic retry (.scratch/background-retry/spec.md).
            t.gateway.scriptText('judge', new ProviderOutageError('first try'), new ProviderOutageError('DeepInfra answered 503.'));
            t.gateway.scriptText('memory_extraction', NO_OPS, NO_OPS);
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'One.' }).expect(201);
            const failed = await awaitJudge(story.id, chat.id);
            expect(lastAi(failed).judge).toEqual({ status: 'failed', error: 'DeepInfra answered 503.' });
            expect((await dashboard(story.id, chat.id)).background).toEqual([
                {
                    messageId: lastAi(failed).id,
                    position: 2,
                    judge: { status: 'failed', error: 'DeepInfra answered 503.' },
                    memory: { status: 'done', error: null },
                },
            ]);

            t.gateway.scriptText('turn', 'Reply two.');
            const blocked = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Two.' }).expect(409);
            expect(blocked.body.error.code).toBe('409.004.008');
            expect((await getChat(story.id, chat.id)).messages).toHaveLength(3);
            expect(t.gateway.textCalls('turn')).toHaveLength(1);

            // Retry runs the judge alone; no turn is written.
            t.gateway.scriptText('judge', judgement({ bonds: [{ from: 'Mira', to: 'user', label: 'Curious' }] }));
            const retried = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${lastAi(failed).id}/judge`).expect(200);
            expect(retried.body.background).toEqual([
                { messageId: lastAi(failed).id, position: 2, judge: { status: 'done', error: null }, memory: { status: 'done', error: null } },
            ]);
            expect(character(retried.body as Dashboard, 'Mira').bonds[0].label).toBe('Curious');
            expect(t.gateway.textCalls('turn')).toHaveLength(1);
            expect(t.gateway.textCalls('judge')).toHaveLength(3);
            expect(lastAi(await getChat(story.id, chat.id)).judge).toEqual({ status: 'done', error: null });

            // Retry is for a failed judge on the latest reply only.
            const notFailed = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${lastAi(failed).id}/judge`).expect(409);
            expect(notFailed.body.error.code).toBe('409.004.009');
            expect((await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/999999/judge`).expect(404)).body.error.code).toBe('404.004.006');

            // Sending works again, and the retried judgement is in the prompt.
            t.gateway.scriptText('judge', NO_CHANGE);
            const sent = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Two.' }).expect(201);
            expect(sent.body.messages).toHaveLength(5);
            expect(systemPrompt(lastCall('turn'))).toContain('"Curious"');
            await awaitJudge(story.id, chat.id);
        });

        it('marks the judge failed when its output has no JSON, keeping the reply', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);

            // The try, and its automatic retry, which goes the same way.
            t.gateway.scriptText('judge', 'Sorry, I cannot judge that.');
            const played = await play(story.id, chat.id, 'One.', 'Reply one.', 'Sorry, I cannot judge that.');

            expect(lastAi(played)).toMatchObject({
                parts: [{ kind: 'narration', text: 'Reply one.' }],
                judge: { status: 'failed', error: 'The judge wrote no JSON object.' },
            });
            expect(await countRows('bond_change', chat.id)).toBe(1);
        });

        it('a judge that fails after a User Message edit blocks the next send the same way', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const played = await play(story.id, chat.id, 'One.', 'Reply one.');
            t.gateway.scriptText('turn', 'Reply one, again.');
            t.gateway.scriptText('judge', new ProviderOutageError(), new ProviderOutageError());
            t.gateway.scriptText('memory_extraction', NO_OPS);

            await t.http.patch(`/api/stories/${story.id}/chats/${chat.id}/messages/${played.messages[1].id}`).send({ text: 'One, again.' }).expect(200);

            expect(lastAi(await awaitJudge(story.id, chat.id)).judge?.status).toBe('failed');
            const blocked = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Two.' }).expect(409);
            expect(blocked.body.error.code).toBe('409.004.008');
        });
    });

    describe('the dashboard', () => {
        it('lists the background status of recent replies newest first, and answers 404 for a Chat of another Story', async () => {
            const story = await createStory();
            const other = await createStory();
            const chat = await createChat(story.id);
            await play(story.id, chat.id, 'One.', 'Reply one.');
            const played = await play(story.id, chat.id, 'Two.', 'Reply two.');

            const board = await dashboard(story.id, chat.id);

            expect(board.background).toEqual([
                { messageId: played.messages[4].id, position: 4, judge: { status: 'done', error: null }, memory: { status: 'done', error: null } },
                { messageId: played.messages[2].id, position: 2, judge: { status: 'done', error: null }, memory: { status: 'done', error: null } },
            ]);
            expect((await t.http.get(`/api/stories/${other.id}/chats/${chat.id}/dashboard`).expect(404)).body.error.code).toBe('404.004.001');
        });

        it('deleting a Chat takes its ledger records with it', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await play(story.id, chat.id, 'One.', 'Reply one.', judgement({ bonds: [{ from: 'Mira', to: 'user', label: 'Curious' }], arcs: [{ character: 'Kai', step: 'Softens.' }], scene: { move_on: true, reason: 'Up.' } }));
            expect(await countRows('bond_change', chat.id)).toBe(2);

            await t.http.delete(`/api/stories/${story.id}/chats/${chat.id}`).expect(204);

            for (const table of ['bond_change', 'arc_step', 'scene_advance', 'chat_arc_direction', 'memory', 'memory_change']) {
                expect(await countRows(table, chat.id)).toBe(0);
            }
        });
    });
});
