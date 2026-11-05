import { transcriptFileNames } from '../src/manager/chat/transcript.js';
import { startTestApp, TestApp } from './harness/test-app.js';

const OPENING = `The lamp went out an hour ago.

@Mira: You're late. Boots off, keeper.

She doesn't look up from the logbook.`;

const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';

// Spec: "Download a Chat as text". The Chat as a plain .txt file, every Message in order.
describe('Chat transcript', () => {
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

    async function createStory(title: string): Promise<number> {
        const created = await t.http.post('/api/stories').send({ title }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse, 1890s.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.' })
            .expect(201);
        return storyId;
    }

    /** Sends one turn and waits until its background calls have settled. */
    async function send(storyId: number, chatId: number, text: string, reply: string): Promise<void> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        const deadline = Date.now() + 5_000;
        for (;;) {
            const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200);
            const last = body.messages[body.messages.length - 1];
            if (last.kind === 'ai' && last.judge?.status !== 'pending' && last.memory?.status !== 'pending') return;
            if (Date.now() > deadline) throw new Error('The turn did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    it('answers the Chat as text: a title line, then every Message in order, as a download', async () => {
        const storyId = await createStory('The Lighthouse');
        const { body: chat } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        await send(storyId, chat.id, 'I set my bag down. "Sorry. The ferry."', 'Mira snorts.\n\n@Mira: The ferry. Of course.');

        const response = await t.http.get(`/api/stories/${storyId}/chats/${chat.id}/transcript`).expect(200);

        expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
        expect(response.headers['content-disposition']).toBe(
            `attachment; filename="the-lighthouse-chat-1.txt"; filename*=UTF-8''The%20Lighthouse%20-%20Chat%201.txt`,
        );
        expect(response.text).toBe(
            [
                'The Lighthouse — Chat 1',
                '',
                'The lamp went out an hour ago.',
                '',
                "Mira: You're late. Boots off, keeper.",
                '',
                "She doesn't look up from the logbook.",
                '',
                'Ash: I set my bag down. "Sorry. The ferry."',
                '',
                'Mira snorts.',
                '',
                'Mira: The ferry. Of course.',
                '',
            ].join('\n'),
        );
    });

    it('names the user lines by the identity worn when each was sent', async () => {
        const storyId = await createStory('Swap');
        const { body: chat } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        const { body: persona } = await t.http
            .post('/api/personas')
            .send({ name: 'Rook', description: 'A drifter.' })
            .expect(201);
        await send(storyId, chat.id, 'Hello.', '@Mira: Hm.');
        await t.http.put(`/api/stories/${storyId}/chats/${chat.id}/identity`).send({ personaId: persona.id }).expect(200);
        await send(storyId, chat.id, 'Evening.', '@Mira: Who are you?');

        const { text } = await t.http.get(`/api/stories/${storyId}/chats/${chat.id}/transcript`).expect(200);

        expect(text).toContain('Ash: Hello.\n\nMira: Hm.\n\nRook: Evening.\n\nMira: Who are you?\n');
    });

    it('keeps the titles as they are in filename*, with an ASCII slug in filename', async () => {
        const storyId = await createStory('Café: Noir');
        const { body: chat } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        await t.http.patch(`/api/stories/${storyId}/chats/${chat.id}`).send({ title: "Night's end" }).expect(200);

        const response = await t.http.get(`/api/stories/${storyId}/chats/${chat.id}/transcript`).expect(200);

        expect(response.headers['content-disposition']).toBe(
            `attachment; filename="cafe-noir-night-s-end.txt"; filename*=UTF-8''Caf%C3%A9%20Noir%20-%20Night%27s%20end.txt`,
        );
        expect(response.text.split('\n')[0]).toBe("Café: Noir — Night's end");
    });

    it('names the file after the Chat id when the titles have no Latin letters', () => {
        // The test database can't store Thai (it is WIN1252), so this one reads the names directly.
        expect(transcriptFileNames('ประภาคาร', 'คืนแรก', 12)).toEqual({ fileName: 'ประภาคาร - คืนแรก.txt', asciiFileName: 'chat-12.txt' });
        expect(transcriptFileNames('A/B', 'C?', 3)).toEqual({ fileName: 'AB - C.txt', asciiFileName: 'a-b-c.txt' });
    });

    it('answers 404 for a Chat of another Story', async () => {
        const storyId = await createStory('One');
        const otherId = await createStory('Two');
        const { body: chat } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);

        const { body } = await t.http.get(`/api/stories/${otherId}/chats/${chat.id}/transcript`).expect(404);

        expect(body.error.code).toBe('404.004.001');
    });
});
