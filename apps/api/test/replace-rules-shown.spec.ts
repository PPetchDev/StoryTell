import { startTestApp, TestApp } from './harness/test-app.js';

const OPENING = `The lamp went out an hour ago. Mira waits by the lamp.

@Mira: You're late, keeper. The lamp won't light itself.`;

const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';
const SUGGESTED = JSON.stringify({
    suggestions: [
        { kind: 'action', text: 'You light the lamp.' },
        { kind: 'speech', text: '"Sorry."' },
        { kind: 'move', text: 'You climb the tower.' },
    ],
});

interface ChatMessage {
    id: number;
    kind: 'user' | 'ai';
    text?: string;
    parts?: Array<{ kind: string; speakerName?: string; text: string }>;
    thaiReading: string | null;
    judge?: { status: string } | null;
    memory?: { status: string } | null;
}

// .scratch/saved-replies-and-replace-rules/spec.md: "Who sees what". Rules on AI Messages change
// what is shown (and the Transcript); every prompt, the Judge and Thai reading keep the stored text.
describe('Replace rules on AI Messages: shown text and stored text', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    beforeEach(async () => {
        for (const stored of (await t.http.get('/api/replace-rules').expect(200)).body.replaceRules as Array<{ id: number }>) {
            await t.http.delete(`/api/replace-rules/${stored.id}`).expect(200);
        }
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
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse, 1890s.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.' }).expect(201);
        return storyId;
    }

    async function getChat(storyId: number, chatId: number): Promise<{ messages: ChatMessage[] }> {
        return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
    }

    async function send(storyId: number, chatId: number, text: string, reply: string): Promise<void> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        const deadline = Date.now() + 5_000;
        for (;;) {
            const { messages } = await getChat(storyId, chatId);
            const last = messages[messages.length - 1];
            if (last.kind === 'ai' && last.judge?.status !== 'pending' && last.memory?.status !== 'pending') return;
            if (Date.now() > deadline) throw new Error('The turn did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    const asText = (value: unknown) => JSON.stringify(value);

    it("the Transcript applies On AI Messages rules to AI parts, app-wide then the Story's, and leaves names and User Messages as stored", async () => {
        const storyId = await createStory();
        const { body: chat } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        await send(storyId, chat.id, 'Mira, I brought the lamp oil.', 'Mira takes the oil.\n\n@Mira: Lamp first, keeper.');

        // App-wide: lamp → lantern; the Story's then turns lantern → torch, so order shows.
        await t.http.post('/api/replace-rules').send({ find: 'lamp', replace: 'lantern', ignoreCase: true }).expect(201);
        await t.http.post(`/api/stories/${storyId}/replace-rules`).send({ find: 'lantern', replace: 'torch', ignoreCase: true }).expect(201);
        // A name in a rule changes it in the text, never as a speaker's name.
        await t.http.post(`/api/stories/${storyId}/replace-rules`).send({ find: 'Mira', replace: 'the keeper-woman' }).expect(201);
        // Not on AI Messages: on my Messages only, and parked.
        await t.http.post('/api/replace-rules').send({ find: 'keeper', replace: 'warden', onAi: false, onMine: true }).expect(201);
        await t.http.post('/api/replace-rules').send({ find: 'late', replace: 'early', onAi: false }).expect(201);

        const { text } = await t.http.get(`/api/stories/${storyId}/chats/${chat.id}/transcript`).expect(200);
        expect(text).toBe(
            [
                'The Lighthouse — Chat 1',
                'The torch went out an hour ago. the keeper-woman waits by the torch.',
                "Mira: You're late, keeper. The torch won't light itself.",
                'Ash: Mira, I brought the lamp oil.',
                'the keeper-woman takes the oil.',
                'Mira: torch first, keeper.',
            ].join('\n\n') + '\n',
        );

        // What is stored never changes.
        const { messages } = await getChat(storyId, chat.id);
        expect(asText(messages)).toContain('The lamp went out an hour ago.');
        expect(asText(messages)).not.toContain('torch');
    });

    it('the next turn, Suggested replies and the Judge read the stored text', async () => {
        const storyId = await createStory();
        const { body: chat } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        await t.http.post('/api/replace-rules').send({ find: 'lamp', replace: 'lantern' }).expect(201);
        await t.http.post(`/api/stories/${storyId}/replace-rules`).send({ find: '(\\w+) went out', replace: '$1 died', regex: true }).expect(201);

        t.gateway.scriptText('suggested_replies', SUGGESTED);
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/suggestions`).expect(200);
        await send(storyId, chat.id, 'I light it.', 'The lamp flares.\n\n@Mira: Finally.');

        for (const kind of ['suggested_replies', 'turn', 'judge'] as const) {
            const [call] = t.gateway.textCalls(kind);
            expect(asText(call), kind).toContain('The lamp went out an hour ago.');
            expect(asText(call), kind).not.toContain('lantern');
            expect(asText(call), kind).not.toContain(' died');
        }
        expect(asText(t.gateway.textCalls('judge')[0])).toContain('The lamp flares.');
    });

    it('a Thai reading is made from the stored text and stays current when a rule is added', async () => {
        const storyId = await createStory();
        const { body: chat } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        await t.http.post('/api/replace-rules').send({ find: 'lamp', replace: 'lantern' }).expect(201);
        const opening = chat.messages[0] as ChatMessage;

        t.gateway.scriptText('thai_reading', 'ตะเกียงดับไปเมื่อชั่วโมงก่อน');
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${opening.id}/thai-reading`).expect(200);
        const [call] = t.gateway.textCalls('thai_reading');
        expect(asText(call)).toContain('The lamp went out');
        expect(asText(call)).not.toContain('lantern');

        await t.http.post(`/api/stories/${storyId}/replace-rules`).send({ find: 'hour', replace: 'age' }).expect(201);
        const { messages } = await getChat(storyId, chat.id);
        expect(messages[0].thaiReading).toBe('ตะเกียงดับไปเมื่อชั่วโมงก่อน');
    });
});
