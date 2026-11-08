import { storySoFarCoverage } from '../src/manager/chat/story-so-far/story-so-far-prompt.js';
import { buildSuggestionsPrompt } from '../src/manager/chat/suggestions/suggestions-prompt.js';
import { buildTurnPrompt, estimateTokens, PromptLayersInput, TURN_PROMPT_TOKEN_BUDGET, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { LedgerModelService } from '../src/model/ledger/ledger.service.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Author's note (.scratch/authors-note/spec.md): the user's standing direction for one Chat,
 * read in the trailing system message of every turn, after the Lore and before "Where things
 * stand". The pure prompt first, then through the HTTP API with the fake gateway scripted.
 */

const HEADING = "# Author's note";
const NOTE = 'Keep it a slow burn. It rains all day.';

function layers(overrides: Partial<PromptLayersInput> = {}): PromptLayersInput {
    return {
        story: {
            setting: 'A lighthouse.',
            pov: Pov.Second,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [{ name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.', exampleLines: [], background: '', secrets: '' }],
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
        history: [{ role: 'assistant', text: '@Mira: The lamp is out.' }],
        userText: 'I climb to the lamp.',
        ...overrides,
    };
}

/** Messages of about `tokens` tokens each, oldest first, each starting with its index. */
const history = (count: number, tokens: number) =>
    Array.from({ length: count }, (_, i) => ({
        role: (i % 2 === 0 ? 'assistant' : 'user') as 'user' | 'assistant',
        text: `M${i} ${'x'.repeat(tokens * 4 - 4)}`,
    }));

describe("Author's note: the turn prompt (pure)", () => {
    const lore = [{ id: 1, name: 'The lamp', keywords: [], text: 'The lamp burns whale oil.', alwaysOn: true }];

    it('sits after the Lore and before "Where things stand" and the final instruction, in the trailing message only', () => {
        const prompt = buildTurnPrompt(input({ lore, chosenLore: lore, authorsNote: `  ${NOTE}\n` }));
        const trailing = prompt.messages.at(-1)!;
        expect(trailing.role).toBe('system');
        const at = (text: string) => trailing.content.indexOf(text);
        expect(at('# Lore')).toBe(0);
        expect(at(HEADING)).toBeGreaterThan(at('The lamp burns whale oil.'));
        expect(at(NOTE)).toBeGreaterThan(at(HEADING));
        expect(at('Where things stand:')).toBeGreaterThan(at(NOTE));
        expect(at('Write the next turn now.')).toBeGreaterThan(at('Where things stand:'));
        expect(trailing.content).toContain(`${HEADING} (the user's own direction for this Chat)\n${NOTE}\n`);
        expect(trailing.content).toContain('never quote it or mention it');
        expect(trailing.content).toContain('It never overrides the rules about Ash: never write anything Ash says, thinks, feels, decides or does.');
        expect(prompt.messages.slice(0, -1).some((message) => message.content.includes(NOTE))).toBe(false);
    });

    it('sends no block for no note or only whitespace, and the prompt equals one built without the field', () => {
        const today = buildTurnPrompt(input({ lore, chosenLore: lore }));
        for (const authorsNote of [undefined, null, '', ' \n\t ']) {
            const prompt = buildTurnPrompt(input({ lore, chosenLore: lore, authorsNote }));
            expect(prompt).toEqual(today);
            expect(prompt.messages.at(-1)!.content).not.toContain(HEADING);
        }
    });

    it('leaves the system message, and with it the cached prefix, the same with and without a note', () => {
        const without = buildTurnPrompt(input());
        const withNote = buildTurnPrompt(input({ authorsNote: NOTE }));
        expect(withNote.messages[0]).toEqual(without.messages[0]);
        expect(withNote.messages.slice(0, -1)).toEqual(without.messages.slice(0, -1));
    });

    it('counts toward the budget: a long note trims one more old Message where the budget is tight', () => {
        const turn = input({ history: history(6, 400) });
        const base = buildTurnPrompt({ ...turn, tokenBudget: 1_000_000 });
        const fixed = estimateTokens(base.messages[0].content) + estimateTokens(turn.userText!) + estimateTokens(base.messages.at(-1)!.content);
        // Room for three Messages and a little over: the note's ~300 tokens push one out.
        const tokenBudget = fixed + 3 * 400 + 50;

        const without = buildTurnPrompt({ ...turn, tokenBudget });
        const withNote = buildTurnPrompt({ ...turn, tokenBudget, authorsNote: 'n'.repeat(1_000) });
        expect(without.trimmed).toBe(3);
        expect(withNote.trimmed).toBe(4);
        expect(withNote.messages.slice(1, -2).map((message) => message.content.split(' ')[0])).toEqual(['M4', 'M5']);
    });

    it('is reserved by the Story so far trigger, so a Chat with a note gets its Story so far in time', () => {
        const messages = history(20, 200);
        let budget = 5_000;
        while (storySoFarCoverage(layers(), messages, budget) !== null) budget += 1;
        // The smallest budget at which the Chat without a note still fits: the note's tokens tip it over.
        expect(storySoFarCoverage(layers({ authorsNote: '  ' }), messages, budget)).toBeNull();
        expect(storySoFarCoverage(layers({ authorsNote: 'n'.repeat(1_000) }), messages, budget)).toBeGreaterThan(0);
    });
});

describe("Author's note: Suggested replies (pure)", () => {
    const lore = [{ id: 1, name: 'The lamp', keywords: [], text: 'The lamp burns whale oil.', alwaysOn: true }];
    const suggestions = (overrides: Partial<PromptLayersInput> = {}, messages = history(3, 50)) =>
        buildSuggestionsPrompt({ ...layers({ lore, ...overrides }), history: messages });

    it('carry the block after the Lore and before their instruction, in the closing message only', () => {
        const prompt = suggestions({ authorsNote: NOTE });
        const closing = prompt.messages.at(-1)!.content;
        expect(closing.indexOf('The lamp burns whale oil.')).toBeLessThan(closing.indexOf(HEADING));
        expect(closing).toContain(`${HEADING} (the user's own direction for this Chat)\n${NOTE}\n`);
        expect(closing.indexOf(NOTE)).toBeLessThan(closing.indexOf('Step outside the story'));
        expect(prompt.messages.slice(0, -1).some((message) => message.content.includes(NOTE))).toBe(false);
        // The same words the turn uses.
        const turnBlock = buildTurnPrompt(input({ authorsNote: NOTE })).messages.at(-1)!.content;
        const block = (text: string) => text.slice(text.indexOf(HEADING), text.indexOf('\n\n', text.indexOf(HEADING)));
        expect(block(closing)).toBe(block(turnBlock));
    });

    it('carry none without a note, and equal the prompt built without the field', () => {
        const today = suggestions();
        for (const authorsNote of [null, '', '  \n ']) expect(suggestions({ authorsNote })).toEqual(today);
        expect(today.messages.at(-1)!.content).not.toContain(HEADING);
    });

    it('reserve the note in their history budget: a long note trims one more old Message where the budget is tight', () => {
        const empty = suggestions({}, []);
        const room = TURN_PROMPT_TOKEN_BUDGET - estimateTokens(empty.messages[0].content) - estimateTokens(empty.messages.at(-1)!.content);
        // Five old Messages, then a newest one that leaves room for two of them and 50 tokens over.
        const messages = [...history(5, 380), { role: 'assistant' as const, text: 'y'.repeat((room - 50 - 2 * 380) * 4) }];
        const kept = (authorsNote: string | null) => suggestions({ authorsNote }, messages).messages.slice(1, -1).length;
        expect(kept(null)).toBe(3);
        // The note's ~330 tokens push one more out.
        expect(kept('n'.repeat(1_000))).toBe(2);
    });
});

interface Message {
    id: number;
    kind: 'user' | 'ai';
    text?: string;
    judge?: { status: 'pending' | 'done' | 'failed' } | null;
    memory?: { status: 'pending' | 'done' | 'failed' } | null;
}

interface Chat {
    id: number;
    title: string;
    authorsNote: string;
    messages: Message[];
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';

describe("Author's note: the API", () => {
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

    async function createStory(): Promise<number> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short sentences.' })
            .expect(201);
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Lamp', text: 'The lamp burns whale oil.', alwaysOn: true }).expect(201);
        return storyId;
    }

    async function createChat(storyId: number): Promise<Chat> {
        return (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
    }

    async function getChat(storyId: number, chatId: number): Promise<Chat> {
        return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as Chat;
    }

    function setNote(storyId: number, chatId: number, text: unknown) {
        return t.http.put(`/api/stories/${storyId}/chats/${chatId}/authors-note`).send({ text });
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

    async function send(storyId: number, chatId: number, text: string, reply = '@Mira: Fine.'): Promise<Chat> {
        script(reply);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    const trailing = (call: TextCompletionRequest) => call.messages.at(-1)!.content;
    const lastTurn = () => t.gateway.textCalls('turn').at(-1)!;

    it('saves the note trimmed, answers the Chat with it, clears it on whitespace, and refuses more than 1,000 characters', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        expect(chat.authorsNote).toBe('');

        const saved = (await setNote(storyId, chat.id, `  ${NOTE}\n`).expect(200)).body as Chat;
        expect(saved.authorsNote).toBe(NOTE);
        expect(saved.messages).toHaveLength(1);
        expect((await getChat(storyId, chat.id)).authorsNote).toBe(NOTE);

        const thai = 'ให้มันค่อยเป็นค่อยไป';
        expect((await setNote(storyId, chat.id, thai).expect(200)).body.authorsNote).toBe(thai);
        expect((await setNote(storyId, chat.id, 'x'.repeat(1_000)).expect(200)).body.authorsNote).toHaveLength(1_000);

        const tooLong = await setNote(storyId, chat.id, 'x'.repeat(1_001)).expect(400);
        expect(tooLong.body.error.code).toBe('400.000.000');
        await setNote(storyId, chat.id, 42).expect(400);
        expect((await getChat(storyId, chat.id)).authorsNote).toHaveLength(1_000);

        expect((await setNote(storyId, chat.id, ' \n ').expect(200)).body.authorsNote).toBe('');
        const missing = await setNote(storyId, 999_999, NOTE).expect(404);
        expect(missing.body.error.code).toBe((await t.http.get(`/api/stories/${storyId}/chats/999999`).expect(404)).body.error.code);
    });

    it('belongs to its Chat only: another Chat of the same Story has none', async () => {
        const storyId = await createStory();
        const first = await createChat(storyId);
        const second = await createChat(storyId);
        await setNote(storyId, first.id, NOTE).expect(200);
        expect((await getChat(storyId, second.id)).authorsNote).toBe('');
    });

    it('rides in the trailing message of a send, a Continue and a Regenerate, never the judge or the extraction; without a note every prompt is as before', async () => {
        const storyId = await createStory();
        const noted = await createChat(storyId);
        const plain = await createChat(storyId);
        await setNote(storyId, noted.id, NOTE).expect(200);

        // The same moves in both Chats, so their prompts differ only by the note.
        const moves = async (chatId: number): Promise<TextCompletionRequest[]> => {
            const from = t.gateway.calls.length;
            await send(storyId, chatId, 'I climb the stairs.', '@Mira: Fine. Come up.');
            script('The rain keeps on.');
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/continue`).expect(200);
            const chat = await settled(storyId, chatId);
            script('@Mira: Mind the step.');
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${chat.messages.at(-1)!.id}/regenerate`).expect(200);
            await settled(storyId, chatId);
            return t.gateway.calls.slice(from).flatMap((call) => (call.method === 'completeText' ? [call.request] : []));
        };
        const withNote = await moves(noted.id);
        const withoutNote = await moves(plain.id);

        const turns = withNote.filter((call) => call.kind === 'turn');
        expect(turns).toHaveLength(3);
        for (const turn of turns) {
            const text = trailing(turn);
            expect(text).toContain(`${HEADING} (the user's own direction for this Chat)\n${NOTE}`);
            expect(text.indexOf('The lamp burns whale oil.')).toBeLessThan(text.indexOf(HEADING));
            expect(text.indexOf(HEADING)).toBeLessThan(text.indexOf('Where things stand:'));
            expect(turn.messages.slice(0, -1).some((message) => message.content.includes(NOTE))).toBe(false);
        }
        for (const call of withNote.filter((call) => call.kind !== 'turn')) {
            expect(call.messages.some((message) => message.content.includes(NOTE) || message.content.includes(HEADING))).toBe(false);
        }

        // Without a note: no block, and every call is the noted Chat's with the block taken out.
        // The judge and the extraction run in parallel, so calls are compared kind by kind, in order.
        const byKind = (calls: TextCompletionRequest[]) => [...calls].sort((a, b) => a.kind.localeCompare(b.kind));
        const [notedCalls, plainCalls] = [byKind(withNote), byKind(withoutNote)];
        expect(plainCalls.map((call) => call.kind)).toEqual(notedCalls.map((call) => call.kind));
        const block = (call: TextCompletionRequest) => trailing(call).slice(trailing(call).indexOf(HEADING), trailing(call).indexOf('Where things stand:'));
        plainCalls.forEach((call, i) => {
            const noted = notedCalls[i];
            expect(call.messages.some((message) => message.content.includes(HEADING))).toBe(false);
            const expected =
                noted.kind === 'turn'
                    ? { ...noted, messages: [...noted.messages.slice(0, -1), { ...noted.messages.at(-1)!, content: trailing(noted).replace(block(noted), '') }] }
                    : noted;
            expect({ ...call, servedFor: null }).toEqual({ ...expected, servedFor: null });
        });
    });

    it('is kept by a User Message edit and by Reset, and the next turn reads it', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        await setNote(storyId, chat.id, NOTE).expect(200);
        const played = await send(storyId, chat.id, 'I climb the stairs.');

        script('@Mira: Slower, then.');
        const edited = await t.http
            .patch(`/api/stories/${storyId}/chats/${chat.id}/messages/${played.messages[1].id}`)
            .send({ text: 'I climb slowly.' })
            .expect(200);
        expect(edited.body.authorsNote).toBe(NOTE);
        expect(trailing(lastTurn())).toContain(NOTE);
        await settled(storyId, chat.id);

        const reset = await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/reset`).expect(200);
        expect(reset.body.authorsNote).toBe(NOTE);
        expect(reset.body.messages).toHaveLength(1);
        await send(storyId, chat.id, 'Hello again.');
        expect(trailing(lastTurn())).toContain(NOTE);
    });

    it('steers Suggested replies: the block after the Lore and before their instruction; none without a note', async () => {
        const SUGGESTED = '{"action":"I wait.","speech":"\\"Well?\\"","move":"I take the lamp."}';
        const storyId = await createStory();
        const noted = await createChat(storyId);
        const plain = await createChat(storyId);
        await setNote(storyId, noted.id, NOTE).expect(200);

        t.gateway.scriptText('suggested_replies', SUGGESTED, SUGGESTED);
        await t.http.post(`/api/stories/${storyId}/chats/${noted.id}/suggestions`).expect(200);
        await t.http.post(`/api/stories/${storyId}/chats/${plain.id}/suggestions`).expect(200);
        const [withNote, withoutNote] = t.gateway.textCalls('suggested_replies');

        const closing = withNote.messages.at(-1)!.content;
        expect(closing.indexOf('The lamp burns whale oil.')).toBeLessThan(closing.indexOf(HEADING));
        expect(closing).toContain(`${HEADING} (the user's own direction for this Chat)\n${NOTE}\n`);
        expect(closing.indexOf(NOTE)).toBeLessThan(closing.indexOf('Step outside the story'));

        // Without a note: the same call with the block taken out.
        const block = closing.slice(closing.indexOf(HEADING), closing.indexOf('Step outside the story'));
        expect(withoutNote.messages.at(-1)!.content).toBe(closing.replace(block, ''));
        expect({ ...withoutNote, servedFor: null, messages: withoutNote.messages.slice(0, -1) }).toEqual({
            ...withNote,
            servedFor: null,
            messages: withNote.messages.slice(0, -1),
        });
    });

    it('is carried by a Branch, which is then steered on its own', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        await setNote(storyId, chat.id, NOTE).expect(200);
        const played = await send(storyId, chat.id, 'I climb the stairs.');

        const branch = (await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${played.messages[2].id}/branch`).expect(201)).body as Chat;
        expect(branch.authorsNote).toBe(NOTE);
        await send(storyId, branch.id, 'I look out to sea.');
        expect(trailing(lastTurn())).toContain(NOTE);

        await setNote(storyId, branch.id, 'Mira is hiding something.').expect(200);
        expect((await getChat(storyId, chat.id)).authorsNote).toBe(NOTE);
    });

    it('saves while a turn is being written: that turn keeps the note it started with, and the next turn gets the new one', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        await setNote(storyId, chat.id, 'Old direction.').expect(200);

        // Hold the turn inside its lock, after its User Message is stored and before its prompt is
        // built: the turn reads the ledger just before it builds the prompt.
        const ledger = t.app.get(LedgerModelService);
        const readState = ledger.state.bind(ledger);
        let reached: () => void = () => {};
        const atPrompt = new Promise<void>((resolve) => (reached = resolve));
        let release: () => void = () => {};
        const released = new Promise<void>((resolve) => (release = resolve));
        let armed = true;
        ledger.state = async (chatId) => {
            if (armed && chatId === chat.id) {
                armed = false;
                reached();
                await released;
            }
            return readState(chatId);
        };
        try {
            script('@Mira: Fine.');
            const sending = t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).send({ text: 'I climb the stairs.' }).then((response) => response);
            await atPrompt;
            // In flight: the lock is held and the User Message is stored.
            await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).send({ text: 'Again?' }).expect(409);
            expect((await getChat(storyId, chat.id)).messages.at(-1)).toMatchObject({ kind: 'user', text: 'I climb the stairs.' });

            const saved = await setNote(storyId, chat.id, 'New direction.').expect(200);
            expect(saved.body.authorsNote).toBe('New direction.');
            release();
            const sent = await sending;
            expect(sent.status).toBe(201);
            // Not dropped: the turn writes nothing of its Chat back over the new note.
            expect(sent.body.authorsNote).toBe('New direction.');
        } finally {
            release();
            ledger.state = readState;
        }

        // Not applied to the wrong turn: the one in flight was built with the old note, the next with the new.
        const [inFlight] = t.gateway.textCalls('turn');
        expect(trailing(inFlight)).toContain('Old direction.');
        expect(trailing(inFlight)).not.toContain('New direction.');
        expect((await settled(storyId, chat.id)).authorsNote).toBe('New direction.');
        await send(storyId, chat.id, 'And then?');
        expect(trailing(lastTurn())).toContain('New direction.');
        expect(trailing(lastTurn())).not.toContain('Old direction.');
    });
});
