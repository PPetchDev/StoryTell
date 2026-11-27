import { buildMeanwhilePrompt, meanwhileActors, MeanwhileActorsInput, meanwhilesInPlay, MeanwhilePromptInput, readMeanwhile } from '../src/manager/chat/meanwhile/meanwhile.js';
import { ChatManagerService } from '../src/manager/chat/chat.service.js';
import { buildTurnPrompt, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Meanwhile (.scratch/meanwhile/spec.md): what Characters away from the moment do on their own.
 * Pure logic first (who acts, what each is told, how the answer is read), then through HTTP with
 * the fake gateway scripted.
 */

/** Replies 1..n written by a model, each spoken by the given Character ids; position 0 is the Opening. */
function replies(speakers: number[][]): MeanwhileActorsInput['messages'] {
    return [{ position: 0, written: false, speakers: [] }, ...speakers.map((who, index) => ({ position: index + 1, written: true, speakers: who }))];
}

describe('Meanwhile: who acts (pure)', () => {
    // Mira (1) is in every reply; Kai (2) spoke only in reply 1; Lio (3) never spoke; Bo (4) spoke in reply 5;
    // Eli (5) never spoke and has no Goal; Tam (6) has no Goal and spoke in reply 1.
    const six = replies([[1, 2, 6], [1], [1], [1], [1, 4], [1]]);
    const cast = [
        { id: 1, goal: 'Light the lamp' },
        { id: 2, goal: 'Pay the harbour debt' },
        { id: 3, goal: 'Find the lost ring' },
        { id: 4, goal: 'Mend the boat' },
        { id: 5, goal: null },
        { id: 6, goal: null },
    ];
    const at = { position: 6, epilogue: false, sceneMoved: false, endingReached: false };

    it('after six replies, a Character who has been away three replies acts; one in the moment does not', () => {
        expect(meanwhileActors({ messages: six, at, cast, sittingOut: [], lastMeanwhileAt: new Map() })).toEqual([2, 3, 6]);
    });

    it('one with no Goal acts too, once the story has met them (they set their first aim as they go); one it never met does not', () => {
        const acts = meanwhileActors({ messages: six, at, cast, sittingOut: [2, 3], lastMeanwhileAt: new Map() });
        expect(acts).toContain(6);
        expect(acts).not.toContain(5);
    });

    it('is not due before six replies since their last Meanwhile, unless the Scene moved on', () => {
        const lastMeanwhileAt = new Map([
            [2, 2],
            [3, 0],
        ]);
        expect(meanwhileActors({ messages: six, at, cast, sittingOut: [], lastMeanwhileAt })).toEqual([3, 6]);
        expect(meanwhileActors({ messages: six, at: { ...at, sceneMoved: true }, cast, sittingOut: [], lastMeanwhileAt })).toEqual([3, 6, 2]);
    });

    it('never one sitting out, nobody at the Epilogue or an Ending, and at most three, those furthest behind first', () => {
        expect(meanwhileActors({ messages: six, at, cast, sittingOut: [2], lastMeanwhileAt: new Map() })).toEqual([3, 6]);
        expect(meanwhileActors({ messages: six, at: { ...at, epilogue: true }, cast, sittingOut: [], lastMeanwhileAt: new Map() })).toEqual([]);
        expect(meanwhileActors({ messages: six, at: { ...at, endingReached: true }, cast, sittingOut: [], lastMeanwhileAt: new Map() })).toEqual([]);
        const many = [6, 7, 8, 9].map((id) => ({ id, goal: 'Something' }));
        const behind = new Map([
            [6, 0],
            [7, 0],
            [8, 0],
            [9, 0],
        ]);
        behind.set(6, -Infinity);
        expect(meanwhileActors({ messages: replies([[1], [1], [1], [1], [1], [1], [1]]), at: { ...at, position: 7 }, cast: many, sittingOut: [], lastMeanwhileAt: behind })).toEqual([6, 7, 8]);
    });
});

const PROMPT: MeanwhilePromptInput = {
    setting: 'A harbour town.',
    identityName: 'Ash',
    castNames: ['Mira', 'Kai', 'Lio'],
    scene: { name: 'Arrival', situation: 'Reach the lamp room.' },
    timeOfDay: 'night',
    place: 'the lighthouse stair',
    storySoFar: 'Ash came to keep the lighthouse.',
    story: ['Mira: Boots off, keeper.', 'Ash: I climb the stair.'],
    actors: [
        {
            character: { name: 'Kai', personality: 'Proud.', voice: 'Clipped.', background: 'A ferryman in debt.' },
            nowNote: 'Kai owes the harbour master forty crowns.',
            goal: 'Pay the harbour debt',
            bonds: [{ towardName: 'Ash', label: 'Curious', description: 'He wonders about the new keeper.', levels: null }],
            beliefs: ['The harbour master cheats at dice.'],
            memories: ['Kai lost his boat at dice.'],
            innerLife: 'Kai is ashamed and means to fix it alone.',
            thought: 'I will win it back before anyone knows.',
        },
        {
            character: { name: 'Lio', personality: 'Gentle.', voice: '', background: '' },
            nowNote: null,
            goal: null,
            bonds: [],
            beliefs: [],
            memories: [],
            innerLife: null,
            thought: null,
        },
    ],
};

describe('Meanwhile: what the actors are told (pure)', () => {
    it('tells each actor only their own, the moment they are away from, and the rules of one small step', () => {
        const prompt = buildMeanwhilePrompt(PROMPT);
        const [system, user] = prompt.messages.map((message) => message.content);
        expect(prompt.messages.map((message) => message.role)).toEqual(['system', 'user']);
        expect(system).toContain('Everyone in the story is an adult.');
        expect(system).toContain('Setting: A harbour town.');
        expect(system).toContain(
            '<character name="Kai">\nPersonality: Proud.\nVoice (how Kai talks): Clipped.\nBackground: A ferryman in debt.\nChanged in this story: Kai owes the harbour master forty crowns.\nWhat Kai is after now: Pay the harbour debt',
        );
        expect(system).toContain('- toward Ash: "Curious" — He wonders about the new keeper.');
        expect(system).toContain('What Kai believes, which may be false:\n- The harbour master cheats at dice.');
        expect(system).toContain('What Kai knows of the story (what is not here, Kai does not know):\n- Kai lost his boat at dice.');
        expect(system).toContain('What Kai keeps to themselves lately: Kai is ashamed and means to fix it alone.');
        expect(system).toContain("Kai's latest thought: I will win it back before anyone knows.");
        expect(system).toContain(
            '<character name="Lio">\nPersonality: Gentle.\nWhat Lio is after now: nothing yet. First decide, from who Lio is and the story so far, one short aim from their side, and give it as "goal".\n</character>',
        );
        expect(system).toContain('Each character knows only what is in their own block.');
        expect(user).toContain('Story so far: Ash came to keep the lighthouse.');
        expect(user).toContain('Where the story is, away from them: Scene: Arrival (Reach the lamp room.). Time: night. Place: the lighthouse stair.');
        expect(user).toContain('<story>\nMira: Boots off, keeper.\n\nAsh: I climb the stair.\n</story>');
        expect(user).toContain('Kai and Lio are away from this moment.');
        expect(user).toContain('one small, concrete step toward what they are after');
        expect(user).toContain('starting with their name ("Kai sold the nets…")');
        expect(user).toContain('Never with or to Ash, Mira, Kai or Lio');
        expect(user).toContain('{"meanwhile":[{"character":"Name","did":"...","goal":null}]}');
        expect(prompt.maxTokens).toBe(300);
    });
});

describe('Meanwhile: reading the answer (pure)', () => {
    const actors = ['Kai', 'Lio'];

    it('reads each actor once: what they did, and their Goal kept (null), ended ("") or replaced', () => {
        const text = '```json\n{"meanwhile":[{"character":"Kai","did":"  Kai won back ten crowns at dice in the Anchor tavern; he is there now. ","goal":null},{"character":"lio","did":"Lio searched the tide pools and found the ring; she is on the shore.","goal":""},{"character":"Kai","did":"Again.","goal":null}]}\n```';
        expect(readMeanwhile(text, actors, 'Ash')).toEqual([
            { character: 'Kai', did: 'Kai won back ten crowns at dice in the Anchor tavern; he is there now.', goal: null },
            { character: 'Lio', did: 'Lio searched the tide pools and found the ring; she is on the shore.', goal: '' },
        ]);
        expect(readMeanwhile('{"meanwhile":[{"character":"Kai","did":"Kai sold his nets.","goal":"Buy passage north"}]}', actors, 'Ash')).toEqual([
            { character: 'Kai', did: 'Kai sold his nets.', goal: 'Buy passage north' },
        ]);
    });

    it('drops one who is not an actor, one with nothing done, and one that names the Role; cuts a long line at a word', () => {
        const long = `Kai ${'walked the whole harbour wall '.repeat(20)}`;
        const read = readMeanwhile(
            JSON.stringify({
                meanwhile: [
                    { character: 'Mira', did: 'Mira lit the lamp.', goal: null },
                    { character: 'Lio', did: '   ', goal: null },
                    { character: 'Lio', did: 'Lio waited for Ash at the gate.', goal: null },
                    { character: 'Kai', did: long, goal: 7 },
                ],
            }),
            actors,
            'Ash',
        );
        expect(read).toHaveLength(1);
        expect(read![0].character).toBe('Kai');
        expect(read![0].goal).toBeNull();
        expect(read![0].did.length).toBeLessThanOrEqual(401);
        expect(read![0].did.endsWith('wall…')).toBe(true);
    });

    it('names who did it when the line opens with a pronoun, as the Memory it becomes is read without them (seen on a real model)', () => {
        const text = JSON.stringify({
            meanwhile: [
                { character: 'Kai', did: 'She wandered to the edge of camp and traded a coil of rope.', goal: null },
                { character: 'Lio', did: 'they sat on the bank to watch a heron fish.', goal: null },
            ],
        });
        expect(readMeanwhile(text, actors, 'Ash')!.map((entry) => entry.did)).toEqual([
            'Kai wandered to the edge of camp and traded a coil of rope.',
            'Lio sat on the bank to watch a heron fish.',
        ]);
    });

    it('is null when there is no JSON to read', () => {
        expect(readMeanwhile('Kai went fishing.', actors, 'Ash')).toBeNull();
        expect(readMeanwhile('{"meanwhile": oops}', actors, 'Ash')).toBeNull();
    });
});

describe('Meanwhile: what the Narrator is told (pure)', () => {
    // Messages 1..25 at positions 1..25, all written by a model, Mira speaking in each; position 0 the Opening.
    const messages = [
        { id: 100, position: 0, written: false, speakers: [] as number[] },
        ...Array.from({ length: 25 }, (_, index) => ({ id: index + 1, position: index + 1, written: true, speakers: [1] })),
    ];
    const cast = [
        { id: 1, name: 'Mira' },
        { id: 2, name: 'Kai' },
        { id: 3, name: 'Lio' },
        { id: 4, name: 'Bo' },
    ];

    it("gives each Character's newest Meanwhile of the last twenty replies, only for those not in the latest exchange, freshest first", () => {
        const entries = [
            { characterId: 2, messageId: 10, text: 'Kai sold his nets.' },
            { characterId: 2, messageId: 20, text: 'Kai paid the debt.' },
            { characterId: 3, messageId: 24, text: 'Lio found the ring.' },
            { characterId: 4, messageId: 3, text: 'Bo left town.' },
            { characterId: 1, messageId: 25, text: 'Mira lit the lamp.' },
        ];
        expect(meanwhilesInPlay({ entries, messages, cast, present: ['Mira'] })).toEqual([
            { characterName: 'Lio', text: 'Lio found the ring.' },
            { characterName: 'Kai', text: 'Kai paid the debt.' },
        ]);
        expect(meanwhilesInPlay({ entries: [], messages, cast, present: [] })).toEqual([]);
    });

    it('leaves out one whose Character has spoken since: back in the moment, they have it only as their Memory', () => {
        const kaiBack = messages.map((message) => (message.position === 22 ? { ...message, speakers: [1, 2] } : message));
        const entries = [
            { characterId: 2, messageId: 20, text: 'Kai paid the debt.' },
            { characterId: 3, messageId: 21, text: 'Lio found the ring.' },
        ];
        expect(meanwhilesInPlay({ entries, messages: kaiBack, cast, present: ['Mira'] })).toEqual([{ characterName: 'Lio', text: 'Lio found the ring.' }]);
    });

    it('tells the Narrator after "Where things stand" that it happened and only they know it, and leaves the prompt as it was without any', () => {
        const input: TurnPromptInput = {
            story: {
                setting: 'A lighthouse.',
                pov: Pov.First,
                tense: Tense.Present,
                replyLength: ReplyLength.Medium,
                characters: [{ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.', exampleLines: [], background: '', secrets: '' }],
            },
            identity: { name: 'Ash', description: 'The new keeper.' },
            scene: null,
            bonds: [],
            arcs: [],
            memories: [],
            history: [{ role: 'assistant', text: '@Mira: Late.' }],
            userText: 'I knock.',
        };
        expect(buildTurnPrompt({ ...input, meanwhiles: [] })).toEqual(buildTurnPrompt(input));
        const trailing = buildTurnPrompt({ ...input, meanwhiles: [{ characterName: 'Kai', text: 'Kai paid the debt; he is at the quay.' }] }).messages.at(-1)!.content;
        expect(trailing).toContain(
            'Meanwhile, away from the moment (this has happened; only that Character knows it unless the story has shown it):\n- Kai: Kai paid the debt; he is at the quay.\nWhen one of them comes back, let it shape where they come from, how they act and what they say, without retelling it.',
        );
        expect(trailing.indexOf('Where things stand')).toBeLessThan(trailing.indexOf('Meanwhile, away'));
        expect(trailing.indexOf('Meanwhile, away')).toBeLessThan(trailing.indexOf('Write the next turn now.'));
    });
});

interface Message {
    id: number;
    kind: 'user' | 'ai';
    judge?: { status: string } | null;
    memory?: { status: string } | null;
    meanwhile: { characterId: number; characterName: string; text: string }[];
}

interface Chat {
    id: number;
    charactersLive: boolean;
    goals: { characterId: number; goal: string }[];
    messages: Message[];
}

interface Memory {
    id: number;
    text: string;
    knownBy: number[];
}

const NO_OPS = '{"operations":[]}';

function judgement(extra: Record<string, unknown> = {}): string {
    return JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' }, ...extra });
}

const KAI_DID = 'Kai won back ten crowns at dice in the Anchor tavern; he is there now.';

describe('Meanwhile: written, read, taken back (HTTP)', () => {
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

    async function createStory(): Promise<{ storyId: number; mira: number; kai: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A harbour town.', opening: '@Mira: Boots off, keeper.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const first = await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.', secrets: 'She put the lamp out herself.' })
            .expect(201);
        const second = await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Kai', appearance: 'Wiry.', personality: 'Proud.', voice: 'Clipped.', secrets: 'He sank the ferry for the insurance.' })
            .expect(201);
        return { storyId, mira: first.body.characters[0].id as number, kai: second.body.characters[1].id as number };
    }

    const chatPath = (storyId: number, chatId: number) => `/api/stories/${storyId}/chats/${chatId}`;

    async function getChat(storyId: number, chatId: number): Promise<Chat> {
        return (await t.http.get(chatPath(storyId, chatId)).expect(200)).body as Chat;
    }

    async function settled(storyId: number, chatId: number): Promise<Chat> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = await getChat(storyId, chatId);
            const last = chat.messages.at(-1)!;
            if (last.judge?.status !== 'pending' && last.memory?.status !== 'pending') return chat;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    async function play(storyId: number, chatId: number, reply: string, judge: string = judgement()): Promise<Chat> {
        t.gateway.scriptText('turn', { text: reply, model: 'glm-5.3' });
        t.gateway.scriptText('judge', judge);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`${chatPath(storyId, chatId)}/messages`).send({ text: 'I climb the stair.' }).expect(201);
        await settled(storyId, chatId);
        await t.app.get(ChatManagerService).backgroundIdle(chatId);
        return getChat(storyId, chatId);
    }

    async function memories(storyId: number, chatId: number): Promise<Memory[]> {
        return (await t.http.get(`${chatPath(storyId, chatId)}/memories`).expect(200)).body.memories as Memory[];
    }

    /** Reply 1: Kai speaks and the Judge gives him a Goal; replies 2 to 5: only Mira. Kai is then away, and the sixth reply is due. */
    async function kaiGoesAway(storyId: number, chatId: number): Promise<void> {
        await play(storyId, chatId, '@Kai: I owe the harbour master. I am off.', judgement({ details: { place: 'same', goals: [{ character: 'Kai', goal: 'Pay the harbour debt' }] } }));
        for (let n = 2; n <= 5; n++) await play(storyId, chatId, `@Mira: Step ${n}.`);
        expect(t.gateway.textCalls('meanwhile')).toHaveLength(0);
    }

    it('after six replies, a Character away with a Goal takes a step on their own: a Memory only they know, their Goal moved, shown under the reply', async () => {
        const { storyId, kai } = await createStory();
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
        expect(chat.charactersLive).toBe(true);
        await kaiGoesAway(storyId, chat.id);

        t.gateway.scriptText('meanwhile', JSON.stringify({ meanwhile: [{ character: 'Kai', did: KAI_DID, goal: 'Win back his boat' }] }));
        const after = await play(storyId, chat.id, '@Mira: Step 6.');

        const calls = t.gateway.textCalls('meanwhile');
        expect(calls).toHaveLength(1);
        const [system, user] = calls[0].messages.map((message) => message.content);
        expect(system).toContain('<character name="Kai">');
        expect(system).toContain('What Kai is after now: Pay the harbour debt');
        expect(system).not.toContain('<character name="Mira">');
        expect(system + user).not.toContain('sank the ferry');
        expect(system + user).not.toContain('put the lamp out');

        expect(after.messages.at(-1)!.meanwhile).toEqual([{ characterId: kai, characterName: 'Kai', text: KAI_DID }]);
        expect(after.messages.slice(0, -1).every((message) => message.meanwhile.length === 0)).toBe(true);
        expect(after.goals).toContainEqual({ characterId: kai, goal: 'Win back his boat' });
        expect((await memories(storyId, chat.id)).filter((memory) => memory.text === KAI_DID)).toMatchObject([{ knownBy: [kai] }]);

        // The next reply is not due again: one Meanwhile per six replies. The Narrator writing it is told what Kai did.
        await play(storyId, chat.id, '@Mira: Step 7.');
        expect(t.gateway.textCalls('meanwhile')).toHaveLength(1);
        expect(t.gateway.textCalls('turn').at(-1)!.messages.at(-1)!.content).toContain(`Meanwhile, away from the moment (this has happened; only that Character knows it unless the story has shown it):\n- Kai: ${KAI_DID}`);

        // Once Kai is back in the moment, he has it only as his Memory.
        await play(storyId, chat.id, '@Kai: I am back.');
        await play(storyId, chat.id, '@Mira: Welcome back.');
        expect(t.gateway.textCalls('turn').at(-1)!.messages.at(-1)!.content).not.toContain('Meanwhile, away from the moment');
    });

    it('taking the reply back takes it all back; a Branch copies it; Reset clears it; the switch turns it off; a failed call stores nothing', async () => {
        const { storyId, kai } = await createStory();
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
        await kaiGoesAway(storyId, chat.id);
        t.gateway.scriptText('meanwhile', JSON.stringify({ meanwhile: [{ character: 'Kai', did: KAI_DID, goal: 'Win back his boat' }] }));
        const sixth = (await play(storyId, chat.id, '@Mira: Step 6.')).messages.at(-1)!;

        // A Branch from the sixth reply copies the Meanwhile and its Memory.
        const { body: branch } = await t.http.post(`${chatPath(storyId, chat.id)}/messages/${sixth.id}/branch`).expect(201);
        expect(branch.charactersLive).toBe(true);
        expect((await getChat(storyId, branch.id)).messages.at(-1)!.meanwhile).toEqual([{ characterId: kai, characterName: 'Kai', text: KAI_DID }]);
        expect((await memories(storyId, branch.id)).map((memory) => memory.text)).toContain(KAI_DID);

        // Regenerate the sixth reply: what Kai did goes with it, and his Goal is as it was. Nothing scripted for the new run: it fails, nothing is kept.
        t.gateway.scriptText('turn', { text: '@Mira: Step six, again.', model: 'glm-5.3' });
        t.gateway.scriptText('judge', judgement());
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`${chatPath(storyId, chat.id)}/messages/${sixth.id}/regenerate`).expect(200);
        await settled(storyId, chat.id);
        await t.app.get(ChatManagerService).backgroundIdle(chat.id);
        const regenerated = await getChat(storyId, chat.id);
        expect(regenerated.messages.every((message) => message.meanwhile.length === 0)).toBe(true);
        expect(regenerated.goals).toContainEqual({ characterId: kai, goal: 'Pay the harbour debt' });
        expect((await memories(storyId, chat.id)).map((memory) => memory.text)).not.toContain(KAI_DID);
        expect(t.gateway.textCalls('meanwhile')).toHaveLength(2);

        // Reset clears the branch's, and keeps its switch.
        await t.http.post(`${chatPath(storyId, branch.id)}/reset`).expect(200);
        const reset = await getChat(storyId, branch.id);
        expect(reset.charactersLive).toBe(true);
        expect(reset.messages.every((message) => message.meanwhile.length === 0)).toBe(true);

        // Off: no Meanwhile however long Kai is away.
        const off = await t.http.patch(chatPath(storyId, chat.id)).send({ charactersLive: false }).expect(200);
        expect(off.body.charactersLive).toBe(false);
        await t.http.patch(chatPath(storyId, chat.id)).send({ charactersLive: 'yes' }).expect(400);
        for (let n = 7; n <= 13; n++) await play(storyId, chat.id, `@Mira: Step ${n}.`);
        expect(t.gateway.textCalls('meanwhile')).toHaveLength(2);
    });
});
