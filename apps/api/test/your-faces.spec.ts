import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { EXPRESSION_EMOTIONS } from '../src/model/story/emotion.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Your faces (.scratch/your-faces/spec.md): the Role's and a Persona's Expressions, made as a
 * Character's are, through the HTTP API with the image model scripted on the fake gateway.
 */

interface Expression {
    emotion: string;
    imagePath: string;
    crop: { x: number; y: number; size: number } | null;
    outdated: boolean;
    cutoutPath: string | null;
}

interface Story {
    id: number;
    role: { id: number; name: string; imagePath: string | null; expressions: Expression[] };
}

interface Persona {
    id: number;
    name: string;
    imagePath: string | null;
    expressions: Expression[];
}

function png(label: string): Buffer {
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(label)]);
}

async function filesUnder(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
        .sort();
}

describe('Your faces', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    beforeEach(async () => {
        for (const entry of await readdir(t.imageDir)) await rm(path.join(t.imageDir, entry), { recursive: true, force: true });
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function storyWithRole(picture = true): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title: 'The Moon Road' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Rin', description: 'A nine-tailed fox.' }).expect(200);
        if (picture) await t.http.put(`/api/stories/${storyId}/role/image`).attach('image', png('rin'), 'rin.png').expect(200);
        return (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story;
    }

    describe('on the Role', () => {
        it('draws an Expression from the Role image, cuts it out, and answers the Story', async () => {
            const story = await storyWithRole();
            t.gateway.scriptImage('expression_image', { image: { bytes: png('rin-joy'), mimeType: 'image/png' } });

            const drawn = (await t.http.post(`/api/stories/${story.id}/role/expressions/joy/draw`).expect(201)).body as Story;

            const [joy] = drawn.role.expressions;
            expect(joy).toMatchObject({ emotion: 'joy', crop: null, outdated: false });
            expect(joy.imagePath).toMatch(new RegExp(`^expressions/story-${story.id}/role-joy-[0-9a-f]+\\.png$`));
            expect(joy.cutoutPath).toMatch(/-cutout\.png$/);
            const [call] = t.gateway.imageCalls('expression_image');
            expect(call.prompt).toContain('Edit this picture of Rin, an adult.');
            expect(call.prompt).not.toContain('Appearance to keep');
            expect(call.referenceImages?.[0]).toMatchObject({ bytes: png('rin') });
            expect(await filesUnder(t.imageDir)).toEqual(expect.arrayContaining([joy.imagePath, joy.cutoutPath]));
        });

        it('refuses to draw without a Role image, before any call', async () => {
            const story = await storyWithRole(false);
            const refused = await t.http.post(`/api/stories/${story.id}/role/expressions/joy/draw`).expect(409);
            expect(refused.body.error.code).toBe('409.003.023');
            expect(t.gateway.imageCalls('expression_image')).toHaveLength(0);
        });

        it('takes an upload, its square, and its removal; a new Role image makes a drawn one outdated', async () => {
            const story = await storyWithRole();
            const uploaded = (await t.http.put(`/api/stories/${story.id}/role/expressions/anger`).attach('image', png('mine'), 'mine.png').expect(200)).body as Story;
            expect(uploaded.role.expressions).toEqual([expect.objectContaining({ emotion: 'anger', crop: null, outdated: false, cutoutPath: null })]);

            const cropped = (await t.http.put(`/api/stories/${story.id}/role/expressions/anger/crop`).send({ x: 0.1, y: 0.2, size: 0.5 }).expect(200)).body as Story;
            expect(cropped.role.expressions[0].crop).toEqual({ x: 0.1, y: 0.2, size: 0.5 });

            t.gateway.scriptImage('expression_image', { image: { bytes: png('rin-sad'), mimeType: 'image/png' } });
            await t.http.post(`/api/stories/${story.id}/role/expressions/sadness/draw`).expect(201);
            await t.http.put(`/api/stories/${story.id}/role/image`).attach('image', png('rin-2'), 'rin2.png').expect(200);
            const after = (await t.http.get(`/api/stories/${story.id}`).expect(200)).body as Story;
            expect(after.role.expressions.map((one) => [one.emotion, one.outdated])).toEqual([
                ['sadness', true],
                ['anger', false],
            ]);

            const removed = (await t.http.delete(`/api/stories/${story.id}/role/expressions/anger`).expect(200)).body as Story;
            expect(removed.role.expressions.map((one) => one.emotion)).toEqual(['sadness']);
            await t.http.delete(`/api/stories/${story.id}/role/expressions/anger`).expect(404);
        });

        it('Draw all draws every face that is missing, one after another', async () => {
            const story = await storyWithRole();
            await t.http.put(`/api/stories/${story.id}/role/expressions/joy`).attach('image', png('mine'), 'mine.png').expect(200);
            for (const emotion of EXPRESSION_EMOTIONS.slice(1)) t.gateway.scriptImage('expression_image', { image: { bytes: png(`rin-${emotion}`), mimeType: 'image/png' } });

            const started = await t.http.post(`/api/stories/${story.id}/role/expression-drawing`).send({}).expect(201);
            expect(started.body.emotions).toEqual(EXPRESSION_EMOTIONS.slice(1));
            const deadline = Date.now() + 5_000;
            let status = started.body;
            while (status.running) {
                if (Date.now() > deadline) throw new Error('Draw all did not finish');
                await new Promise((resolve) => setTimeout(resolve, 25));
                status = (await t.http.get(`/api/stories/${story.id}/role/expression-drawing`).expect(200)).body;
            }
            expect(status).toMatchObject({ running: false, failed: null, drawn: EXPRESSION_EMOTIONS.slice(1) });
            const after = (await t.http.get(`/api/stories/${story.id}`).expect(200)).body as Story;
            expect(after.role.expressions).toHaveLength(EXPRESSION_EMOTIONS.length);
        });

        it('Duplicate copies them into files of its own, and deleting a Story deletes them', async () => {
            const story = await storyWithRole();
            t.gateway.scriptImage('expression_image', { image: { bytes: png('rin-joy'), mimeType: 'image/png' } });
            await t.http.post(`/api/stories/${story.id}/role/expressions/joy/draw`).expect(201);

            const copy = (await t.http.post(`/api/stories/${story.id}/duplicate`).expect(201)).body as Story;
            const [copied] = copy.role.expressions;
            expect(copied).toMatchObject({ emotion: 'joy', outdated: false });
            expect(copied.imagePath).toMatch(new RegExp(`^expressions/story-${copy.id}/role-joy-`));
            expect(copied.cutoutPath).toMatch(new RegExp(`^expressions/story-${copy.id}/role-joy-.*-cutout\\.png$`));

            await t.http.delete(`/api/stories/${story.id}`).expect(204);
            const left = await filesUnder(t.imageDir);
            expect(left.filter((file) => file.startsWith(`expressions/story-${story.id}/`))).toEqual([]);
            expect(left).toEqual(expect.arrayContaining([copied.imagePath, copied.cutoutPath]));
        });
    });

    describe("a Message's face", () => {
        const OPENING = 'The lanterns sway.\n\n@Mira: You came.';
        const NO_OPS = '{"operations":[]}';
        const judge = (extra: Record<string, unknown> = {}) =>
            JSON.stringify({ bond_changes: [], arc_steps: [], scene: { reason: 'Not yet.', move_on: false }, ...extra });

        interface Chat {
            messages: Array<{ id: number; kind: string; face?: { emotion: string; by: string } | null; judge?: { status: string } | null; memory?: { status: string } | null }>;
            roleExpressions: Expression[];
        }

        async function chatOf(story: Story): Promise<number> {
            await t.http.patch(`/api/stories/${story.id}`).send({ setting: 'A lantern market.', opening: OPENING }).expect(200);
            await t.http.post(`/api/stories/${story.id}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Warm.', voice: 'Quick.' }).expect(201);
            return (await t.http.post(`/api/stories/${story.id}/chats`).expect(201)).body.id as number;
        }

        async function settled(storyId: number, chatId: number): Promise<Chat> {
            const deadline = Date.now() + 5_000;
            for (;;) {
                const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as Chat;
                const last = chat.messages.at(-1);
                if (last && last.judge?.status !== 'pending' && last.memory?.status !== 'pending') return chat;
                if (Date.now() > deadline) throw new Error('The judge did not settle in time');
                await new Promise((resolve) => setTimeout(resolve, 25));
            }
        }

        it('a picked face is kept on the Message and told to the Narrator, and the Judge is not asked', async () => {
            const story = await storyWithRole();
            await t.http.put(`/api/stories/${story.id}/role/expressions/embarrassment`).attach('image', png('blush'), 'blush.png').expect(200);
            const chatId = await chatOf(story);
            t.gateway.scriptText('turn', '@Mira: You are blushing.');
            t.gateway.scriptText('judge', judge({ user_emotion: 'anger' }));
            t.gateway.scriptText('memory_extraction', NO_OPS);

            await t.http.post(`/api/stories/${story.id}/chats/${chatId}/messages`).send({ text: 'Hello.', face: 'embarrassment' }).expect(201);
            const chat = await settled(story.id, chatId);

            const user = chat.messages.find((message) => message.kind === 'user')!;
            expect(user.face).toEqual({ emotion: 'embarrassment', by: 'user' });
            expect(chat.roleExpressions.map((one) => one.emotion)).toEqual(['embarrassment']);
            const turn = t.gateway.textCalls('turn')[0].messages.map((message) => message.content).join('\n');
            expect(turn).toContain("Rin's face as they say this: embarrassed and shy, blushing, looking away.");
            const asked = t.gateway.textCalls('judge')[0].messages.map((message) => message.content).join('\n');
            expect(asked).not.toContain('user_emotion');
        });

        it('without a face, the Judge guesses one where the Role has Expressions; never where it has none', async () => {
            const story = await storyWithRole();
            const chatId = await chatOf(story);
            t.gateway.scriptText('turn', '@Mira: Hm.');
            t.gateway.scriptText('judge', judge({ user_emotion: 'joy' }));
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.post(`/api/stories/${story.id}/chats/${chatId}/messages`).send({ text: 'I grin.' }).expect(201);
            let chat = await settled(story.id, chatId);
            expect(chat.messages.find((message) => message.kind === 'user')!.face).toBeNull();
            expect(t.gateway.textCalls('judge')[0].messages.map((message) => message.content).join('\n')).not.toContain('user_emotion');
            expect(t.gateway.textCalls('turn')[0].messages.map((message) => message.content).join('\n')).not.toContain("face as they say this");

            await t.http.put(`/api/stories/${story.id}/role/expressions/joy`).attach('image', png('smile'), 'smile.png').expect(200);
            t.gateway.scriptText('turn', '@Mira: You look pleased.');
            t.gateway.scriptText('judge', judge({ user_emotion: 'joy' }));
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.post(`/api/stories/${story.id}/chats/${chatId}/messages`).send({ text: 'I grin again.' }).expect(201);
            chat = await settled(story.id, chatId);

            const second = chat.messages.filter((message) => message.kind === 'user')[1];
            expect(second.face).toEqual({ emotion: 'joy', by: 'judge' });
            const [system, user] = t.gateway.textCalls('judge')[1].messages;
            expect(system.content).toContain('"user_emotion":"neutral"');
            expect(user.content).toContain("# Rin's face");
            // A guessed face is never told to the Narrator.
            expect(t.gateway.textCalls('turn')[1].messages.map((message) => message.content).join('\n')).not.toContain('face as they say this');
        });
    });

    describe('on a Persona', () => {
        it('draws and uploads as the Role does, answers the Persona, and goes with it', async () => {
            const persona = (await t.http.post('/api/personas').send({ name: 'Rin' }).expect(201)).body as Persona;
            const refused = await t.http.post(`/api/personas/${persona.id}/expressions/love/draw`).expect(409);
            expect(refused.body.error.code).toBe('409.003.023');

            await t.http.put(`/api/personas/${persona.id}/image`).attach('image', png('rin'), 'rin.png').expect(200);
            t.gateway.scriptImage('expression_image', { image: { bytes: png('rin-love'), mimeType: 'image/png' } });
            const drawn = (await t.http.post(`/api/personas/${persona.id}/expressions/love/draw`).expect(201)).body as Persona;
            expect(drawn.expressions).toEqual([expect.objectContaining({ emotion: 'love', outdated: false })]);
            expect(drawn.expressions[0].imagePath).toMatch(new RegExp(`^personas/persona-${persona.id}/expression-love-`));

            const listed = (await t.http.get('/api/personas').expect(200)).body as { personas: Persona[] };
            expect(listed.personas.find((one) => one.id === persona.id)?.expressions).toHaveLength(1);

            await t.http.delete(`/api/personas/${persona.id}`).expect(204);
            expect((await filesUnder(t.imageDir)).filter((file) => file.startsWith(`personas/persona-${persona.id}/`))).toEqual([]);
        });
    });
});
