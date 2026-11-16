import { historyPartsText, spokenOnly } from '../src/manager/chat/turn/reply-parser.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Natural speech (.scratch/natural-speech/spec.md): earlier replies reach a turn's prompt with their
 * speech lines' spoken words only, so stage directions put inside speech are not copied turn after
 * turn; what is kept and shown is untouched.
 */

describe('Natural speech: speech lines as the history reads them (pure)', () => {
    it('takes asterisk asides and parenthesised directions out of a speech line, and nothing else', () => {
        expect(spokenOnly("*her voice cracking* That is not— you think my revenge is— *she stops*")).toBe('That is not— you think my revenge is—');
        expect(spokenOnly('*still not turning* I can hear you breathing.')).toBe('I can hear you breathing.');
        expect(spokenOnly('Fine (she sighs) , then.')).toBe('Fine, then.');
        expect(spokenOnly("It's, um. It's a family recipe.")).toBe("It's, um. It's a family recipe.");
        expect(spokenOnly('*nods*')).toBe('');
    });

    it('keeps narration as it is, cleans speech, and drops a line left with no words', () => {
        expect(
            historyPartsText([
                { kind: 'narration', text: 'She turns, *slowly*.' },
                { kind: 'speech', characterId: 1, speakerName: 'Nara', text: '*quietly* Right now?' },
                { kind: 'speech', characterId: 2, speakerName: 'Dulcie', text: '*grins*' },
            ]),
        ).toBe('She turns, *slowly*.\n\n@Nara: Right now?');
    });
});

describe('Natural speech: the turn (HTTP)', () => {
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

    const NO_OPS = '{"operations":[]}';
    const NO_CHANGE = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' } });

    async function settle(storyId: number, chatId: number): Promise<void> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
            const last = chat.messages.at(-1);
            if (last.judge?.status !== 'pending' && last.memory?.status !== 'pending') return;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    async function play(storyId: number, chatId: number, text: string, reply: string) {
        t.gateway.scriptText('turn', { text: reply, model: 'glm-5.3' });
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        await settle(storyId, chatId);
    }

    it('shows a reply as it was written, and gives the next turn its speech lines as spoken words only, with rules for natural talk', async () => {
        const created = await t.http.post('/api/stories').send({ title: 'The Camp' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A summer camp.', opening: '@Nara: Tea?' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'A traveller.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Short.' }).expect(201);
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body;

        await play(storyId, chat.id, 'I sneak up on Nara.', 'She does not turn.\n\n@Nara: *still not turning* I can hear you breathing.');
        const shown = (await t.http.get(`/api/stories/${storyId}/chats/${chat.id}`).expect(200)).body.messages.at(-1).parts;
        expect(shown.at(-1).text).toBe('*still not turning* I can hear you breathing.');

        await play(storyId, chat.id, 'Angry?', '@Nara: No.');
        const turn = t.gateway.textCalls('turn').at(-1)!;
        const history = turn.messages.map((message) => message.content).join('\n');
        expect(history).toContain('She does not turn.\n\n@Nara: I can hear you breathing.');
        expect(history).not.toContain('still not turning');
        const system = turn.messages[0].content;
        expect(system).toContain("They rarely name their own feelings outright, and they don't make speeches.");
        expect(system).toContain('Avoid the tics of written dialogue: lists of three');
        expect(system).toContain("bystanders don't remark on every moment, and nobody chimes in just to be funny");
        expect(turn.messages.at(-1)!.content).toContain('Keep the speech plain and natural, the way people actually talk.');
    });
});
