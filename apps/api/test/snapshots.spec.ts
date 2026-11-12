import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

import { ModelRefusalError, OutOfCreditError } from '../src/errors/model-gateway.errors.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { TEST_KEYS } from './harness/gateway-under-test.js';
import { fixture, RecordedRequest } from './harness/recorded-fetch.js';
import { takeSnapshot } from './harness/snapshot.js';
import { startTestApp, TestApp } from './harness/test-app.js';

interface Message {
    id: number;
    kind: 'user' | 'ai';
    judge?: { status: string } | null;
    memory?: { status: string } | null;
}

interface Chat {
    id: number;
    storyId: number;
    title: string;
    messages: Message[];
    imageCreditOut: boolean;
    textCreditOut: boolean;
}

interface Story {
    id: number;
    characters: Array<{ id: number; name: string; appearance: string; referenceImagePath: string | null }>;
}

interface Snapshot {
    id: number;
    storyId: number;
    chatId: number | null;
    messageId: number | null;
    imagePath: string;
    prompt: string;
    hint: string;
    imageModel: string;
    costUsd: number;
    characters: Array<{ characterId: number | null; name: string }>;
    createdAt: string;
    chatTitle?: string | null;
}

interface Job {
    id: string;
    chatId: number;
    messageId: number;
    hint: string;
    status: 'pending' | 'failed';
    error: { code: string; message: string } | null;
}

interface ChatSnapshots {
    snapshots: Snapshot[];
    jobs: Job[];
}

interface SnapshotPrompt {
    id: string;
    chatId: number;
    messageId: number;
    hint: string;
    text: string;
    inFrame: Array<{ characterId: number; name: string }>;
    imagePrompt: string;
}

const OPENING = `Rain hammers the gallery windows.

@Mira: You're late. Boots off, keeper.`;

const CAST = [
    {
        name: 'Mira',
        appearance: 'Tall, grey-green eyes, black hair tied back, a faint old scar through one eyebrow.',
        personality: 'Guarded and dry.',
        voice: 'Short sentences.',
    },
    {
        name: "Kai O'Rourke",
        appearance: 'Wiry, sunburnt, a gold tooth, red curls.',
        personality: 'Cheerful, nosy.',
        voice: 'Rambling.',
    },
    {
        name: 'Tamsin',
        appearance: 'Short, freckled, a shaved head, a brass earring.',
        personality: 'Quiet.',
        voice: 'Whispers.',
    },
    {
        name: 'Bo',
        appearance: 'Broad, grey-bearded, a missing left ear.',
        personality: 'Gruff.',
        voice: 'Grunts.',
    },
];

const MIRA_REFERENCE = Buffer.from('mira-reference-jpeg-bytes');
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';

/** What the prompt writer answers: who is in frame and the scene. */
function written(inFrame: string[], scene = 'Mira stands at the rain-streaked window in a wet oilskin coat, lamp in hand.', pieces?: Record<string, string>): string {
    return JSON.stringify({ in_frame: inFrame, scene, ...(pieces === undefined ? {} : { pieces }) });
}

function image(text: string) {
    return { image: { bytes: Buffer.from(text), mimeType: 'image/jpeg' }, model: 'seedream-v4-edit', costUsd: 0.05 };
}

async function filesUnder(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
        .sort();
}

describe('Snapshots and the Gallery', () => {
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

    /** A playable Story with four Characters; Mira alone has a Reference image. */
    async function createStory(imageStyle = 'ink wash, muted'): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse', imageStyle }).expect(201);
        const storyId = created.body.id as number;
        await t.http
            .patch(`/api/stories/${storyId}`)
            .send({ setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING })
            .expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper, a former sailor.' }).expect(200);
        for (const character of CAST) {
            await t.http.post(`/api/stories/${storyId}/characters`).send(character).expect(201);
        }
        const { body } = await t.http.get(`/api/stories/${storyId}`).expect(200);
        const mira = (body as Story).characters[0];

        t.gateway.scriptImage('reference_image', ...[1, 2, 3].map(() => ({ image: { bytes: MIRA_REFERENCE, mimeType: 'image/jpeg' } })));
        const round = await t.http.post(`/api/stories/${storyId}/characters/${mira.id}/reference-image/candidates`).expect(201);
        const picked = await t.http
            .put(`/api/stories/${storyId}/characters/${mira.id}/reference-image`)
            .send({ candidateId: round.body.candidates[0].id })
            .expect(200);
        t.gateway.reset();
        return picked.body as Story;
    }

    async function createChat(storyId: number): Promise<Chat> {
        const { body } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        return body as Chat;
    }

    async function getChat(storyId: number, chatId: number): Promise<Chat> {
        const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200);
        return body as Chat;
    }

    /** One turn whose background calls change nothing; returns once both settled. */
    async function play(storyId: number, chatId: number, text: string, reply: string): Promise<Chat> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = await getChat(storyId, chatId);
            const last = chat.messages.at(-1)!;
            if (last.judge?.status !== 'pending' && last.memory?.status !== 'pending') return chat;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    function snapshotsPath(storyId: number, chatId: number): string {
        return `/api/stories/${storyId}/chats/${chatId}/snapshots`;
    }

    async function chatSnapshots(storyId: number, chatId: number): Promise<ChatSnapshots> {
        const { body } = await t.http.get(snapshotsPath(storyId, chatId)).expect(200);
        return body as ChatSnapshots;
    }

    /** Polls until no job of the Chat is pending. */
    async function settled(storyId: number, chatId: number): Promise<ChatSnapshots> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const state = await chatSnapshots(storyId, chatId);
            if (state.jobs.every((job) => job.status !== 'pending')) return state;
            if (Date.now() > deadline) throw new Error('The Snapshot job did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    function promptsPath(storyId: number, chatId: number): string {
        return `/api/stories/${storyId}/chats/${chatId}/snapshot-prompts`;
    }

    /** Writes a Snapshot prompt (the sheet's first step) with the given writer reply. */
    async function writePrompt(
        storyId: number,
        chatId: number,
        options: { hint?: string; inFrame?: string[]; scene?: string; pieces?: Record<string, string>; messageId?: number } = {},
    ): Promise<SnapshotPrompt> {
        t.gateway.scriptText('snapshot_prompt', written(options.inFrame ?? ['Mira'], options.scene, options.pieces));
        const { body } = await t.http
            .post(promptsPath(storyId, chatId))
            .send({ hint: options.hint, messageId: options.messageId })
            .expect(201);
        return body as SnapshotPrompt;
    }

    /** Draws a written Snapshot prompt (the sheet's Draw Snapshot), as written unless `text` is given. */
    async function draw(storyId: number, chatId: number, prompt: SnapshotPrompt, text = prompt.text): Promise<Job> {
        const { body } = await t.http.post(snapshotsPath(storyId, chatId)).send({ promptId: prompt.id, text }).expect(202);
        return body as Job;
    }

    /** Takes one Snapshot with the given writer reply and image, both steps, and waits for it. */
    async function snap(
        storyId: number,
        chatId: number,
        options: { hint?: string; inFrame?: string[]; scene?: string; pieces?: Record<string, string>; bytes?: string; messageId?: number } = {},
    ): Promise<ChatSnapshots> {
        const prompt = await writePrompt(storyId, chatId, options);
        t.gateway.scriptImage('snapshot_image', image(options.bytes ?? 'snapshot-jpeg-bytes'));
        const job = await draw(storyId, chatId, prompt);
        expect(job).toMatchObject({ status: 'pending', chatId, error: null });
        return settled(storyId, chatId);
    }

    async function gallery(storyId: number, chatId?: number): Promise<Snapshot[]> {
        const { body } = await t.http.get(`/api/stories/${storyId}/gallery${chatId ? `?chatId=${chatId}` : ''}`).expect(200);
        return body.snapshots as Snapshot[];
    }

    async function sql(text: string, params: unknown[] = []): Promise<any[]> {
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        try {
            return (await client.query(text, params)).rows;
        } finally {
            await client.end();
        }
    }

    describe('Taking a Snapshot', () => {
        it('writes the prompt from the latest Messages, Appearance, Setting, Memory and Image style, and stores the record and file with at most 3 Characters', async () => {
            const story = await createStory();
            const [mira, kai, tamsin] = story.characters;
            const chat = await createChat(story.id);
            const memoryPath = `/api/stories/${story.id}/chats/${chat.id}/memories`;
            await t.http.post(memoryPath).send({ text: '{user} gave Mira a silver ring.', knownBy: [mira.id] }).expect(201);
            await t.http.post(memoryPath).send({ text: 'Mira cut her hair short.', knownBy: [mira.id] }).expect(201);
            await sql(`UPDATE "memory" SET "archived" = true WHERE "text" = 'Mira cut her hair short.'`);
            const played = await play(story.id, chat.id, 'I hang my coat by the stove.', '@Mira: Took you long enough.\n\nShe sets the lamp down.');
            const reply = played.messages.at(-1)!;

            const state = await snap(story.id, chat.id, { inFrame: ['Mira', "kai o'rourke", 'Tamsin', 'Bo', 'Nobody'] });

            expect(state.jobs).toEqual([]);
            expect(state.snapshots).toHaveLength(1);
            const snapshot = state.snapshots[0];
            expect(snapshot).toMatchObject({
                storyId: story.id,
                chatId: chat.id,
                messageId: reply.id,
                hint: '',
                imageModel: 'seedream-v4-edit',
                costUsd: 0.05,
            });
            // At most 3, in the writer's order, with canonical names; a name outside the cast is dropped.
            expect(snapshot.characters).toEqual([
                { characterId: mira.id, name: 'Mira' },
                { characterId: kai.id, name: "Kai O'Rourke" },
                { characterId: tamsin.id, name: 'Tamsin' },
            ]);
            expect(snapshot.imagePath).toMatch(new RegExp(`^snapshots/story-${story.id}/chat-${chat.id}-[0-9a-f]+\\.jpg$`));
            expect(await readFile(path.join(t.imageDir, ...snapshot.imagePath.split('/')), 'utf8')).toBe('snapshot-jpeg-bytes');
            const served = await t.http.get(`/api/images/${snapshot.imagePath}`).expect(200);
            expect(served.headers['content-type']).toBe('image/jpeg');

            // The prompt writer: one V4 Flash call in JSON mode, from everything the spec lists.
            const [writer] = t.gateway.textCalls('snapshot_prompt');
            expect(writer).toMatchObject({ json: true, servedFor: { storyId: story.id, chatId: chat.id } });
            const asked = writer.messages.map((message) => message.content).join('\n');
            expect(asked).toContain('seen through the eyes of Ash');
            expect(asked).toContain('Never show Ash');
            expect(asked).toContain('at most 3');
            expect(asked).toContain('fictional adult');
            expect(asked).toContain('A lighthouse on a storm-cut island, 1890s.');
            expect(asked).toContain(CAST[0].appearance);
            expect(asked).toContain(CAST[3].appearance);
            expect(asked).toContain('Ash gave Mira a silver ring.');
            expect(asked).not.toContain('Mira cut her hair short.');
            expect(asked).toContain('I hang my coat by the stove.');
            expect(asked).toContain('@Mira: Took you long enough.');
            expect(asked).toContain("You're late. Boots off, keeper.");
            // The layout, the light and a candid pose are asked for (a second door and stiff poses, seen 2026-11-05).
            expect(asked).toContain('which way the camera looks');
            expect(asked).toContain('frames the view or is behind the camera; never draw a second one');
            expect(asked).toContain('The art style, in pieces:\n- ink wash\n- muted');
            expect(asked).toContain('A piece that names any of those is never "drawing", even when it suits this moment');
            expect(asked).toContain('the time of day');
            expect(asked).toContain('natural, candid pose');

            // The image call: the stored prompt, Mira's Reference image only, the in-frame traits restated.
            const [call] = t.gateway.imageCalls('snapshot_image');
            expect(call.prompt).toBe(snapshot.prompt);
            expect(call.servedFor).toEqual({ storyId: story.id, chatId: chat.id });
            expect(call.referenceImages?.map((ref) => ref.bytes.toString())).toEqual([MIRA_REFERENCE.toString()]);
            expect(snapshot.prompt).toContain('First-person view through the eyes of Ash');
            expect(snapshot.prompt).toContain('Mira stands at the rain-streaked window in a wet oilskin coat');
            expect(snapshot.prompt).toContain(`- Mira, the same person as in reference image 1, with the same face, hair, build and art style, in the pose and clothing the scene gives (never the reference image's pose, clothing, framing or plain background), drawn as a grown adult with an adult face and adult body proportions. Appearance: ${CAST[0].appearance}`);
            expect(snapshot.prompt).toContain(`- Kai O'Rourke, drawn as a grown adult with an adult face and adult body proportions. Appearance: ${CAST[1].appearance}`);
            expect(snapshot.prompt).toContain(`- Tamsin, drawn as a grown adult with an adult face and adult body proportions. Appearance: ${CAST[2].appearance}`);
            expect(snapshot.prompt).not.toContain(CAST[3].appearance);
            expect(snapshot.prompt).toContain('The art style below sets only how the image is drawn; the place, the time of day and the light come from the scene above.\nArt style: ink wash, muted.');
            expect(snapshot.prompt).toContain('Only fictional adults.');
            expect(snapshot.prompt).not.toContain('The user asked for this image');

            const items = await gallery(story.id);
            expect(items).toEqual([{ ...snapshot, chatTitle: chat.title }]);
            expect(await t.http.get(`/api/stories/${story.id}/snapshots/${snapshot.id}`).expect(200)).toHaveProperty('body.prompt', snapshot.prompt);
        });

        it("draws the hint's Characters, whatever the writer picked", async () => {
            const story = await createStory();
            const [mira, , , bo] = story.characters;
            const chat = await createChat(story.id);

            const state = await snap(story.id, chat.id, { hint: 'close-up on BO, with Mira behind him', inFrame: ["Kai O'Rourke", 'Tamsin'] });

            expect(state.snapshots[0].hint).toBe('close-up on BO, with Mira behind him');
            expect(state.snapshots[0].characters).toEqual([
                { characterId: bo.id, name: 'Bo' },
                { characterId: mira.id, name: 'Mira' },
            ]);
            const asked = t.gateway.textCalls('snapshot_prompt')[0].messages.map((message) => message.content).join('\n');
            expect(asked).toContain("The user's hint for this image, which you follow: close-up on BO, with Mira behind him");
            expect(asked).toContain('"in_frame" must be exactly ["Bo","Mira"]');
            // The image model reads the hint too, so what the writer lets slip is still drawn.
            expect(state.snapshots[0].prompt).toContain(
                'The user asked for this image: close-up on BO, with Mira behind him. Where the scene above differs, follow this.',
            );
            // Bo has no Reference image, so Mira's is reference image 1.
            expect(state.snapshots[0].prompt).toContain(`- Bo, drawn as a grown adult with an adult face and adult body proportions. Appearance: ${CAST[3].appearance}`);
            expect(state.snapshots[0].prompt).toContain('- Mira, the same person as in reference image 1');
            expect(t.gateway.imageCalls('snapshot_image')[0].referenceImages).toHaveLength(1);
        });

        it('draws a frame with no Reference image from text alone, sending no references', async () => {
            const story = await createStory('');
            const chat = await createChat(story.id);

            const state = await snap(story.id, chat.id, { inFrame: ['Tamsin'] });

            expect(state.snapshots[0].characters.map((c) => c.name)).toEqual(['Tamsin']);
            expect(t.gateway.imageCalls('snapshot_image')[0].referenceImages).toEqual([]);
            expect(state.snapshots[0].prompt).toContain('Art style: realistic, natural lighting.');
        });

        it("draws in only the art style pieces the writer labelled drawing, so a place or light in the Story's style never overrides the scene", async () => {
            const story = await createStory('Warm anime illustration, golden-hour light over open grassland, felt tents, soft painterly colour');
            const chat = await createChat(story.id);

            const state = await snap(story.id, chat.id, {
                pieces: {
                    'warm anime illustration': 'Drawing',
                    'golden-hour light over open grassland': 'light',
                    'felt tents': 'object',
                    'soft painterly colour': 'drawing',
                },
            });

            const asked = t.gateway.textCalls('snapshot_prompt')[0].messages.map((message) => message.content).join('\n');
            expect(asked).toContain('- Warm anime illustration\n- golden-hour light over open grassland\n- felt tents\n- soft painterly colour');
            // The reply template lists the Story's own pieces, so the writer has none to copy.
            expect(asked).toContain(
                '{"pieces":{"Warm anime illustration":"?","golden-hour light over open grassland":"?","felt tents":"?","soft painterly colour":"?"},',
            );
            expect(state.snapshots[0].prompt).toContain('Art style: Warm anime illustration, soft painterly colour.');
            expect(state.snapshots[0].prompt).not.toContain('grassland');
        });

        it.each([
            ['no labels', undefined],
            ['empty labels', {}],
            ['no piece labelled drawing', { 'Warm anime illustration': 'style', 'golden-hour light over open grassland': 'light' }],
            ['labels for pieces the style does not have', { 'oil painting': 'drawing' }],
        ])('keeps the whole art style when the writer gives %s', async (_, pieces) => {
            const story = await createStory('Warm anime illustration, golden-hour light over open grassland');
            const chat = await createChat(story.id);

            const state = await snap(story.id, chat.id, { pieces });

            expect(state.snapshots[0].prompt).toContain('Art style: Warm anime illustration, golden-hour light over open grassland.');
        });

        it('keeps a failure out of the store and shows it with Retry, which then stores the Snapshot', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const prompt = await writePrompt(story.id, chat.id, { hint: 'by the lamp' });
            // The try and its automatic retry (.scratch/background-retry/spec.md).
            t.gateway.scriptImage('snapshot_image', new ModelRefusalError('blurred'), new ModelRefusalError('Venice returned the image blurred.'));

            await draw(story.id, chat.id, prompt, 'Mira by the lamp, edited.');
            const failed = await settled(story.id, chat.id);

            expect(failed.snapshots).toEqual([]);
            expect(failed.jobs).toMatchObject([
                { status: 'failed', hint: 'by the lamp', messageId: chat.messages[0].id, error: { code: '422.001.002', message: 'Venice returned the image blurred.' } },
            ]);
            expect(await gallery(story.id)).toEqual([]);
            expect(await filesUnder(path.join(t.imageDir, 'snapshots', `story-${story.id}`))).toEqual([]);
            expect(await sql(`SELECT * FROM "snapshot" WHERE "story_id" = $1`, [story.id])).toEqual([]);

            // Retry runs the same job: the same Message, hint and approved Snapshot prompt, drawn again
            // without writing it again, never by another provider.
            t.gateway.scriptImage('snapshot_image', image('retried'));
            const jobId = failed.jobs[0].id;
            const retried = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/snapshot-jobs/${jobId}/retry`).expect(202);
            expect(retried.body).toMatchObject({ id: jobId, status: 'pending', error: null });
            const done = await settled(story.id, chat.id);
            expect(done.jobs).toEqual([]);
            expect(done.snapshots).toMatchObject([{ hint: 'by the lamp', messageId: chat.messages[0].id }]);
            expect(t.gateway.textCalls('snapshot_prompt')).toHaveLength(1);
            const drawn = t.gateway.imageCalls('snapshot_image').map((call) => call.prompt);
            expect(drawn).toHaveLength(3);
            expect(new Set(drawn)).toEqual(new Set([done.snapshots[0].prompt]));
            expect(done.snapshots[0].prompt).toContain('Mira by the lamp, edited.');

            // A Retry of a job that is gone answers 404.
            const gone = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/snapshot-jobs/${jobId}/retry`).expect(404);
            expect(gone.body.error.code).toBe('404.002.006');
        });

        it('fails to write an unreadable Snapshot prompt at once, with nothing held and no image call', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            t.gateway.scriptText('snapshot_prompt', 'A woman by a window.');

            const refused = await t.http.post(promptsPath(story.id, chat.id)).send({}).expect(502);

            expect(refused.body.error.code).toBe('502.001.005');
            expect(t.gateway.imageCalls()).toEqual([]);
            expect(await chatSnapshots(story.id, chat.id)).toEqual({ snapshots: [], jobs: [] });
        });

        it('lets a failed job be dismissed', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const prompt = await writePrompt(story.id, chat.id);
            t.gateway.scriptImage('snapshot_image', new ModelRefusalError('blurred'), new ModelRefusalError('blurred'));

            await draw(story.id, chat.id, prompt);
            const failed = await settled(story.id, chat.id);

            expect(failed.jobs).toMatchObject([{ status: 'failed', error: { code: '422.001.002' } }]);
            await t.http.delete(`/api/stories/${story.id}/chats/${chat.id}/snapshot-jobs/${failed.jobs[0].id}`).expect(204);
            expect(await chatSnapshots(story.id, chat.id)).toEqual({ snapshots: [], jobs: [] });
        });

        it('adds retakes to the same Message, and a retake can name an earlier AI Message', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const opening = chat.messages[0];

            await snap(story.id, chat.id, { bytes: 'first' });
            const two = await snap(story.id, chat.id, { bytes: 'second', hint: 'closer' });
            expect(two.snapshots.map((s) => [s.messageId, s.hint])).toEqual([
                [opening.id, ''],
                [opening.id, 'closer'],
            ]);

            const played = await play(story.id, chat.id, 'Hello.', 'She nods.');
            const reply = played.messages.at(-1)!;
            await snap(story.id, chat.id);
            const retake = await snap(story.id, chat.id, { messageId: opening.id, bytes: 'third' });
            expect(retake.snapshots.map((s) => s.messageId)).toEqual([opening.id, opening.id, reply.id, opening.id]);
            // The retake of the Opening is written from the Messages up to it, not after.
            const asked = t.gateway.textCalls('snapshot_prompt').at(-1)!.messages.map((message) => message.content).join('\n');
            expect(asked).not.toContain('She nods.');

            // Only AI Messages of this Chat can be photographed.
            const user = played.messages.find((message) => message.kind === 'user')!;
            const refused = await t.http.post(promptsPath(story.id, chat.id)).send({ messageId: user.id }).expect(404);
            expect(refused.body.error.code).toBe('404.004.006');
        });

        it('lets play go on while the image is made', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            let release!: () => void;
            const gate = new Promise<void>((resolve) => (release = resolve));
            const generate = t.gateway.generateImage.bind(t.gateway);
            t.gateway.generateImage = async (request) => {
                await gate;
                return generate(request);
            };
            try {
                const prompt = await writePrompt(story.id, chat.id);
                t.gateway.scriptImage('snapshot_image', image('slow'));
                await draw(story.id, chat.id, prompt);
                expect((await chatSnapshots(story.id, chat.id)).jobs).toMatchObject([{ status: 'pending', messageId: chat.messages[0].id }]);

                const played = await play(story.id, chat.id, 'I wait.', 'The rain goes on.');
                expect(played.messages).toHaveLength(3);
            } finally {
                release();
                delete (t.gateway as { generateImage?: unknown }).generateImage;
            }
            const done = await settled(story.id, chat.id);
            expect(done.jobs).toEqual([]);
            expect(done.snapshots).toMatchObject([{ messageId: chat.messages[0].id }]);
        });

        it('gives the writer the Lore the moment and the hint bring up, and leaves the rest out', async () => {
            const story = await createStory();
            const lore = `/api/stories/${story.id}/lore`;
            await t.http.post(lore).send({ name: 'The lamp room', keywords: ['lamp'], text: 'A glass drum ringed by brass rails.' }).expect(201);
            await t.http.post(lore).send({ name: 'The cellar', text: 'Barrels of oil, cold and dark.' }).expect(201);
            await t.http.post(lore).send({ name: 'Island law', text: 'No one leaves before the boat.', alwaysOn: true }).expect(201);
            await t.http.post(lore).send({ name: 'The pier', text: 'Black planks slick with weed.' }).expect(201);
            const chat = await createChat(story.id);
            await play(story.id, chat.id, 'I climb to the lamp.', '@Mira: Mind the rail.');

            await snap(story.id, chat.id, { hint: 'from the pier' });

            const asked = t.gateway.textCalls('snapshot_prompt')[0].messages.map((message) => message.content).join('\n');
            expect(asked).toContain('Lore this moment brings up');
            expect(asked).toContain('A glass drum ringed by brass rails.');
            expect(asked).toContain('No one leaves before the boat.');
            expect(asked).toContain('Black planks slick with weed.');
            expect(asked).not.toContain('Barrels of oil');
        });
    });

    describe('Reading the Snapshot prompt before drawing', () => {
        it('writes the Snapshot prompt with no image call, and answers it, who is in frame and the whole image prompt', async () => {
            const story = await createStory();
            const [mira, , , bo] = story.characters;
            const chat = await createChat(story.id);

            const prompt = await writePrompt(story.id, chat.id, { hint: 'Bo and Mira by the stove', inFrame: ['Tamsin'], scene: 'Bo warms his hands; Mira leans on the stove.' });

            expect(prompt).toMatchObject({
                chatId: chat.id,
                messageId: chat.messages[0].id,
                hint: 'Bo and Mira by the stove',
                text: 'Bo warms his hands; Mira leans on the stove.',
                inFrame: [
                    { characterId: bo.id, name: 'Bo' },
                    { characterId: mira.id, name: 'Mira' },
                ],
            });
            expect(prompt.id).toMatch(/^[0-9a-f]{16}$/);
            // The image prompt it would be drawn with: the text, with the fixed rules around it.
            expect(prompt.imagePrompt).toContain('First-person view through the eyes of Ash');
            expect(prompt.imagePrompt).toContain('Bo warms his hands; Mira leans on the stove.');
            expect(prompt.imagePrompt).toContain(`Appearance: ${CAST[3].appearance}`);
            expect(prompt.imagePrompt).toContain('- Mira, the same person as in reference image 1');
            expect(prompt.imagePrompt).toContain('Art style: ink wash, muted.');
            expect(prompt.imagePrompt).toContain('Only fictional adults.');
            // Nothing is drawn or stored, and no job shows, until Draw.
            expect(t.gateway.textCalls('snapshot_prompt')).toHaveLength(1);
            expect(t.gateway.imageCalls()).toEqual([]);
            expect(await chatSnapshots(story.id, chat.id)).toEqual({ snapshots: [], jobs: [] });
            expect(await gallery(story.id)).toEqual([]);
        });

        it('draws the edited text with no second writer call, and stores the image prompt it sent', async () => {
            const story = await createStory();
            const [mira] = story.characters;
            const chat = await createChat(story.id);
            const prompt = await writePrompt(story.id, chat.id, { hint: 'by the lamp', scene: 'Mira turns her back to the window.' });
            t.gateway.scriptImage('snapshot_image', image('edited'));

            const job = await draw(story.id, chat.id, prompt, '  Mira faces me, the window behind her, lamp raised.  ');
            expect(job).toMatchObject({ status: 'pending', messageId: chat.messages[0].id, hint: 'by the lamp' });
            const state = await settled(story.id, chat.id);

            expect(t.gateway.textCalls('snapshot_prompt')).toHaveLength(1);
            const [call] = t.gateway.imageCalls('snapshot_image');
            expect(call.prompt).toBe(prompt.imagePrompt.replace('Mira turns her back to the window.', 'Mira faces me, the window behind her, lamp raised.'));
            expect(call.referenceImages?.map((ref) => ref.bytes.toString())).toEqual([MIRA_REFERENCE.toString()]);
            expect(state.snapshots).toMatchObject([
                { prompt: call.prompt, hint: 'by the lamp', messageId: chat.messages[0].id, characters: [{ characterId: mira.id, name: 'Mira' }] },
            ]);
        });

        it('stores nothing and draws nothing for a Snapshot prompt that is never drawn', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);

            await writePrompt(story.id, chat.id);
            await play(story.id, chat.id, 'I wait.', 'The rain goes on.');

            expect(t.gateway.imageCalls()).toEqual([]);
            expect(await chatSnapshots(story.id, chat.id)).toEqual({ snapshots: [], jobs: [] });
            expect(await sql(`SELECT * FROM "snapshot" WHERE "story_id" = $1`, [story.id])).toEqual([]);
        });

        it('draws a Snapshot prompt once; a newer one replaces the older, which is then gone', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const older = await writePrompt(story.id, chat.id, { scene: 'Older.' });
            const newer = await writePrompt(story.id, chat.id, { scene: 'Newer.' });
            expect(newer.id).not.toBe(older.id);

            const gone = await t.http.post(snapshotsPath(story.id, chat.id)).send({ promptId: older.id, text: older.text }).expect(404);
            expect(gone.body.error).toEqual({ code: '404.002.012', message: 'That Snapshot prompt is gone. Write it again.' });

            t.gateway.scriptImage('snapshot_image', image('newer'));
            await draw(story.id, chat.id, newer);
            await settled(story.id, chat.id);
            const twice = await t.http.post(snapshotsPath(story.id, chat.id)).send({ promptId: newer.id, text: newer.text }).expect(404);
            expect(twice.body.error.code).toBe('404.002.012');
            // Another Chat's Snapshot prompt is not this Chat's.
            const other = await createChat(story.id);
            const theirs = await writePrompt(story.id, other.id);
            await t.http.post(snapshotsPath(story.id, chat.id)).send({ promptId: theirs.id, text: theirs.text }).expect(404);
            expect(t.gateway.imageCalls('snapshot_image')).toHaveLength(1);
        });

        it('refuses an empty text, and a take without a written Snapshot prompt', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const prompt = await writePrompt(story.id, chat.id);

            await t.http.post(snapshotsPath(story.id, chat.id)).send({ promptId: prompt.id, text: '   ' }).expect(400);
            await t.http.post(snapshotsPath(story.id, chat.id)).send({ promptId: prompt.id, text: 'x'.repeat(2_001) }).expect(400);
            // Every Snapshot is read first: the old one-step body draws nothing.
            await t.http.post(snapshotsPath(story.id, chat.id)).send({}).expect(400);
            await t.http.post(snapshotsPath(story.id, chat.id)).send({ hint: 'close-up' }).expect(400);
            expect(t.gateway.imageCalls()).toEqual([]);

            // The refused attempts left it held.
            t.gateway.scriptImage('snapshot_image', image('drawn'));
            await draw(story.id, chat.id, prompt);
            expect((await settled(story.id, chat.id)).snapshots).toHaveLength(1);
        });
    });

    describe('Links on edit, reset and delete', () => {
        it('clears the Message link of an edited AI Message, and of the Messages an edit discards, keeping the Gallery item', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const first = await play(story.id, chat.id, 'Hello.', 'She nods.');
            const firstReply = first.messages.at(-1)!;
            await snap(story.id, chat.id, { bytes: 'of-first-reply' });
            const second = await play(story.id, chat.id, 'Tea?', '@Mira: Fine.');
            await snap(story.id, chat.id, { bytes: 'of-second-reply' });
            await snap(story.id, chat.id, { bytes: 'of-opening', messageId: chat.messages[0].id });

            // Editing the first reply discards the second exchange and takes the first reply's moment away.
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http
                .patch(`/api/stories/${story.id}/chats/${chat.id}/messages/${firstReply.id}`)
                .send({ text: 'She shakes her head.' })
                .expect(200);

            const state = await chatSnapshots(story.id, chat.id);
            expect(state.snapshots.map((s) => s.messageId)).toEqual([chat.messages[0].id]);
            const items = await gallery(story.id, chat.id);
            expect(items).toHaveLength(3);
            expect(items.map((item) => [item.chatId, item.messageId])).toEqual([
                [chat.id, chat.messages[0].id],
                [chat.id, null],
                [chat.id, null],
            ]);
            expect(second.messages).toHaveLength(5);
            expect(await filesUnder(path.join(t.imageDir, 'snapshots', `story-${story.id}`))).toHaveLength(3);
        });

        it('clears the Message links of the Messages a User Message edit discards', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const played = await play(story.id, chat.id, 'Hello.', 'She nods.');
            await snap(story.id, chat.id);

            t.gateway.scriptText('turn', 'She frowns.');
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http
                .patch(`/api/stories/${story.id}/chats/${chat.id}/messages/${played.messages[1].id}`)
                .send({ text: 'Goodbye.' })
                .expect(200);

            expect((await chatSnapshots(story.id, chat.id)).snapshots).toEqual([]);
            expect((await gallery(story.id)).map((item) => [item.chatId, item.messageId])).toEqual([[chat.id, null]]);
        });

        it('clears the Message link of a regenerated reply, and the Gallery keeps the Snapshot', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const played = await play(story.id, chat.id, 'Hello.', 'She nods.');
            const taken = await snap(story.id, chat.id, { bytes: 'of-the-old-reply' });
            expect(taken.snapshots.map((s) => s.messageId)).toEqual([played.messages[2].id]);

            t.gateway.scriptText('turn', 'She frowns.');
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            const { body } = await t.http
                .post(`/api/stories/${story.id}/chats/${chat.id}/messages/${played.messages[2].id}/regenerate`)
                .expect(200);

            expect(body.messages).toHaveLength(3);
            expect((await chatSnapshots(story.id, chat.id)).snapshots).toEqual([]);
            expect((await gallery(story.id)).map((item) => [item.id, item.chatId, item.messageId])).toEqual([
                [taken.snapshots[0].id, chat.id, null],
            ]);
            expect(await filesUnder(path.join(t.imageDir, 'snapshots', `story-${story.id}`))).toHaveLength(1);
        });

        it('clears every Message link on reset, keeping the Chat link', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await snap(story.id, chat.id);
            await play(story.id, chat.id, 'Hello.', 'She nods.');
            await snap(story.id, chat.id);

            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/reset`).expect(200);

            expect((await chatSnapshots(story.id, chat.id)).snapshots).toEqual([]);
            const items = await gallery(story.id, chat.id);
            expect(items.map((item) => [item.chatId, item.messageId, item.chatTitle])).toEqual([
                [chat.id, null, chat.title],
                [chat.id, null, chat.title],
            ]);
        });

        it('clears both links when the Chat is deleted, and the Gallery keeps the item and its file', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const other = await createChat(story.id);
            await snap(story.id, chat.id, { bytes: 'kept' });
            await snap(story.id, other.id, { bytes: 'other' });

            await t.http.delete(`/api/stories/${story.id}/chats/${chat.id}`).expect(204);

            const items = await gallery(story.id);
            expect(items.map((item) => [item.chatId, item.messageId, item.chatTitle])).toEqual([
                [other.id, other.messages[0].id, other.title],
                [null, null, null],
            ]);
            expect(await readFile(path.join(t.imageDir, ...items[1].imagePath.split('/')), 'utf8')).toBe('kept');
            // Filtered by the other Chat, only its Snapshot.
            expect((await gallery(story.id, other.id)).map((item) => item.id)).toEqual([items[0].id]);
        });
    });

    describe('The Gallery', () => {
        it('lists newest first, filters by Chat, and downloads one image as an attachment', async () => {
            const story = await createStory();
            const a = await createChat(story.id);
            const b = await createChat(story.id);
            await snap(story.id, a.id, { bytes: 'a1' });
            await snap(story.id, b.id, { bytes: 'b1' });
            await snap(story.id, a.id, { bytes: 'a2' });

            const all = await gallery(story.id);
            expect(all.map((item) => item.chatTitle)).toEqual([a.title, b.title, a.title]);
            expect(all.map((item) => item.id)).toEqual([...all.map((item) => item.id)].sort((x, y) => y - x));
            expect((await gallery(story.id, a.id)).map((item) => item.chatId)).toEqual([a.id, a.id]);

            const download = await t.http.get(`/api/stories/${story.id}/snapshots/${all[0].id}/download`).buffer(true).expect(200);
            expect(download.headers['content-disposition']).toBe(`attachment; filename="snapshot-${all[0].id}.jpg"`);
            expect(download.headers['content-type']).toBe('image/jpeg');
            expect(Buffer.from(download.body).toString()).toBe('a2');
        });

        it('deletes a Snapshot with its file, from the timeline and the Gallery', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const state = await snap(story.id, chat.id, { bytes: 'doomed' });
            const snapshot = state.snapshots[0];

            await t.http.delete(`/api/stories/${story.id}/snapshots/${snapshot.id}`).expect(204);

            expect(await chatSnapshots(story.id, chat.id)).toEqual({ snapshots: [], jobs: [] });
            expect(await gallery(story.id)).toEqual([]);
            expect(await filesUnder(path.join(t.imageDir, 'snapshots', `story-${story.id}`))).toEqual([]);
            const missing = await t.http.get(`/api/stories/${story.id}/snapshots/${snapshot.id}`).expect(404);
            expect(missing.body.error.code).toBe('404.002.005');
            await t.http.get(`/api/images/${snapshot.imagePath}`).expect(404);
        });

        it('deletes every Gallery file with the Story', async () => {
            const story = await createStory();
            const keep = await createStory();
            const chat = await createChat(story.id);
            const kept = await createChat(keep.id);
            await snap(story.id, chat.id, { bytes: 'one' });
            await snap(story.id, chat.id, { bytes: 'two' });
            await t.http.delete(`/api/stories/${story.id}/chats/${chat.id}`).expect(204);
            await snap(story.id, (await createChat(story.id)).id, { bytes: 'three' });
            await snap(keep.id, kept.id, { bytes: 'kept' });
            expect(await filesUnder(path.join(t.imageDir, 'snapshots', `story-${story.id}`))).toHaveLength(3);

            await t.http.delete(`/api/stories/${story.id}`).expect(204);

            expect(await filesUnder(path.join(t.imageDir, 'snapshots', `story-${story.id}`))).toEqual([]);
            expect(await filesUnder(path.join(t.imageDir, 'reference-images', `story-${story.id}`))).toEqual([]);
            expect(await filesUnder(path.join(t.imageDir, 'snapshots', `story-${keep.id}`))).toHaveLength(1);
            expect(await sql(`SELECT id FROM "snapshot" WHERE "story_id" = $1`, [story.id])).toEqual([]);
        });
    });

    describe('Isolation', () => {
        it('never puts Snapshot data in the turn prompt and never writes ledger or Memory records', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const played = await play(story.id, chat.id, 'Hello.', 'She nods.');
            const before = {
                dashboard: (await t.http.get(`/api/stories/${story.id}/chats/${chat.id}/dashboard`).expect(200)).body,
                memories: (await t.http.get(`/api/stories/${story.id}/chats/${chat.id}/memories`).expect(200)).body,
                ledger: await sql(
                    `SELECT (SELECT count(*) FROM "bond_change") AS b, (SELECT count(*) FROM "arc_step") AS a,
                            (SELECT count(*) FROM "scene_advance") AS s, (SELECT count(*) FROM "memory_change") AS m`,
                ),
            };

            await snap(story.id, chat.id, { hint: 'zebra-hint-marker', scene: 'Mira holds a zebra-scene-marker lantern.' });
            // The Snapshot made one text call of its own; no judge or extraction ran for it.
            expect(t.gateway.textCalls().map((call) => call.kind).slice(3)).toEqual(['snapshot_prompt']);
            expect((await t.http.get(`/api/stories/${story.id}/chats/${chat.id}/dashboard`).expect(200)).body).toEqual(before.dashboard);
            expect((await t.http.get(`/api/stories/${story.id}/chats/${chat.id}/memories`).expect(200)).body).toEqual(before.memories);
            expect(
                await sql(
                    `SELECT (SELECT count(*) FROM "bond_change") AS b, (SELECT count(*) FROM "arc_step") AS a,
                            (SELECT count(*) FROM "scene_advance") AS s, (SELECT count(*) FROM "memory_change") AS m`,
                ),
            ).toEqual(before.ledger);
            // The Chat's Messages are as they were: a Snapshot is not a Message.
            expect((await getChat(story.id, chat.id)).messages).toEqual(played.messages);

            await play(story.id, chat.id, 'What is that light?', 'Only the lamp.');
            const turn = JSON.stringify(t.gateway.textCalls('turn').at(-1)!.messages);
            const background = JSON.stringify(t.gateway.textCalls().slice(-2).map((call) => call.messages));
            for (const sent of [turn, background]) {
                expect(sent).not.toContain('zebra');
                expect(sent).not.toContain('First-person view');
                expect(sent).not.toMatch(/snapshot/i);
            }
        });
    });

    describe('Image credit', () => {
        it('blocks only Snapshots when image credit is out, and not when it is unknown', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const written = await writePrompt(story.id, chat.id);
            t.gateway.reset();
            t.gateway.setRemainingCredit({ image: { remainingUsd: 0, limitUsd: 8 } });

            // No writer call for a picture that can't be drawn, and no drawing of one already written.
            const blocked = await t.http.post(promptsPath(story.id, chat.id)).send({}).expect(402);
            expect(blocked.body.error.code).toBe('402.001.004');
            const notDrawn = await t.http.post(snapshotsPath(story.id, chat.id)).send({ promptId: written.id, text: written.text }).expect(402);
            expect(notDrawn.body.error.code).toBe('402.001.004');
            expect(t.gateway.textCalls('snapshot_prompt')).toEqual([]);
            expect(t.gateway.imageCalls()).toEqual([]);
            expect((await chatSnapshots(story.id, chat.id)).jobs).toEqual([]);
            expect(await getChat(story.id, chat.id)).toMatchObject({ imageCreditOut: true, textCreditOut: false });

            // Play goes on.
            const played = await play(story.id, chat.id, 'Hello.', 'She nods.');
            expect(played.messages).toHaveLength(3);

            t.gateway.setRemainingCredit({ image: { remainingUsd: null, limitUsd: null } });
            expect(await getChat(story.id, chat.id)).toMatchObject({ imageCreditOut: false });
            const state = await snap(story.id, chat.id);
            expect(state.snapshots).toHaveLength(1);
        });

        it('fails the job with out of image credit when the provider runs out mid-way', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const prompt = await writePrompt(story.id, chat.id);
            t.gateway.scriptImage('snapshot_image', new OutOfCreditError('image', 'Venice: Insufficient balance'));

            await draw(story.id, chat.id, prompt);
            const failed = await settled(story.id, chat.id);

            expect(failed.jobs).toMatchObject([{ status: 'failed', error: { code: '402.001.004' } }]);
            expect(failed.snapshots).toEqual([]);
            // Out of credit is not tried again on its own: a retry could only fail the same way.
            expect(t.gateway.imageCalls('snapshot_image')).toHaveLength(1);
        });
    });

    it('answers 404 for an unknown Chat, Story or Snapshot', async () => {
        const story = await createStory();
        const other = await createStory();
        const chat = await createChat(other.id);
        expect((await t.http.post(promptsPath(story.id, chat.id)).send({}).expect(404)).body.error.code).toBe('404.004.001');
        expect((await t.http.get('/api/stories/999999/gallery').expect(404)).body.error.code).toBe('404.003.001');
        const state = await snap(other.id, chat.id);
        await t.http.delete(`/api/stories/${story.id}/snapshots/${state.snapshots[0].id}`).expect(404);
        await t.http.post(promptsPath(other.id, chat.id)).send({ hint: 'x'.repeat(301) }).expect(400);
    });
});

describe('Snapshots through the real gateway', () => {
    let t: TestApp;
    const requests: RecordedRequest[] = [];

    beforeAll(async () => {
        const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex');
        const routed: FetchLike = async (url, init) => {
            const request: RecordedRequest = {
                url,
                method: init.method ?? 'GET',
                headers: (init.headers ?? {}) as Record<string, string>,
                body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
            };
            requests.push(request);
            if (url.endsWith('/image/multi-edit')) {
                return new Response(jpeg, { status: 200, headers: { 'content-type': 'image/jpeg' } });
            }
            const json = url.endsWith('/credits')
                ? fixture('openrouter/credits.json')
                : url.endsWith('/billing/balance')
                  ? fixture('venice/balance.json')
                  : url.includes('/models?type=')
                    ? fixture('venice/models.json')
                    : url.endsWith('/image/generate')
                      ? fixture('venice/generate.json')
                      : fixture('openrouter/chat-snapshot-prompt.json');
            return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
        };
        t = await startTestApp({ modelGateway: 'real', fetch: routed, providerKeys: TEST_KEYS });
    });

    afterAll(async () => {
        await t.close();
    });

    it('writes the prompt on V4 Flash in JSON mode, draws from text alone with seedream-v4, and records one UsageRecord per pool', async () => {
        const created = await t.http.post('/api/stories').send({ title: 'Real', imageStyle: 'oil painting' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'An island.', opening: 'The lamp is out.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The keeper.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send(CAST[0]).expect(201);
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;

        await takeSnapshot(t.http, storyId, chat.id);
        const deadline = Date.now() + 5_000;
        let state: ChatSnapshots;
        for (;;) {
            state = (await t.http.get(`/api/stories/${storyId}/chats/${chat.id}/snapshots`).expect(200)).body;
            if (state.jobs.every((job) => job.status !== 'pending')) break;
            if (Date.now() > deadline) throw new Error('The Snapshot job did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }

        expect(state.jobs).toEqual([]);
        expect(state.snapshots).toMatchObject([{ imageModel: 'seedream-v4', costUsd: 0.05, characters: [{ name: 'Mira' }] }]);
        const writer = requests.find((request) => request.url.endsWith('/chat/completions'))!;
        expect(writer.body).toMatchObject({
            model: 'deepseek/deepseek-v4-flash',
            provider: { only: ['deepinfra'], allow_fallbacks: false },
            reasoning: { enabled: false },
            response_format: { type: 'json_object' },
        });
        const drawn = requests.find((request) => request.url.endsWith('/image/generate'))!;
        expect(drawn.body).toMatchObject({ model: 'seedream-v4', aspect_ratio: '2:3', safe_mode: false });
        expect(drawn.body.prompt).toContain(`Appearance: ${CAST[0].appearance}`);

        const usage = await t.http.get('/api/usage').expect(200);
        expect(usage.body.pools.text).toMatchObject({ calls: 1, spentUsd: 0.000085 });
        expect(usage.body.pools.image).toMatchObject({ calls: 1, spentUsd: 0.05 });
    });
});
