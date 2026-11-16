import { buildThoughtPrompt, readThought, THOUGHT_MAX, ThoughtPromptInput, thinkers } from '../src/manager/chat/thoughts/thoughts.js';
import { buildTurnPrompt, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { ChatManagerService } from '../src/manager/chat/chat.service.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Character minds (.scratch/character-minds/spec.md): Thoughts as pure logic (who thinks, what
 * each is told, how the answer is read, where the Narrator reads them), then through HTTP with the
 * fake gateway scripted. Goals are tested with the other details in details.spec.ts.
 */

const CAST = [
    { id: 1, name: 'Mira' },
    { id: 2, name: 'Kai' },
    { id: 3, name: 'Lio' },
    { id: 4, name: 'Bo' },
    { id: 5, name: 'Eli' },
];

const INPUT: ThoughtPromptInput = {
    character: { name: 'Mira', personality: 'Guarded.', voice: 'Short sentences.', background: 'Ten years on the rock.' },
    identityName: 'Ash',
    identityDescription: 'The new keeper.',
    setting: 'A lighthouse.',
    scene: { name: 'Arrival', situation: 'Reach the lamp room.' },
    timeOfDay: 'night',
    place: 'the stair',
    goal: 'Get the lamp lit before the ship passes',
    bonds: [{ towardName: 'Ash', label: 'Wary', description: 'She expects Ash to leave.', levels: null }],
    beliefs: ['Ash was sent by the harbour board.'],
    memories: ['Ash carried the oil up alone.'],
    innerLife: 'Mira is warming to Ash and means not to show it.',
    story: ['Mira: Boots off, keeper.', 'Ash: I climb the stair.'],
    userText: 'I hand her the oil.',
};

describe('Thoughts: who thinks, what they are told, how it is read (pure)', () => {
    it('the nudged Character first, then those in the latest exchange, never one sitting out, at most four', () => {
        expect(thinkers({ cast: CAST, present: ['Kai', 'Mira'], nudge: null, sittingOut: [] }).map((member) => member.name)).toEqual(['Kai', 'Mira']);
        expect(thinkers({ cast: CAST, present: ['Kai', 'Mira'], nudge: 'Lio', sittingOut: [] }).map((member) => member.name)).toEqual(['Lio', 'Kai', 'Mira']);
        expect(thinkers({ cast: CAST, present: ['Kai', 'Mira', 'Lio', 'Bo', 'Eli'], nudge: null, sittingOut: [] }).map((member) => member.name)).toEqual(['Kai', 'Mira', 'Lio', 'Bo']);
        expect(thinkers({ cast: CAST, present: ['Kai', 'Mira', 'Nobody', 'Kai'], nudge: null, sittingOut: [2] }).map((member) => member.name)).toEqual(['Mira']);
        expect(thinkers({ cast: CAST, present: [], nudge: null, sittingOut: [] })).toEqual([]);
    });

    it('tells a thinker who they are, what they want, feel, believe and know, the moment, and to decide nothing for anyone', () => {
        const prompt = buildThoughtPrompt(INPUT);
        const [system, user] = prompt.messages.map((message) => message.content);
        expect(prompt.messages.map((message) => message.role)).toEqual(['system', 'user']);
        expect(system).toContain('Every character is an adult.');
        expect(system).toContain('The character is Mira.\nPersonality: Guarded.\nVoice (how Mira talks): Short sentences.\nBackground: Ten years on the rock.\nWhat Mira is after now: Get the lamp lit before the ship passes');
        expect(system).toContain('- toward Ash: "Wary" — She expects Ash to leave.');
        expect(system).toContain('What Mira keeps to themselves lately: Mira is warming to Ash and means not to show it.');
        expect(system).toContain('What Mira believes, which may be false (Mira does not doubt it):\n- Ash was sent by the harbour board.');
        expect(system).toContain('What Mira knows of the story so far (what is not here, Mira does not know):\n- Ash carried the oil up alone.');
        expect(system).toContain('Ash is the person the user plays. Who Ash is: The new keeper.');
        expect(user).toContain('Where things are: Scene: Arrival (Reach the lamp room.). Time: night. Place: the stair.');
        expect(user).toContain('<story>\nMira: Boots off, keeper.\n\nAsh: I climb the stair.\n</story>');
        expect(user).toContain('What Ash just said or did:\nAsh: I hand her the oil.');
        expect(user).toContain('As Mira, in the first person and in Mira\'s own voice, in one or two sentences of no more than about 35 words: how you feel about this moment and what you mean to do next.');
        expect(user).toContain("- Say what you feel and mean to do. Don't draft your line, and don't describe your own movements: the story tells those.");
        expect(prompt.maxTokens).toBe(120);
        expect(user).toContain('Decide nothing for Ash or anyone else; nothing happens in a thought.');
        expect(user).toContain("Never guess Ash's gender");
        expect(user.endsWith('Answer with only the thought.')).toBe(true);
    });

    it('says nothing of what a thinker does not have', () => {
        const bare = buildThoughtPrompt({ ...INPUT, goal: null, bonds: [], beliefs: [], memories: [], innerLife: null, scene: null, timeOfDay: null, place: null, userText: null, identityDescription: ' ' });
        const [system, user] = bare.messages.map((message) => message.content);
        for (const missing of ['What Mira is after', 'feels right now', 'keeps to themselves', 'believes', 'knows of the story', 'Who Ash is']) expect(system).not.toContain(missing);
        expect(user).not.toContain('Where things are');
        expect(user).not.toContain('just said or did');
    });

    it('reads a thought without a label, quotes or a fence, on one line, cut at a word; nothing is null', () => {
        expect(readThought('  Mira: I want the lamp lit.\nNow.  ', 'Mira')).toBe('I want the lamp lit. Now.');
        expect(readThought('"I want the lamp lit."', 'Mira')).toBe('I want the lamp lit.');
        expect(readThought('**Mira:** *I want the lamp lit.*', 'Mira')).toBe('I want the lamp lit.');
        expect(readThought('```\nI want the lamp lit.\n```', 'Mira')).toBe('I want the lamp lit.');
        expect(readThought('word '.repeat(200), 'Mira')!.length).toBeLessThanOrEqual(THOUGHT_MAX + 1);
        expect(readThought('  ', 'Mira')).toBeNull();
    });

    it('gives the Narrator the Thoughts after "Where things stand", and leaves the prompt as it was without any', () => {
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
        expect(buildTurnPrompt({ ...input, thoughts: [] })).toEqual(buildTurnPrompt(input));
        const trailing = buildTurnPrompt({ ...input, thoughts: [{ characterName: 'Mira', text: 'I want the lamp lit before the ship passes.' }] }).messages.at(-1)!.content;
        expect(trailing).toContain(
            'What the Characters are thinking right now, each knowing only what they know:\n- Mira: I want the lamp lit before the ship passes.\nLet each speak and act from their own thought, in their own way, as far as the moment allows; you decide what actually happens. A thought is private: nobody else hears it, and nothing in it has happened.',
        );
        expect(trailing.indexOf('Where things stand')).toBeLessThan(trailing.indexOf('What the Characters are thinking'));
        expect(trailing.indexOf('What the Characters are thinking')).toBeLessThan(trailing.indexOf('Write the next turn now.'));
    });
});

interface Thought {
    characterId: number;
    characterName: string;
    text: string;
}

interface Chat {
    id: number;
    characterThoughts: boolean;
    messages: Array<{ id: number; kind: 'user' | 'ai'; judge?: { status: string } | null; memory?: { status: string } | null; thoughts?: Thought[] }>;
}

const NO_OPS = '{"operations":[]}';
const NO_CHANGE = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' } });

describe('Thoughts: the turn (HTTP)', () => {
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
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse.', opening: '@Mira: Boots off, keeper.\n\n@Kai: Welcome!' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const first = await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.', secrets: 'She put the lamp out herself.' })
            .expect(201);
        const second = await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Kai', appearance: 'Wiry.', personality: 'Restless.', voice: 'Quick.' }).expect(201);
        return { storyId, mira: first.body.characters[0].id as number, kai: second.body.characters[1].id as number };
    }

    const chatPath = (storyId: number, chatId: number) => `/api/stories/${storyId}/chats/${chatId}`;

    async function settled(storyId: number, chatId: number): Promise<Chat> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = (await t.http.get(chatPath(storyId, chatId)).expect(200)).body as Chat;
            const last = chat.messages.at(-1)!;
            if (last.judge?.status !== 'pending' && last.memory?.status !== 'pending') return chat;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    async function play(storyId: number, chatId: number, text: string, thoughts: string[], reply = '@Mira: Fine.\n\n@Kai: Great!'): Promise<Chat> {
        for (const thought of thoughts) t.gateway.scriptText('character_thought', thought);
        t.gateway.scriptText('turn', { text: reply, model: 'glm-5.3' });
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`${chatPath(storyId, chatId)}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    it('each Character in the moment thinks from only what they know; the Narrator reads the Thoughts, and the reply keeps them', async () => {
        const { storyId, mira, kai } = await createStory();
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
        expect(chat.characterThoughts).toBe(true);
        // A Memory only Mira knows.
        await t.http.post(`${chatPath(storyId, chat.id)}/memories`).send({ text: '{user} carried the oil up alone.', knownBy: [mira] }).expect(201);

        const played = await play(storyId, chat.id, 'I climb the stair.', ['Mira: I want this keeper gone by spring.', 'The new one seems fun!']);
        const calls = t.gateway.textCalls('character_thought');
        expect(calls).toHaveLength(2);
        const byName = (name: string) => calls.find((call) => call.messages[0].content.includes(`The character is ${name}.`))!;
        const miraCall = byName('Mira').messages.map((message) => message.content).join('\n');
        const kaiCall = byName('Kai').messages.map((message) => message.content).join('\n');
        expect(miraCall).toContain('- Ash carried the oil up alone.');
        expect(kaiCall).not.toContain('carried the oil');
        // Never the Secrets: a Thought can be read.
        expect(`${miraCall}\n${kaiCall}`).not.toContain('put the lamp out');
        expect(miraCall).toContain('What Ash just said or did:\nAsh: I climb the stair.');

        // The reply's prompt read each Thought, by the name of who thought it.
        const turn = t.gateway.textCalls('turn').at(-1)!;
        const trailing = turn.messages.at(-1)!.content;
        expect(trailing).toContain('What the Characters are thinking right now, each knowing only what they know:');
        const thoughtOf = (id: number) => played.messages.at(-1)!.thoughts!.find((thought) => thought.characterId === id)!;
        expect(trailing).toContain(`- Mira: ${thoughtOf(mira).text}`);
        expect(trailing).toContain(`- Kai: ${thoughtOf(kai).text}`);
        // Kept with the reply, read without a label.
        expect(played.messages.at(-1)!.thoughts!.map((thought) => thought.characterName).sort()).toEqual(['Kai', 'Mira']);
        expect([thoughtOf(mira).text, thoughtOf(kai).text].sort()).toEqual(['I want this keeper gone by spring.', 'The new one seems fun!']);
        // The Judge and the extraction never read them.
        for (const kind of ['judge', 'memory_extraction'] as const) expect(JSON.stringify(t.gateway.textCalls(kind).at(-1)!.messages)).not.toContain('gone by spring');
    });

    it('a Thought that fails is dropped and the reply is written; the setting turns them off; Regenerate thinks again; a Branch copies them', async () => {
        const { storyId } = await createStory();
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
        const idle = () => t.app.get(ChatManagerService).backgroundIdle(chat.id);

        // Only one scripted: the other call fails, and the reply goes on with one Thought.
        const one = await play(storyId, chat.id, 'Hello.', ['I am tired.']);
        expect(one.messages.at(-1)!.kind).toBe('ai');
        expect(one.messages.at(-1)!.thoughts).toHaveLength(1);

        // Regenerate thinks again and keeps only the new Thoughts.
        t.gateway.scriptText('character_thought', 'Again, then.');
        t.gateway.scriptText('character_thought', 'Me too.');
        t.gateway.scriptText('turn', { text: '@Mira: Again.\n\n@Kai: Yes!', model: 'glm-5.3' });
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`${chatPath(storyId, chat.id)}/messages/${one.messages.at(-1)!.id}/regenerate`).expect(200);
        const again = await settled(storyId, chat.id);
        expect(again.messages.at(-1)!.thoughts!.map((thought) => thought.text).sort()).toEqual(['Again, then.', 'Me too.']);
        await idle();

        // A Branch carries them.
        const { body: branch } = await t.http.post(`${chatPath(storyId, chat.id)}/messages/${again.messages.at(-1)!.id}/branch`).expect(201);
        expect(((branch as Chat).messages.at(-1)!.thoughts ?? []).map((thought) => thought.text).sort()).toEqual(['Again, then.', 'Me too.']);

        // Off: nobody is asked, and the reply has none.
        const off = await t.http.patch(chatPath(storyId, chat.id)).send({ characterThoughts: false }).expect(200);
        expect(off.body.characterThoughts).toBe(false);
        const calls = t.gateway.textCalls('character_thought').length;
        const quiet = await play(storyId, chat.id, 'Quiet now.', []);
        expect(t.gateway.textCalls('character_thought')).toHaveLength(calls);
        expect(quiet.messages.at(-1)!.thoughts).toEqual([]);
        expect(t.gateway.textCalls('turn').at(-1)!.messages.at(-1)!.content).not.toContain('What the Characters are thinking');
        await t.http.patch(chatPath(storyId, chat.id)).send({ characterThoughts: 'yes' }).expect(400);
    });
});
