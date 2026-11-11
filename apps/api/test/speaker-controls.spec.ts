import { AddressInfo } from 'node:net';
import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { STORY_SO_FAR_TRIGGER_MARGIN, storySoFarCoverage } from '../src/manager/chat/story-so-far/story-so-far-prompt.js';

import { buildSuggestionsPrompt } from '../src/manager/chat/suggestions/suggestions-prompt.js';
import { memoryLine } from '../src/manager/chat/memory/memory-prompt.js';
import { buildTurnPrompt, estimateTokens, nudgeLine, PromptLayersInput, PromptMemory, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { parseReply } from '../src/manager/chat/turn/reply-parser.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Speaker controls (.scratch/speaker-controls/spec.md), Sitting out: a Character kept out of one
 * Chat's turns until the user brings them back. The pure prompt and parser first, then through
 * the HTTP API with the fake gateway scripted.
 */

const SENTENCE = "They take no part in the story for now: don't write their words or actions, and don't bring them into the scene.";

function layers(overrides: Partial<PromptLayersInput> = {}): PromptLayersInput {
    return {
        story: {
            setting: 'A lighthouse.',
            pov: Pov.Second,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [
                { name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.', exampleLines: [], background: '', secrets: '' },
                { name: 'Kai', appearance: 'Wiry.', personality: 'Restless.', voice: 'Quick.', exampleLines: [], background: '', secrets: '' },
            ],
        },
        identity: { name: 'Ash', description: 'The keeper.' },
        scene: null,
        bonds: [],
        arcs: [],
        memories: [],
        ...overrides,
    };
}

function input(overrides: Partial<TurnPromptInput> = {}): TurnPromptInput {
    return {
        ...layers(),
        history: [{ role: 'assistant', text: '@Mira: The lamp is out.\n\n@Kai: I can fix it.' }],
        userText: 'I climb to the lamp.',
        present: ['Mira', 'Kai'],
        ...overrides,
    };
}

const trailingOf = (prompt: { messages: Array<{ content: string }> }) => prompt.messages.at(-1)!.content;

describe('Sitting out: the turn prompt (pure)', () => {
    it('names them in "Where things stand" and leaves them out of "In the latest exchange"', () => {
        const trailing = trailingOf(buildTurnPrompt(input({ sittingOut: ['Mira'] })));
        expect(trailing).toContain(`In the latest exchange: Kai. Sitting out: Mira. ${SENTENCE}`);
        expect(trailing).not.toContain('In the latest exchange: Mira');
        expect(trailing.indexOf('Where things stand:')).toBeLessThan(trailing.indexOf('Sitting out: Mira.'));
        expect(trailing.indexOf('Sitting out: Mira.')).toBeLessThan(trailing.indexOf('Write the next turn now.'));
    });

    it('names everyone sitting out, in the order given, and leaves the exchange line out when nobody else is in it', () => {
        const trailing = trailingOf(buildTurnPrompt(input({ sittingOut: ['Mira', 'Kai'] })));
        expect(trailing).toContain(`Sitting out: Mira, Kai. ${SENTENCE}`);
        expect(trailing).not.toContain('In the latest exchange');
    });

    it('changes nothing when nobody is sitting out', () => {
        const today = buildTurnPrompt(input());
        expect(buildTurnPrompt(input({ sittingOut: [] }))).toEqual(today);
        expect(trailingOf(today)).toContain('In the latest exchange: Mira, Kai.');
        expect(trailingOf(today)).not.toContain('Sitting out');
    });

    it('leaves the system message, cast cards and name list included, the same with and without someone sitting out', () => {
        const without = buildTurnPrompt(input());
        const withMira = buildTurnPrompt(input({ sittingOut: ['Mira'] }));
        expect(withMira.messages.slice(0, -1)).toEqual(without.messages.slice(0, -1));
        expect(withMira.messages[0].content).toContain('## Mira');
        expect(withMira.messages[0].content).toContain('using exactly these names: Mira, Kai');
    });

    it('leaves out the same Memories above the Memory cap: the Memory layer still reads the exchange with them in it', () => {
        // Same-length Memories, so a cap of two lines fits two. The oldest is about Mira.
        const memory = (text: string): PromptMemory => ({ text: text.padEnd(60, '.'), knownBy: ['Kai'], locked: false });
        const memories = [memory('Mira hid the logbook'), memory('The tide came in'), memory('The gulls left')];
        const cap = estimateTokens([memoryLine(memories[0]), memoryLine(memories[0])].join('\n'));
        const base = input({ memories, memoryCapTokens: cap, present: ['Mira'] });
        const without = buildTurnPrompt(base);
        const withMira = buildTurnPrompt({ ...base, sittingOut: ['Mira'] });
        expect(without.memoriesLeftOut).toBe(1);
        // Mira's Memory is kept because she was in the exchange; sitting out must not change that.
        expect(without.messages[0].content).toContain('Mira hid the logbook');
        expect(withMira.messages[0]).toEqual(without.messages[0]);
        expect(withMira.memoriesLeftOut).toBe(1);
    });
});

describe('Sitting out: Suggested replies (pure)', () => {
    it('ask for no option that addresses them; nothing changes when nobody sits out', () => {
        const history = [{ role: 'assistant' as const, text: '@Mira: The lamp is out.' }];
        const today = buildSuggestionsPrompt({ ...layers(), history });
        expect(buildSuggestionsPrompt({ ...layers({ sittingOut: [] }), history })).toEqual(today);
        const away = buildSuggestionsPrompt({ ...layers({ sittingOut: ['Mira'] }), history });
        const closing = away.messages.at(-1)!.content;
        expect(closing).toContain('No option may speak to, call for or involve anyone sitting out, who takes no part in the story for now: Mira.');
        expect(closing.indexOf('No option may')).toBeLessThan(closing.indexOf('Answer with only this JSON'));
        expect(away.messages.slice(0, -1)).toEqual(today.messages.slice(0, -1));
    });
});

describe('Sitting out: the reply parser (pure)', () => {
    const cast = [
        { id: 1, name: 'Mira' },
        { id: 2, name: 'Kai' },
    ];
    const reply = `Mira turns from the window.

@Mira: Leave me be.
I mean it.

@kai: She means it.
@MIRA: Go.

Kai shrugs at Mira.`;

    it('drops their speech lines and the lines continuing them, keeps narration that names them, and reports them', () => {
        const parsed = parseReply(reply, cast, 'Ash', { sittingOut: [1] });
        expect(parsed.parts).toEqual([
            { kind: 'narration', text: 'Mira turns from the window.' },
            { kind: 'speech', characterId: 2, speakerName: 'Kai', text: 'She means it.' },
            { kind: 'narration', text: 'Kai shrugs at Mira.' },
        ]);
        expect(parsed.droppedSpeakers).toEqual(['Mira']);
    });

    it('drops nothing with the guard off, or with nobody sitting out', () => {
        const all = parseReply(reply, cast, 'Ash');
        expect(parseReply(reply, cast, 'Ash', { guard: false, sittingOut: [1] }).parts).toEqual(all.parts);
        expect(parseReply(reply, cast, 'Ash', { sittingOut: [] }).parts).toEqual(all.parts);
        expect(all.parts.filter((part) => part.kind === 'speech' && part.characterId === 1)).toHaveLength(2);
        expect(all.droppedSpeakers).toEqual([]);
    });
});

const NUDGE_KAI = 'The user would like to hear from Kai this turn: give Kai a line or a moment if Kai could plausibly be there. If not, carry on naturally without forcing it.';

describe('Nudge: the turn prompt (pure)', () => {
    it('puts the line after "Where things stand" and before the final instruction, in the trailing message only', () => {
        const prompt = buildTurnPrompt(input({ nudge: 'Kai', sittingOut: ['Mira'], authorsNote: 'Keep it moody.' }));
        const trailing = trailingOf(prompt);
        expect(nudgeLine('Kai')).toBe(NUDGE_KAI);
        expect(trailing).toContain(`${SENTENCE} `);
        expect(trailing.indexOf("# Author's note")).toBeLessThan(trailing.indexOf('Where things stand:'));
        expect(trailing.indexOf('Where things stand:')).toBeLessThan(trailing.indexOf(NUDGE_KAI));
        expect(trailing.indexOf(NUDGE_KAI)).toBeLessThan(trailing.indexOf('Write the next turn now.'));
        expect(trailing.endsWith(`\n${NUDGE_KAI}\nWrite the next turn now.${trailing.split('Write the next turn now.')[1]}`)).toBe(true);
        expect(prompt.messages.slice(0, -1).some((message) => message.content.includes('would like to hear from'))).toBe(false);
    });

    it('adds nothing without a nudge: the prompt equals one built without the field', () => {
        const today = buildTurnPrompt(input());
        expect(buildTurnPrompt(input({ nudge: null }))).toEqual(today);
        expect(trailingOf(today)).not.toContain('would like to hear from');
    });

    it('leaves the system message, and with it the cached prefix, the same with a nudge', () => {
        expect(buildTurnPrompt(input({ nudge: 'Kai' })).messages[0]).toEqual(buildTurnPrompt(input()).messages[0]);
    });

    it('is allowed for by the Story so far trigger: a nudged turn still fits inside the margin at the smallest budget that needs none', () => {
        const messages = Array.from({ length: 20 }, (_, i) => ({ role: (i % 2 === 0 ? 'assistant' : 'user') as 'user' | 'assistant', text: `M${i} ${'x'.repeat(796)}` }));
        let budget = 5_000;
        while (storySoFarCoverage(layers(), messages, budget) !== null) budget += 1;
        // The trigger stands in 300 tokens for the next user message, and the cast for who is present.
        const turn = buildTurnPrompt({ ...layers(), history: messages, userText: 'u'.repeat(1_200), present: ['Mira', 'Kai'], nudge: 'Kai', tokenBudget: budget });
        const total = turn.messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
        expect(turn.trimmed).toBe(0);
        expect(total + STORY_SO_FAR_TRIGGER_MARGIN).toBeLessThanOrEqual(budget);
    });

    it('is turn-only: Suggested replies never carry it', () => {
        const withNudge = { ...layers(), nudge: 'Kai', history: [{ role: 'assistant' as const, text: '@Kai: Hm.' }] } as Parameters<typeof buildSuggestionsPrompt>[0];
        expect(JSON.stringify(buildSuggestionsPrompt(withNudge))).not.toContain('would like to hear from');
    });
});

interface Part {
    kind: 'narration' | 'speech';
    characterId?: number | null;
    speakerName?: string;
    text: string;
}

interface Message {
    id: number;
    kind: 'user' | 'ai';
    text?: string;
    parts?: Part[];
    judge?: { status: 'pending' | 'done' | 'failed' } | null;
    memory?: { status: 'pending' | 'done' | 'failed' } | null;
}

interface Chat {
    id: number;
    sittingOut: number[];
    messages: Message[];
}

interface Cast {
    storyId: number;
    miraId: number;
    kaiId: number;
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.\n\n@Kai: Evening!';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';
const MIRA_LOOKS = 'Tall, with a grey braid and an oilskin coat.';
const KAI_LOOKS = 'Wiry, with a red scarf and tar on his hands.';
const MIRA_REPLY = `Mira sets down the logbook.

@Mira: You're late.
Boots off.

@Kai: Don't mind her.`;

describe('Sitting out: the API', () => {
    let t: TestApp;
    let origin: string;

    beforeAll(async () => {
        t = await startTestApp();
        const server = t.app.getHttpServer();
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function createStory(): Promise<Cast> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const character = (name: string, appearance: string, personality: string) =>
            t.http.post(`/api/stories/${storyId}/characters`).send({ name, appearance, personality, voice: 'Short.' }).expect(201);
        await character('Mira', MIRA_LOOKS, 'Guarded and dry.');
        // Adding a Character answers the Story, in cast order.
        const [mira, kai] = (await character('Kai', KAI_LOOKS, 'Restless and warm.')).body.characters as Array<{ id: number; name: string }>;
        expect([mira.name, kai.name]).toEqual(['Mira', 'Kai']);
        return { storyId, miraId: mira.id, kaiId: kai.id };
    }

    async function createChat(storyId: number): Promise<Chat> {
        return (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
    }

    async function getChat(storyId: number, chatId: number): Promise<Chat> {
        return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as Chat;
    }

    function setSittingOut(storyId: number, chatId: number, characterIds: unknown) {
        return t.http.put(`/api/stories/${storyId}/chats/${chatId}/sitting-out`).send({ characterIds });
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

    function script(reply: string): void {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
    }

    async function send(storyId: number, chatId: number, text: string, reply = '@Kai: Fine.'): Promise<Chat> {
        script(reply);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    const trailing = (call: TextCompletionRequest) => call.messages.at(-1)!.content;
    const lastTurn = () => t.gateway.textCalls('turn').at(-1)!;
    const speakers = (message: Message) => (message.parts ?? []).flatMap((part) => (part.kind === 'speech' ? [part.speakerName] : []));

    it('replaces the set and answers the Chat with it in cast order; an id outside the cast is a 404 that changes nothing', async () => {
        const { storyId, miraId, kaiId } = await createStory();
        const chat = await createChat(storyId);
        expect(chat.sittingOut).toEqual([]);

        const both = (await setSittingOut(storyId, chat.id, [kaiId, miraId]).expect(200)).body as Chat;
        expect(both.sittingOut).toEqual([miraId, kaiId]);
        expect(both.messages).toHaveLength(1);
        expect((await setSittingOut(storyId, chat.id, [kaiId, kaiId]).expect(200)).body.sittingOut).toEqual([kaiId]);
        expect((await getChat(storyId, chat.id)).sittingOut).toEqual([kaiId]);

        // Another Story's Character is not in this cast.
        const other = await createStory();
        const unknown = await setSittingOut(storyId, chat.id, [miraId, other.miraId]).expect(404);
        expect(unknown.body.error.code).toBe('404.003.002');
        await setSittingOut(storyId, chat.id, [999_999]).expect(404);
        await setSittingOut(storyId, chat.id, ['Mira']).expect(400);
        await setSittingOut(storyId, chat.id, null).expect(400);
        expect((await getChat(storyId, chat.id)).sittingOut).toEqual([kaiId]);

        // Belongs to its Chat only.
        expect((await createChat(storyId)).sittingOut).toEqual([]);
        expect((await setSittingOut(storyId, chat.id, []).expect(200)).body.sittingOut).toEqual([]);
    });

    it('drops a Character removed from the Story', async () => {
        const { storyId, miraId, kaiId } = await createStory();
        const chat = await createChat(storyId);
        await setSittingOut(storyId, chat.id, [miraId, kaiId]).expect(200);
        await t.http.delete(`/api/stories/${storyId}/characters/${miraId}`).expect(200);
        expect((await getChat(storyId, chat.id)).sittingOut).toEqual([kaiId]);
    });

    it('tells the Narrator about them in every turn, leaves the system message alone, and sends as before once they are back', async () => {
        const { storyId, miraId } = await createStory();
        const away = await createChat(storyId);
        const plain = await createChat(storyId);
        await setSittingOut(storyId, away.id, [miraId]).expect(200);

        // The same moves in both Chats, with replies that need no dropping, so the prompts differ only by the reminder.
        const moves = async (chatId: number): Promise<TextCompletionRequest[]> => {
            const from = t.gateway.calls.length;
            await send(storyId, chatId, 'I climb the stairs.', '@Kai: Fine. Come up.');
            script('The rain keeps on.');
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/continue`).expect(200);
            const chat = await settled(storyId, chatId);
            script('@Kai: Mind the step.');
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${chat.messages.at(-1)!.id}/regenerate`).expect(200);
            await settled(storyId, chatId);
            return t.gateway.calls.slice(from).flatMap((call) => (call.method === 'completeText' && call.request.kind === 'turn' ? [call.request] : []));
        };
        const awayTurns = await moves(away.id);
        const plainTurns = await moves(plain.id);
        expect(awayTurns).toHaveLength(3);

        // The send reads the Opening, where Mira spoke: she is in the plain Chat's exchange, never in the other's.
        expect(trailing(plainTurns[0])).toContain('In the latest exchange: Mira, Kai.');
        expect(trailing(awayTurns[0])).toContain(`In the latest exchange: Kai. Sitting out: Mira. ${SENTENCE}`);
        const withoutExchange = (text: string) => text.replace(/In the latest exchange: [^.]*\. /, '');
        awayTurns.forEach((turn, i) => {
            expect(trailing(turn)).toContain(`Sitting out: Mira. ${SENTENCE}`);
            expect(withoutExchange(trailing(turn)).replace(`Sitting out: Mira. ${SENTENCE} `, '')).toBe(withoutExchange(trailing(plainTurns[i])));
            expect(turn.messages.slice(0, -1)).toEqual(plainTurns[i].messages.slice(0, -1));
        });

        // Back in: the next turn, judge and extraction are the plain Chat's again.
        await setSittingOut(storyId, away.id, []).expect(200);
        const callsOf = async (chatId: number) => {
            const from = t.gateway.calls.length;
            await send(storyId, chatId, 'I wave at Mira.', '@Mira: Hi.\n\n@Kai: Hi.');
            return t.gateway.calls
                .slice(from)
                .flatMap((call) => (call.method === 'completeText' ? [{ ...call.request, servedFor: null }] : []))
                .sort((a, b) => a.kind.localeCompare(b.kind));
        };
        const awayBack = await callsOf(away.id);
        const plainBack = await callsOf(plain.id);
        expect(awayBack.map((call) => call.kind)).toEqual(['judge', 'memory_extraction', 'turn']);
        expect(awayBack.some((call) => call.messages.some((message) => /sitting out/i.test(message.content)))).toBe(false);
        expect(awayBack).toEqual(plainBack);
        expect((await getChat(storyId, away.id)).messages.at(-1)!.parts).toEqual((await getChat(storyId, plain.id)).messages.at(-1)!.parts);
    });

    it('stores no part for their lines, keeps narration naming them, and logs nothing into the Message', async () => {
        const { storyId, miraId, kaiId } = await createStory();
        const chat = await createChat(storyId);
        await setSittingOut(storyId, chat.id, [miraId]).expect(200);

        const played = await send(storyId, chat.id, 'Evening.', MIRA_REPLY);
        expect(played.messages[2].parts).toEqual([
            { kind: 'narration', text: 'Mira sets down the logbook.' },
            { kind: 'speech', characterId: kaiId, speakerName: 'Kai', text: "Don't mind her.", emotion: null },
        ]);
        // Older lines by her show as they always did.
        expect(speakers(played.messages[0])).toEqual(['Mira', 'Kai']);
    });

    it('never shows their line in the streamed parts either', async () => {
        const { storyId, miraId, kaiId } = await createStory();
        const chat = await createChat(storyId);
        await setSittingOut(storyId, chat.id, [miraId]).expect(200);
        t.gateway.scriptText('turn', { text: MIRA_REPLY, pieceSize: 3, pieceDelayMs: 2 });
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);

        const response = await fetch(`${origin}/api/stories/${storyId}/chats/${chat.id}/messages`, {
            method: 'POST',
            headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'Evening.' }),
        });
        const body = await response.text();
        const events = body
            .split('\n\n')
            .map((block) => ({
                event: /^event: *(.*)$/m.exec(block)?.[1],
                data: block
                    .split('\n')
                    .filter((line) => line.startsWith('data:'))
                    .map((line) => line.slice(5).trimStart())
                    .join('\n'),
            }))
            .filter((event) => event.data !== '');
        const parts = events.filter((event) => event.event === 'parts').map((event) => JSON.parse(event.data).parts as Part[]);
        expect(parts.length).toBeGreaterThan(3);
        for (const each of parts) {
            expect(each.some((part) => part.kind === 'speech' && part.speakerName === 'Mira')).toBe(false);
            expect(each.some((part) => part.text.includes("You're late") || part.text.includes('Boots off.'))).toBe(false);
        }
        expect(parts.at(-1)).toEqual([
            { kind: 'narration', text: 'Mira sets down the logbook.' },
            { kind: 'speech', characterId: kaiId, speakerName: 'Kai', text: "Don't mind her.", emotion: null },
        ]);
        await settled(storyId, chat.id);
    });

    it('keeps their lines in an AI Message the user edits, and in the Opening Reset brings back', async () => {
        const { storyId, miraId } = await createStory();
        const chat = await createChat(storyId);
        await setSittingOut(storyId, chat.id, [miraId]).expect(200);
        const played = await send(storyId, chat.id, 'Evening.');

        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        const edited = await t.http
            .patch(`/api/stories/${storyId}/chats/${chat.id}/messages/${played.messages[2].id}`)
            .send({ text: '@Mira: I wrote this one myself.\n\n@Kai: So did I.' })
            .expect(200);
        expect(speakers(edited.body.messages[2])).toEqual(['Mira', 'Kai']);
        expect(edited.body.sittingOut).toEqual([miraId]);
        await settled(storyId, chat.id);

        const reset = (await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/reset`).expect(200)).body as Chat;
        expect(reset.sittingOut).toEqual([miraId]);
        expect(speakers(reset.messages[0])).toEqual(['Mira', 'Kai']);
    });

    it('is kept by a User Message edit and read by its turn', async () => {
        const { storyId, miraId, kaiId } = await createStory();
        const chat = await createChat(storyId);
        await setSittingOut(storyId, chat.id, [miraId]).expect(200);
        const played = await send(storyId, chat.id, 'I climb the stairs.');

        script(MIRA_REPLY);
        const edited = await t.http
            .patch(`/api/stories/${storyId}/chats/${chat.id}/messages/${played.messages[1].id}`)
            .send({ text: 'I climb slowly.' })
            .expect(200);
        expect(edited.body.sittingOut).toEqual([miraId]);
        expect(trailing(lastTurn())).toContain('Sitting out: Mira.');
        expect(edited.body.messages.at(-1).parts).toEqual([
            { kind: 'narration', text: 'Mira sets down the logbook.' },
            { kind: 'speech', characterId: kaiId, speakerName: 'Kai', text: "Don't mind her.", emotion: null },
        ]);
        await settled(storyId, chat.id);
    });

    it('is carried by a Branch, which then sets its own', async () => {
        const { storyId, miraId, kaiId } = await createStory();
        const chat = await createChat(storyId);
        await setSittingOut(storyId, chat.id, [miraId, kaiId]).expect(200);
        const played = await send(storyId, chat.id, 'I climb the stairs.', 'The wind howls.');

        const branch = (await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${played.messages[2].id}/branch`).expect(201)).body as Chat;
        expect(branch.id).not.toBe(chat.id);
        expect(branch.sittingOut).toEqual([miraId, kaiId]);
        await send(storyId, branch.id, 'I look out to sea.', 'Waves.');
        expect(trailing(lastTurn())).toContain('Sitting out: Mira, Kai.');

        await setSittingOut(storyId, branch.id, []).expect(200);
        expect((await getChat(storyId, chat.id)).sittingOut).toEqual([miraId, kaiId]);
    });

    it('steers Suggested replies away from them', async () => {
        const SUGGESTED = '{"action":"I wait.","speech":"\\"Well?\\"","move":"I take the lamp."}';
        const { storyId, miraId } = await createStory();
        const away = await createChat(storyId);
        const plain = await createChat(storyId);
        await setSittingOut(storyId, away.id, [miraId]).expect(200);

        t.gateway.scriptText('suggested_replies', SUGGESTED, SUGGESTED);
        await t.http.post(`/api/stories/${storyId}/chats/${away.id}/suggestions`).expect(200);
        await t.http.post(`/api/stories/${storyId}/chats/${plain.id}/suggestions`).expect(200);
        const [withAway, withoutAway] = t.gateway.textCalls('suggested_replies');
        const line = '\nNo option may speak to, call for or involve anyone sitting out, who takes no part in the story for now: Mira.';
        expect(withAway.messages.at(-1)!.content).toContain(line);
        expect(withoutAway.messages.at(-1)!.content).toBe(withAway.messages.at(-1)!.content.replace(line, ''));
        expect(withoutAway.messages.slice(0, -1)).toEqual(withAway.messages.slice(0, -1));
    });
    describe('the judge, Memory and Snapshots', () => {
        interface Memory {
            id: number;
            text: string;
            knownBy: number[];
            archived: boolean;
        }

        const judgement = (fields: { bonds?: object[]; arcs?: object[] }) =>
            JSON.stringify({
                bond_changes: (fields.bonds ?? []).map((bond) => ({ description: 'In a word.', cause: 'Because.', ...bond })),
                arc_steps: (fields.arcs ?? []).map((arc) => ({ cause: 'Because.', ...arc })),
                scene: { reason: 'nothing yet', move_on: false },
            });

        /** One turn with these background answers; returns once both settled. */
        async function play(storyId: number, chatId: number, text: string, reply: string, background: { judge?: string; memory?: string }) {
            t.gateway.scriptText('turn', reply);
            t.gateway.scriptText('judge', background.judge ?? NO_CHANGE);
            t.gateway.scriptText('memory_extraction', background.memory ?? NO_OPS);
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
            return settled(storyId, chatId);
        }

        async function memories(storyId: number, chatId: number): Promise<{ present: number[]; memories: Memory[] }> {
            return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/memories`).expect(200)).body;
        }

        async function dashboard(storyId: number, chatId: number) {
            const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/dashboard`).expect(200);
            return body as { characters: Array<{ name: string; bonds: Array<{ toward: { name: string }; label: string }>; arcChanges: Array<{ cause: string }> }> };
        }

        it('the judge marks them in its cast and gives them no Bond change or Arc step, while a Bond toward them still changes', async () => {
            const { storyId, miraId } = await createStory();
            const away = await createChat(storyId);
            const plain = await createChat(storyId);
            await setSittingOut(storyId, away.id, [miraId]).expect(200);

            const judged = judgement({
                bonds: [
                    { from: 'Mira', to: 'user', label: 'smitten' },
                    { from: 'Mira', to: 'Kai', label: 'fond' },
                    { from: 'Kai', to: 'Mira', label: 'resentful' },
                    { from: 'Kai', to: 'user', label: 'trusting' },
                ],
                arcs: [
                    { character: 'Mira', step: 'Learns to forgive.', cause: 'Kai owned up to the lie.' },
                    { character: 'Kai', step: 'Stops running.', cause: 'Ash would not let him leave.' },
                ],
            });
            for (const chat of [away, plain]) await play(storyId, chat.id, 'I tell Kai that Mira left.', '@Kai: Typical.', { judge: judged });

            const board = await dashboard(storyId, away.id);
            const [mira, kai] = board.characters;
            expect(mira.name).toBe('Mira');
            expect(mira.bonds).toEqual([]);
            expect(mira.arcChanges).toEqual([]);
            expect(kai.bonds.map((bond) => [bond.toward.name, bond.label])).toEqual(
                expect.arrayContaining([
                    ['Mira', 'resentful'],
                    ['Ash', 'trusting'],
                ]),
            );
            expect(kai.bonds).toHaveLength(2);
            expect(kai.arcChanges.map((change) => change.cause)).toEqual(['Ash would not let him leave.']);

            // The same judgement in a Chat where she is in applies all of it.
            const [plainMira] = (await dashboard(storyId, plain.id)).characters;
            expect(plainMira.bonds).toHaveLength(2);
            expect(plainMira.arcChanges.map((change) => change.cause)).toEqual(['Kai owned up to the lie.']);

            // The prompt: Mira's cast line carries the mark, and nothing else differs.
            const [awayJudge, plainJudge] = t.gateway.textCalls('judge');
            const prompt = (call: TextCompletionRequest) => call.messages.map((message) => message.content).join('\n');
            expect(prompt(awayJudge)).toMatch(/^- Mira: Guarded and dry\. \[SITTING OUT: not in the story now\. No Bond changes from them and no Arc steps for them; others may still change how they feel toward them\.\]$/m);
            expect(prompt(awayJudge)).toMatch(/^- Kai: Restless and warm\.$/m);
            expect(prompt(plainJudge)).not.toContain('SITTING OUT');
            const mark = /^(- Mira: Guarded and dry\.).*$/m;
            expect({ ...awayJudge, servedFor: null, messages: awayJudge.messages.map((m) => ({ ...m, content: m.content.replace(mark, '$1') })) }).toEqual({
                ...plainJudge,
                servedFor: null,
            });
        });

        it('extraction is told the present Characters without them, adds them to no Known by, and keeps the Known by they had', async () => {
            const { storyId, miraId, kaiId } = await createStory();
            const chat = await createChat(storyId);
            // While she is in: three Memories by the extraction, so none is locked.
            const first = JSON.stringify({
                operations: [
                    { op: 'add', text: 'Mira hid the logbook.', known_by: ['Mira'], cause: 'She did.' },
                    { op: 'add', text: 'The tide is high.', known_by: ['Kai'], cause: 'He saw.' },
                    { op: 'add', text: 'The gulls left.', known_by: ['Kai'], cause: 'He saw.' },
                ],
            });
            await play(storyId, chat.id, 'I look around.', '@Mira: Nothing to see.', { memory: first });
            const before = (await memories(storyId, chat.id)).memories;
            const [logbook, tide, gulls] = before;
            expect(logbook.knownBy).toEqual([miraId]);

            await setSittingOut(storyId, chat.id, [miraId]).expect(200);
            const second = JSON.stringify({
                operations: [
                    { op: 'add', text: 'Kai found the key.', known_by: ['Mira', 'Kai'], cause: 'He did.' },
                    { op: 'add', text: 'Mira is in the city.', known_by: ['Mira'], cause: 'Kai said.' },
                    { op: 'known_by', id: gulls.id, names: ['Mira'], cause: 'Told.' },
                    { op: 'merge', ids: [logbook.id, tide.id], text: 'Mira hid the logbook at high tide.', known_by: ['Mira', 'Kai'], cause: 'Same night.' },
                ],
            });
            await play(storyId, chat.id, 'I ask Kai where Mira went.', '@Kai: Mira? Off to the city.', { memory: second });

            const after = (await memories(storyId, chat.id)).memories.filter((memory) => !memory.archived);
            const known = (text: string) => after.find((memory) => memory.text === text)?.knownBy;
            expect(known('Kai found the key.')).toEqual([kaiId]);
            expect(known('Mira is in the city.')).toEqual([]);
            expect(known('The gulls left.')).toEqual([kaiId]);
            // A merge keeps the Known by its sources had: hers is old knowledge.
            expect(known('Mira hid the logbook at high tide.')).toEqual([miraId, kaiId]);

            // Named in the exchange, she is still not present; the first call, while she was in, had her.
            const [whileIn, whileOut] = t.gateway.textCalls('memory_extraction').map((call) => call.messages.map((message) => message.content).join('\n'));
            expect(whileIn).toContain('# Characters present in this exchange\nMira\n');
            expect(whileOut).toContain('# Characters present in this exchange\nKai\n');
        });

        it('extraction falls back to everyone else, not to them, when the exchange names nobody', async () => {
            const { storyId, miraId } = await createStory();
            const chat = await createChat(storyId);
            await setSittingOut(storyId, chat.id, [miraId]).expect(200);
            await play(storyId, chat.id, 'I wait.', 'The wind howls.', {});
            const [call] = t.gateway.textCalls('memory_extraction');
            expect(call.messages.map((message) => message.content).join('\n')).toContain('# Characters present in this exchange\nKai\n');
        });

        it('a Memory added by hand with no Known by is not known by them, and the list leaves them out of present; given explicitly, they are kept', async () => {
            const { storyId, miraId, kaiId } = await createStory();
            const chat = await createChat(storyId);
            const memoryPath = `/api/stories/${storyId}/chats/${chat.id}/memories`;
            // The Opening has both speak.
            expect((await memories(storyId, chat.id)).present).toEqual([miraId, kaiId]);
            await setSittingOut(storyId, chat.id, [miraId]).expect(200);
            expect((await memories(storyId, chat.id)).present).toEqual([kaiId]);

            const unnamed = await t.http.post(memoryPath).send({ text: 'The lamp needs oil.' }).expect(201);
            expect(unnamed.body.knownBy).toEqual([kaiId]);
            const explicit = await t.http.post(memoryPath).send({ text: 'Mira keeps a diary.', knownBy: [miraId] }).expect(201);
            expect(explicit.body.knownBy).toEqual([miraId]);

            // An exchange that names nobody: the "everyone" fallback leaves her out too.
            await play(storyId, chat.id, 'I wait.', 'The wind howls.', {});
            expect((await memories(storyId, chat.id)).present).toEqual([kaiId]);
            const fallback = await t.http.post(memoryPath).send({ text: 'The wind came up.' }).expect(201);
            expect(fallback.body.knownBy).toEqual([kaiId]);

            await setSittingOut(storyId, chat.id, []).expect(200);
            expect((await memories(storyId, chat.id)).present).toEqual([miraId, kaiId]);
        });

        it("Snapshots leave them out of the writer's cast and the frame, unless the hint names them", async () => {
            const { storyId, miraId, kaiId } = await createStory();
            const away = await createChat(storyId);
            const plain = await createChat(storyId);
            await setSittingOut(storyId, away.id, [miraId]).expect(200);
            const written = (inFrame: string[]) => JSON.stringify({ in_frame: inFrame, scene: 'By the lamp at dusk.' });

            async function snap(chatId: number, hint: string, inFrame: string[]) {
                t.gateway.scriptText('snapshot_prompt', written(inFrame));
                t.gateway.scriptImage('snapshot_image', { image: { bytes: Buffer.from('jpeg'), mimeType: 'image/jpeg' }, model: 'seedream', costUsd: 0.05 });
                await t.http.post(`/api/stories/${storyId}/chats/${chatId}/snapshots`).send({ hint }).expect(202);
                const deadline = Date.now() + 5_000;
                for (;;) {
                    const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/snapshots`).expect(200);
                    if (body.jobs.every((job: { status: string }) => job.status !== 'pending')) {
                        expect(body.jobs).toEqual([]);
                        return [...body.snapshots].sort((a: { id: number }, b: { id: number }) => a.id - b.id).at(-1) as { characters: Array<{ characterId: number; name: string }>; prompt: string };
                    }
                    if (Date.now() > deadline) throw new Error('The Snapshot did not settle in time');
                    await new Promise((resolve) => setTimeout(resolve, 20));
                }
            }
            const writer = () => t.gateway.textCalls('snapshot_prompt').at(-1)!.messages.map((message) => message.content).join('\n');

            const without = await snap(away.id, '', ['Mira', 'Kai']);
            expect(without.characters).toEqual([{ characterId: kaiId, name: 'Kai' }]);
            expect(without.prompt).not.toContain(MIRA_LOOKS);
            const awayWriter = writer();
            expect(awayWriter).not.toContain(MIRA_LOOKS);
            expect(awayWriter).toContain(`- Kai: ${KAI_LOOKS}`);

            // With her in, the writer's prompt differs only by her line.
            await snap(plain.id, '', ['Mira', 'Kai']);
            expect(writer()).toContain(`- Mira: ${MIRA_LOOKS}`);
            expect(writer().replace(`- Mira: ${MIRA_LOOKS}\n`, '')).toBe(awayWriter);

            // The user's own words win.
            const named = await snap(away.id, 'Mira at the window', ['Kai']);
            expect(named.characters).toEqual([{ characterId: miraId, name: 'Mira' }]);
            expect(writer()).toContain(`- Mira: ${MIRA_LOOKS}`);
            expect(named.prompt).toContain(MIRA_LOOKS);
        });
    });

    // .scratch/speaker-controls/issues/03-nudge.md
    describe('Nudge', () => {
        const NUDGE = 'would like to hear from Kai this turn';
        const textCalls = (from: number) =>
            t.gateway.calls.slice(from).flatMap((call) => (call.method === 'completeText' ? [call.request] : []));

        it('carries the line on a send, a Continue, a Retry, a Regenerate and a User Message edit; the next turn without one has none', async () => {
            const { storyId, kaiId } = await createStory();
            const chat = await createChat(storyId);
            const from = t.gateway.calls.length;

            script('@Kai: You called?');
            await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).send({ text: 'I look around.', nudgeCharacterId: kaiId }).expect(201);
            await settled(storyId, chat.id);
            script('The wind rises.');
            await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/continue`).send({ nudgeCharacterId: kaiId }).expect(200);
            const continued = await settled(storyId, chat.id);
            script('@Kai: Again?');
            await t.http
                .post(`/api/stories/${storyId}/chats/${chat.id}/messages/${continued.messages.at(-1)!.id}/regenerate`)
                .send({ nudgeCharacterId: kaiId })
                .expect(200);
            await settled(storyId, chat.id);
            // A failed turn, then Retry with the nudge.
            t.gateway.scriptText('turn', new ProviderOutageError('DeepInfra answered 503.'));
            await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).send({ text: 'Hello?' }).expect(502);
            script('@Kai: Here.');
            await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/retry`).send({ nudgeCharacterId: kaiId }).expect(200);
            const retried = await settled(storyId, chat.id);
            script('@Kai: Over here.');
            await t.http
                .patch(`/api/stories/${storyId}/chats/${chat.id}/messages/${retried.messages.at(-2)!.id}`)
                .send({ text: 'Hello? Anyone?', nudgeCharacterId: kaiId })
                .expect(200);
            await settled(storyId, chat.id);
            await send(storyId, chat.id, 'I sit down.');

            const turns = textCalls(from).filter((call) => call.kind === 'turn');
            expect(turns).toHaveLength(7);
            const carried = turns.map((turn) => trailing(turn).includes(NUDGE));
            // The failed send was sent without one, the last turn too.
            expect(carried).toEqual([true, true, true, false, true, true, false]);
            for (const turn of turns.filter((call) => trailing(call).includes(NUDGE))) {
                expect(trailing(turn).indexOf('Where things stand:')).toBeLessThan(trailing(turn).indexOf(NUDGE));
                expect(trailing(turn).indexOf(NUDGE)).toBeLessThan(trailing(turn).indexOf('Write the next turn now.'));
                expect(turn.messages.slice(0, -1).some((message) => message.content.includes(NUDGE))).toBe(false);
            }
            // The judge and the extraction never hold it.
            const background = textCalls(from).filter((call) => call.kind !== 'turn');
            expect(background.length).toBeGreaterThan(0);
            expect(background.some((call) => call.messages.some((message) => message.content.includes('would like to hear from')))).toBe(false);
        });

        it('refuses a nudge on someone sitting out (409) and an id outside the cast (404), storing nothing and making no call', async () => {
            const { storyId, miraId, kaiId } = await createStory();
            const chat = await createChat(storyId);
            await setSittingOut(storyId, chat.id, [miraId]).expect(200);

            const away = await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).send({ text: 'Mira?', nudgeCharacterId: miraId }).expect(409);
            expect(away.body.error.code).toBe('409.004.021');
            expect(away.body.error.message).toBe('Mira is sitting out. Bring them back before nudging them.');
            const unknown = await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/continue`).send({ nudgeCharacterId: kaiId + 1_000 }).expect(404);
            expect(unknown.body.error.code).toBe('404.003.002');

            expect((await getChat(storyId, chat.id)).messages).toEqual(chat.messages);
            expect(t.gateway.textCalls()).toHaveLength(0);
        });
    });
});
