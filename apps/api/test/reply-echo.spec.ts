import { withoutEchoedUserText } from '../src/manager/chat/turn/reply-parser.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * A reply that opens by saying the user's message back (seen on live 2026-11-17, Chat 2 #633):
 * that opening paragraph is dropped and the reply keeps only its own words.
 */

const USER = "I kiss Nara's forehead and ask, quietly, whether she wants me to carry her to the cart.";

describe('Reply echo (pure)', () => {
    it("drops an opening paragraph that is the user's message, read loosely, and keeps the rest of that narration", () => {
        const parts = [
            { kind: 'narration' as const, text: `${USER}\n\nNara's tail tightens around my wrist.` },
            { kind: 'speech' as const, characterId: 1, speakerName: 'Nara', text: 'Carry me.' },
        ];
        expect(withoutEchoedUserText(parts, USER)).toEqual({
            parts: [{ kind: 'narration', text: "Nara's tail tightens around my wrist." }, parts[1]],
            echoed: true,
        });
        // Asterisks, quotes, spacing and case don't hide it.
        const starred = `*I kiss Nara's  forehead* and ask, quietly, whether she wants me to carry her to the cart.`;
        expect(withoutEchoedUserText([{ kind: 'narration', text: USER.toUpperCase() }, parts[1]], starred)).toEqual({ parts: [parts[1]], echoed: true });
    });

    it('keeps a reply that only starts the same way, opens with speech, or answers a Continue', () => {
        const near = [{ kind: 'narration' as const, text: "I kiss Nara's forehead. She smiles." }];
        expect(withoutEchoedUserText(near, "I kiss Nara's forehead.")).toEqual({ parts: near, echoed: false });
        const speech = [{ kind: 'speech' as const, characterId: 1, speakerName: 'Nara', text: USER }];
        expect(withoutEchoedUserText(speech, USER)).toEqual({ parts: speech, echoed: false });
        const narration = [{ kind: 'narration' as const, text: USER }];
        expect(withoutEchoedUserText(narration, null)).toEqual({ parts: narration, echoed: false });
    });
});

describe('Reply echo: the turn (HTTP)', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    it("stores the reply without the user's message said back", async () => {
        const storyId = (await t.http.post('/api/stories').send({ title: 'The Camp' }).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A summer camp.', opening: '@Nara: Tea?' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'A traveller.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Short.' }).expect(201);
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}`).send({ characterThoughts: false }).expect(200);

        t.gateway.scriptText('turn', { text: `${USER}\n\nNara's tail tightens.\n\n@Nara: Carry me.`, model: 'glm-5.3' });
        t.gateway.scriptText('judge', JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' } }));
        t.gateway.scriptText('memory_extraction', '{"operations":[]}');
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: USER }).expect(201);
        const parts = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body.messages.at(-1).parts;
        expect(parts.map((part: { text: string }) => part.text)).toEqual(["Nara's tail tightens.", 'Carry me.']);
    });
});
