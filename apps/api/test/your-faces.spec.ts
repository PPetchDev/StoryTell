import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import { FACE_EMOTIONS } from '../src/model/story/emotion.js';
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

        it('Draw all draws every face that is missing, one after another, Annoyed and Thinking among them', async () => {
            const story = await storyWithRole();
            await t.http.put(`/api/stories/${story.id}/role/expressions/joy`).attach('image', png('mine'), 'mine.png').expect(200);
            for (const emotion of FACE_EMOTIONS.slice(1)) t.gateway.scriptImage('expression_image', { image: { bytes: png(`rin-${emotion}`), mimeType: 'image/png' } });

            const started = await t.http.post(`/api/stories/${story.id}/role/expression-drawing`).send({}).expect(201);
            expect(started.body.emotions).toEqual(FACE_EMOTIONS.slice(1));
            const deadline = Date.now() + 5_000;
            let status = started.body;
            while (status.running) {
                if (Date.now() > deadline) throw new Error('Draw all did not finish');
                await new Promise((resolve) => setTimeout(resolve, 25));
                status = (await t.http.get(`/api/stories/${story.id}/role/expression-drawing`).expect(200)).body;
            }
            expect(status).toMatchObject({ running: false, failed: null, drawn: FACE_EMOTIONS.slice(1) });
            const after = (await t.http.get(`/api/stories/${story.id}`).expect(200)).body as Story;
            expect(after.role.expressions).toHaveLength(FACE_EMOTIONS.length);
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

    // .scratch/stage-pictures/spec.md, "Upload a cut-out"
    it('the Role and a Persona take an uploaded see-through cut-out for an Expression they have, and refuse an opaque one', async () => {
        const seeThrough = await sharp({ create: { width: 4, height: 6, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
        const opaque = await sharp({ create: { width: 4, height: 6, channels: 3, background: { r: 9, g: 9, b: 9 } } }).png().toBuffer();
        const story = await storyWithRole();
        const role = `/api/stories/${story.id}/role/expressions/anger`;
        expect((await t.http.put(`${role}/cutout`).attach('image', seeThrough, 'cut.png').expect(404)).body.error.code).toBe('404.003.022');
        await t.http.put(role).attach('image', png('mine'), 'mine.png').expect(200);
        expect((await t.http.put(`${role}/cutout`).attach('image', opaque, 'cut.png').expect(415)).body.error.code).toBe('415.002.014');

        const withCut = (await t.http.put(`${role}/cutout`).attach('image', seeThrough, 'cut.png').expect(200)).body as Story;
        const anger = withCut.role.expressions.find((one) => one.emotion === 'anger')!;
        expect(anger.cutoutPath).toMatch(/-cutout\.png$/);
        expect(anger.imagePath).not.toBe(anger.cutoutPath);

        const persona = (await t.http.post('/api/personas').send({ name: 'Rin' }).expect(201)).body as Persona;
        await t.http.put(`/api/personas/${persona.id}/expressions/joy`).attach('image', png('mine'), 'mine.png').expect(200);
        const withPersonaCut = (await t.http.put(`/api/personas/${persona.id}/expressions/joy/cutout`).attach('image', seeThrough, 'cut.png').expect(200)).body as Persona;
        expect(withPersonaCut.expressions[0].cutoutPath).toMatch(/-cutout\.png$/);
        expect(t.gateway.imageCalls()).toEqual([]);
        const files = await filesUnder(t.imageDir);
        expect(files).toContain(anger.cutoutPath);
        expect(files).toContain(withPersonaCut.expressions[0].cutoutPath);
        await t.http.delete(`/api/personas/${persona.id}`).expect(204);
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

    describe('Annoyed and Thinking (.scratch/more-faces/spec.md)', () => {
        it('the Role, a Persona and a Character have them, listed after the first everyday faces', async () => {
            const story = await storyWithRole();
            await t.http.put(`/api/stories/${story.id}/role/expressions/thinking`).attach('image', png('hm'), 'hm.png').expect(200);
            await t.http.put(`/api/stories/${story.id}/role/expressions/teasing`).attach('image', png('sly'), 'sly.png').expect(200);
            t.gateway.scriptImage('expression_image', { image: { bytes: png('rin-annoyed'), mimeType: 'image/png' } });
            const drawn = (await t.http.post(`/api/stories/${story.id}/role/expressions/annoyed/draw`).expect(201)).body as Story;
            expect(drawn.role.expressions.map((one) => one.emotion)).toEqual(['annoyed', 'thinking', 'teasing']);
            const [call] = t.gateway.imageCalls('expression_image');
            expect(call.prompt).toContain('an unimpressed, irritated look');

            const persona = (await t.http.post('/api/personas').send({ name: 'Rin' }).expect(201)).body as Persona;
            const uploaded = (await t.http.put(`/api/personas/${persona.id}/expressions/annoyed`).attach('image', png('mine'), 'mine.png').expect(200)).body as Persona;
            expect(uploaded.expressions.map((one) => one.emotion)).toEqual(['annoyed']);

            await t.http.post(`/api/stories/${story.id}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Warm.', voice: 'Quick.' }).expect(201);
            const [mira] = ((await t.http.get(`/api/stories/${story.id}`).expect(200)).body as { characters: Array<{ id: number }> }).characters;
            const withMira = (await t.http.put(`/api/stories/${story.id}/characters/${mira.id}/expressions/annoyed`).attach('image', png('mira'), 'mira.png').expect(200)).body as { characters: Array<{ expressions: Expression[] }> };
            expect(withMira.characters[0].expressions.map((one) => one.emotion)).toEqual(['annoyed']);
        });

        it('a Message can be sent with one, the Narrator is told it, and the Judge can guess one', async () => {
            const story = await storyWithRole();
            await t.http.put(`/api/stories/${story.id}/role/expressions/annoyed`).attach('image', png('huff'), 'huff.png').expect(200);
            await t.http.patch(`/api/stories/${story.id}`).send({ setting: 'A lantern market.', opening: 'The lanterns are lit.' }).expect(200);
            await t.http.post(`/api/stories/${story.id}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Warm.', voice: 'Quick.' }).expect(201);
            const chatId = (await t.http.post(`/api/stories/${story.id}/chats`).expect(201)).body.id as number;
            const settle = async () => {
                const deadline = Date.now() + 5_000;
                for (;;) {
                    const chat = (await t.http.get(`/api/stories/${story.id}/chats/${chatId}`).expect(200)).body as { messages: Array<{ kind: string; face?: { emotion: string; by: string } | null; judge?: { status: string } | null; memory?: { status: string } | null }> };
                    const last = chat.messages.at(-1);
                    if (last && last.judge?.status !== 'pending' && last.memory?.status !== 'pending') return chat;
                    if (Date.now() > deadline) throw new Error('The judge did not settle in time');
                    await new Promise((resolve) => setTimeout(resolve, 25));
                }
            };
            const judged = (userEmotion: string) =>
                JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' }, user_emotion: userEmotion });

            t.gateway.scriptText('turn', '@Mira: Penny for them?');
            t.gateway.scriptText('judge', judged('joy'));
            t.gateway.scriptText('memory_extraction', '{"operations":[]}');
            await t.http.post(`/api/stories/${story.id}/chats/${chatId}/messages`).send({ text: 'Hm.', face: 'thinking' }).expect(201);
            let chat = await settle();
            expect(chat.messages.filter((message) => message.kind === 'user')[0].face).toEqual({ emotion: 'thinking', by: 'user' });
            expect(t.gateway.textCalls('turn')[0].messages.map((message) => message.content).join('\n')).toContain("Rin's face as they say this: thoughtful, thinking it over, eyes turned aside.");

            t.gateway.scriptText('turn', '@Mira: Oh, sulking now?');
            t.gateway.scriptText('judge', judged('annoyed'));
            t.gateway.scriptText('memory_extraction', '{"operations":[]}');
            await t.http.post(`/api/stories/${story.id}/chats/${chatId}/messages`).send({ text: 'Fine. Whatever.' }).expect(201);
            chat = await settle();
            expect(chat.messages.filter((message) => message.kind === 'user')[1].face).toEqual({ emotion: 'annoyed', by: 'judge' });
            const asked = t.gateway.textCalls('judge')[1].messages.map((message) => message.content).join('\n');
            expect(asked).toContain('"annoyed": annoyed, irritated');
            expect(asked).toContain('"thinking": thinking it over');
        });
    });

    describe("the picture's face square", () => {
        it('the Role picture keeps the square picked, a new picture goes back to the default, and none is refused without a picture', async () => {
            const bare = await storyWithRole(false);
            const refused = await t.http.put(`/api/stories/${bare.id}/role/image/crop`).send({ x: 0.2, y: 0.1, size: 0.5 }).expect(409);
            expect(refused.body.error.code).toBe('409.003.040');

            const story = await storyWithRole();
            const cropped = (await t.http.put(`/api/stories/${story.id}/role/image/crop`).send({ x: 0.2, y: 0.1, size: 0.5 }).expect(200)).body as Story & { role: { imageCrop: unknown } };
            expect(cropped.role.imageCrop).toEqual({ x: 0.2, y: 0.1, size: 0.5 });
            const reset = (await t.http.delete(`/api/stories/${story.id}/role/image/crop`).expect(200)).body as Story & { role: { imageCrop: unknown } };
            expect(reset.role.imageCrop).toBeNull();

            await t.http.put(`/api/stories/${story.id}/role/image/crop`).send({ x: 0.3, y: 0, size: 0.4 }).expect(200);
            const replaced = (await t.http.put(`/api/stories/${story.id}/role/image`).attach('image', png('rin-2'), 'rin2.png').expect(200)).body as Story & { role: { imageCrop: unknown } };
            expect(replaced.role.imageCrop).toBeNull();
        });

        it("a Persona picture's square, and the Chat answers both squares", async () => {
            const persona = (await t.http.post('/api/personas').send({ name: 'Rin' }).expect(201)).body as Persona;
            await t.http.put(`/api/personas/${persona.id}/image/crop`).send({ x: 0.1, y: 0.1, size: 0.3 }).expect(409);
            await t.http.put(`/api/personas/${persona.id}/image`).attach('image', png('rin'), 'rin.png').expect(200);
            const cropped = (await t.http.put(`/api/personas/${persona.id}/image/crop`).send({ x: 0.1, y: 0.1, size: 0.3 }).expect(200)).body as Persona & { imageCrop: unknown };
            expect(cropped.imageCrop).toEqual({ x: 0.1, y: 0.1, size: 0.3 });

            const story = await storyWithRole();
            await t.http.put(`/api/stories/${story.id}/role/image/crop`).send({ x: 0.2, y: 0.1, size: 0.5 }).expect(200);
            await t.http.patch(`/api/stories/${story.id}`).send({ setting: 'A market.', opening: 'The lanterns sway.\n\n@Mira: You came.' }).expect(200);
            await t.http.post(`/api/stories/${story.id}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Warm.', voice: 'Quick.' }).expect(201);
            const chatId = (await t.http.post(`/api/stories/${story.id}/chats`).expect(201)).body.id as number;
            const chat = (await t.http.get(`/api/stories/${story.id}/chats/${chatId}`).expect(200)).body;
            expect(chat.roleImageCrop).toEqual({ x: 0.2, y: 0.1, size: 0.5 });
            await t.http.delete(`/api/personas/${persona.id}`).expect(204);
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
