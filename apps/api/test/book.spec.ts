import { SESSION_COOKIE, sessionKey, signSession } from '../src/api/auth/session.js';
import { BookManagerService } from '../src/manager/chat/book/book.service.js';
import { AccountModelService } from '../src/model/account/account.service.js';
import { AccountEntity, AccountRole } from '../src/model/account/entities/account.entity.js';
import { requestScope } from '../src/model/account/request-scope.js';
import { UsageRecordModelService } from '../src/model/usage-record/usage-record.service.js';
import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Turn a Chat into a novel (.scratch/chat-novel/spec.md), through the HTTP API, with the Judge and the
 * Book chapter writer scripted on the fake gateway.
 */

const SECRET = 'x'.repeat(40);
const DAY = 24 * 60 * 60 * 1000;
const OPENING = 'Smoke curls from the fire.\n\n@Nara: Drink, guest.';
const NO_OPS = '{"operations":[]}';
const STAYS = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { reason: 'Not yet.', move_on: false } });
const NARA_SECRET = 'Nara is the khan’s runaway daughter.';
const NARA_PERSONALITY = 'Warm, but lies easily.';
const CHAPTER_ONE = 'Title: Mare’s Milk\n\nSmoke curled from the fire as Ash sat down.\n\n"Drink, guest," Nara said.';
const CHAPTER_TWO = 'Title: The Guest Tent\n\nNight came down over the tents.';

interface BookChapter {
    number: number;
    sceneName: string;
    title: string | null;
    text: string | null;
    writtenBy: 'ai' | 'user' | null;
    state: 'unwritten' | 'queued' | 'writing' | 'written' | 'failed' | 'empty';
    outOfDate: boolean;
    chapterGone: boolean;
    draft: string | null;
    failedReason: string | null;
    priceUsd: number | null;
}

interface Book {
    title: string;
    chatTitle: string;
    identityName: string;
    writing: boolean;
    writeAllCount: number;
    writeAllPriceUsd: number;
    chapters: BookChapter[];
}

interface Story {
    id: number;
    scenes: Array<{ id: number; name: string }>;
}

describe('Turn a Chat into a novel', () => {
    let t: TestApp;
    let accounts: AccountModelService;
    let owner: string;
    const cookie = (id: number) => `${SESSION_COOKIE}=${signSession(sessionKey(SECRET), id, Date.now() + 60 * DAY)}`;

    beforeAll(async () => {
        t = await startTestApp({ backgroundWaitMs: 300, loginPassword: 'lantern-keeper-1890', sessionSecret: SECRET });
        accounts = t.app.get(AccountModelService);
        owner = cookie(accounts.owner.id);
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    const api = (as: string) => ({
        get: (path: string) => t.http.get(path).set('Cookie', as),
        post: (path: string) => t.http.post(path).set('Cookie', as),
        put: (path: string) => t.http.put(path).set('Cookie', as),
        patch: (path: string) => t.http.patch(path).set('Cookie', as),
        delete: (path: string) => t.http.delete(path).set('Cookie', as),
    });

    /** Nara's camp with three Scenes. */
    async function createStory(as = owner): Promise<Story> {
        const http = api(as);
        const created = await http.post('/api/stories').send({ title: 'The Steppe' }).expect(201);
        const storyId = created.body.id as number;
        await http.patch(`/api/stories/${storyId}`).send({ setting: "A herders' camp on the steppe.", opening: OPENING }).expect(200);
        await http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'A trader passing through.' }).expect(200);
        await http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Nara', appearance: 'Tall, with a long braid.', personality: NARA_PERSONALITY, voice: 'Quick.', secrets: NARA_SECRET })
            .expect(201);
        await http.post(`/api/stories/${storyId}/scenes`).send({ name: "Mare's milk", situation: 'Ash is a guest at the fire.', moveOnCondition: 'Ash asks about the cows.' }).expect(201);
        await http.post(`/api/stories/${storyId}/scenes`).send({ name: 'The guest tent', situation: 'Night in the guest tent.', moveOnCondition: 'Nara tells a secret.' }).expect(201);
        return (await http.post(`/api/stories/${storyId}/scenes`).send({ name: 'The fire', situation: 'A lord comes.' }).expect(201)).body as Story;
    }

    async function settled(storyId: number, chatId: number, as = owner): Promise<any> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = (await api(as).get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
            const last = [...chat.messages].reverse().find((message: any) => message.kind === 'ai' && message.judge);
            if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
            if (Date.now() > deadline) throw new Error('The judge did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
    }

    async function play(storyId: number, chatId: number, reply = '@Nara: Hm.', as = owner): Promise<any> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', STAYS);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await api(as).post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'I sip the milk.' }).expect(201);
        return settled(storyId, chatId, as);
    }

    async function moveOn(storyId: number, chatId: number, toSceneId: number | null, as = owner): Promise<void> {
        t.gateway.scriptText('chapter_summary', 'Ash drank.');
        await api(as).post(`/api/stories/${storyId}/chats/${chatId}/scene`).send({ toSceneId }).expect(200);
    }

    /** A Chat with two ended Chapters: Mare's milk (Opening and one exchange) and The guest tent (one exchange). */
    async function twoChapters(as = owner): Promise<{ story: Story; chatId: number }> {
        const story = await createStory(as);
        const chatId = (await api(as).post(`/api/stories/${story.id}/chats`).expect(201)).body.id as number;
        await play(story.id, chatId, '@Nara: Slowly. It bites.', as);
        await moveOn(story.id, chatId, story.scenes[1].id, as);
        await play(story.id, chatId, 'The tent is cold.', as);
        await moveOn(story.id, chatId, story.scenes[2].id, as);
        return { story, chatId };
    }

    const bookPath = (storyId: number, chatId: number) => `/api/stories/${storyId}/chats/${chatId}/book`;

    async function book(storyId: number, chatId: number, as = owner): Promise<Book> {
        await t.app.get(BookManagerService).idle(chatId);
        return (await api(as).get(bookPath(storyId, chatId)).expect(200)).body as Book;
    }

    it('lists each ended Chapter, unwritten, with what writing it will cost', async () => {
        const { story, chatId } = await twoChapters();
        const body = await book(story.id, chatId);
        expect(body).toMatchObject({ title: 'The Steppe', identityName: 'Ash', writing: false, writeAllCount: 2 });
        expect(body.chapters.map((chapter) => [chapter.number, chapter.sceneName, chapter.state, chapter.text])).toEqual([
            [1, "Mare's milk", 'unwritten', null],
            [2, 'The guest tent', 'unwritten', null],
        ]);
        for (const chapter of body.chapters) expect(chapter.priceUsd).toBeGreaterThan(0);
        expect(body.writeAllPriceUsd).toBeCloseTo(body.chapters[0].priceUsd! + body.chapters[1].priceUsd!, 3);
    });

    it('writes one chapter, streamed, on the play model kind, with nothing a Character keeps hidden', async () => {
        const { story, chatId } = await twoChapters();
        t.gateway.scriptText('book_chapter', { text: CHAPTER_ONE, pieceDelayMs: 15, pieceSize: 8 });
        const queued = (await api(owner).post(`${bookPath(story.id, chatId)}/write`).send({ numbers: [1] }).expect(200)).body as Book;
        expect(['queued', 'writing']).toContain(queued.chapters[0].state);
        expect(queued.writing).toBe(true);

        // While it streams, the Book shows the text so far.
        const deadline = Date.now() + 5_000;
        let draft: string | null = null;
        while (draft === null && Date.now() < deadline) {
            const body = (await api(owner).get(bookPath(story.id, chatId)).expect(200)).body as Book;
            if (body.chapters[0].state === 'writing' && body.chapters[0].draft) draft = body.chapters[0].draft;
            else await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(CHAPTER_ONE.startsWith(draft!)).toBe(true);

        const body = await book(story.id, chatId);
        expect(body.chapters[0]).toMatchObject({
            state: 'written',
            title: 'Mare’s Milk',
            text: 'Smoke curled from the fire as Ash sat down.\n\n"Drink, guest," Nara said.',
            writtenBy: 'ai',
            outOfDate: false,
            draft: null,
        });
        expect(body.chapters[1].state).toBe('unwritten');
        expect(body.writeAllCount).toBe(1);

        const [request] = t.gateway.textCalls('book_chapter');
        expect(t.gateway.calls.find((call) => call.method === 'streamText')?.request.kind).toBe('book_chapter');
        const prompt = request.messages.map((message) => message.content).join('\n');
        expect(prompt).toContain('[Ash]\nI sip the milk.');
        expect(prompt).toContain('Nara: "Slowly. It bites."');
        expect(prompt).toContain('Tall, with a long braid.');
        expect(prompt).not.toContain(NARA_SECRET);
        expect(prompt).not.toContain(NARA_PERSONALITY);
        expect(prompt).not.toContain('Ash asks about the cows.');
        expect(prompt).not.toContain('@Nara');
        expect(request.servedFor).toEqual({ storyId: story.id, chatId });
    });

    it('writes all the rest oldest first, each reading the end of the one before', async () => {
        const { story, chatId } = await twoChapters();
        t.gateway.scriptText('book_chapter', CHAPTER_ONE, CHAPTER_TWO);
        await api(owner).post(`${bookPath(story.id, chatId)}/write`).send({}).expect(200);
        const body = await book(story.id, chatId);
        expect(body.chapters.map((chapter) => [chapter.state, chapter.title])).toEqual([
            ['written', 'Mare’s Milk'],
            ['written', 'The Guest Tent'],
        ]);
        const [first, second] = t.gateway.textCalls('book_chapter');
        expect(first.messages[1].content).not.toContain('chapter before ended');
        expect(second.messages[1].content).toContain('"Drink, guest," Nara said.');
        expect(second.messages[1].content).toContain('chapter 2, played in the scene "The guest tent"');

        // Nothing left: Write all is refused, and no call is made.
        const refused = await api(owner).post(`${bookPath(story.id, chatId)}/write`).send({}).expect(409);
        expect(refused.body.error.code).toBe('409.004.130');
        expect(t.gateway.textCalls('book_chapter')).toHaveLength(2);
    });

    it('keeps the old text when a write fails, says why, and writes it on Try again', async () => {
        const { story, chatId } = await twoChapters();
        t.gateway.scriptText('book_chapter', CHAPTER_ONE);
        await api(owner).post(`${bookPath(story.id, chatId)}/write`).send({ numbers: [1] }).expect(200);
        await book(story.id, chatId);

        t.gateway.scriptText('book_chapter', new ProviderOutageError('The host is down.'));
        await api(owner).post(`${bookPath(story.id, chatId)}/write`).send({ numbers: [1] }).expect(200);
        let body = await book(story.id, chatId);
        expect(body.chapters[0]).toMatchObject({ state: 'failed', title: 'Mare’s Milk', text: expect.stringContaining('Smoke curled') });
        expect(body.chapters[0].failedReason).toBeTruthy();

        // An answer still in chat form fails too, without a second paid call.
        t.gateway.scriptText('book_chapter', 'Title: Oops\n\n@Nara: Drink, guest.');
        await api(owner).post(`${bookPath(story.id, chatId)}/write`).send({ numbers: [2] }).expect(200);
        body = await book(story.id, chatId);
        expect(body.chapters[1]).toMatchObject({ state: 'failed', text: null });
        expect(body.chapters[1].failedReason).toMatch(/@Name:/);
        expect(t.gateway.textCalls('book_chapter')).toHaveLength(3);

        t.gateway.scriptText('book_chapter', CHAPTER_TWO);
        await api(owner).post(`${bookPath(story.id, chatId)}/write`).send({ numbers: [2] }).expect(200);
        body = await book(story.id, chatId);
        expect(body.chapters[1]).toMatchObject({ state: 'written', title: 'The Guest Tent', failedReason: null });
    });

    it("keeps the user's edit, and a write finishing after it does not replace it", async () => {
        const { story, chatId } = await twoChapters();
        t.gateway.scriptText('book_chapter', { text: CHAPTER_ONE, pieceDelayMs: 40 });
        await api(owner).post(`${bookPath(story.id, chatId)}/write`).send({ numbers: [1] }).expect(200);
        // Busy while it is written.
        const busy = await api(owner).put(`${bookPath(story.id, chatId)}/chapters/1`).send({ title: 'Mine', text: 'My own.' }).expect(409);
        expect(busy.body.error.code).toBe('409.004.133');
        await book(story.id, chatId);

        const blank = await api(owner).put(`${bookPath(story.id, chatId)}/chapters/1`).send({ title: ' ', text: 'x' }).expect(422);
        expect(blank.body.error.code).toBe('422.004.135');
        let body = (await api(owner).put(`${bookPath(story.id, chatId)}/chapters/1`).send({ title: 'At the Fire', text: 'Ash drank the milk.\n\nNara laughed.' }).expect(200)).body as Book;
        expect(body.chapters[0]).toMatchObject({ title: 'At the Fire', text: 'Ash drank the milk.\n\nNara laughed.', writtenBy: 'user', state: 'written', outOfDate: false });

        // Write all leaves a chapter the user wrote alone; its own Rewrite replaces it.
        t.gateway.scriptText('book_chapter', CHAPTER_TWO);
        await api(owner).post(`${bookPath(story.id, chatId)}/write`).send({}).expect(200);
        body = await book(story.id, chatId);
        expect(body.chapters[0].title).toBe('At the Fire');
        expect(t.gateway.textCalls('book_chapter')).toHaveLength(2);

        // A user's edit made while a write runs wins over it.
        const service = t.app.get(BookManagerService) as any;
        const model = service.book;
        const landed = await model.writeAi(chatId, 1, { title: 'Late', text: 'Late text.', sourceHash: 'x', sceneName: "Mare's milk" }, new Date(Date.now() - 60_000));
        expect(landed).toBe(false);
        expect((await book(story.id, chatId)).chapters[0].title).toBe('At the Fire');
    });

    it('marks a chapter out of date when its Chapter is taken back or changes, keeping its text until Rewrite', async () => {
        const story = await createStory();
        const chatId = (await api(owner).post(`/api/stories/${story.id}/chats`).expect(201)).body.id as number;
        const chat = await play(story.id, chatId, '@Nara: Slowly.');
        await moveOn(story.id, chatId, story.scenes[1].id);
        t.gateway.scriptText('book_chapter', CHAPTER_ONE);
        await api(owner).post(`${bookPath(story.id, chatId)}/write`).send({ numbers: [1] }).expect(200);
        expect((await book(story.id, chatId)).chapters[0]).toMatchObject({ state: 'written', outOfDate: false });

        // Again on the reply the move was made at takes the Chapter back.
        const reply = chat.messages.at(-1);
        t.gateway.scriptText('turn', '@Nara: Gulp it, then.');
        t.gateway.scriptText('judge', STAYS);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await api(owner).post(`/api/stories/${story.id}/chats/${chatId}/messages/${reply.id}/regenerate`).expect(200);
        await settled(story.id, chatId);
        let body = await book(story.id, chatId);
        expect(body.chapters).toHaveLength(1);
        expect(body.chapters[0]).toMatchObject({ number: 1, state: 'written', outOfDate: true, chapterGone: true, priceUsd: null, title: 'Mare’s Milk' });
        const gone = await api(owner).post(`${bookPath(story.id, chatId)}/write`).send({ numbers: [1] }).expect(422);
        expect(gone.body.error.code).toBe('422.004.131');

        // Moving on again makes a new Chapter 1, told differently: out of date, not gone.
        await moveOn(story.id, chatId, story.scenes[1].id);
        body = await book(story.id, chatId);
        expect(body.chapters[0]).toMatchObject({ outOfDate: true, chapterGone: false, text: expect.stringContaining('Smoke curled') });
        expect(body.writeAllCount).toBe(1);

        t.gateway.scriptText('book_chapter', 'Title: Gulp It\n\nAsh gulped the milk.');
        await api(owner).post(`${bookPath(story.id, chatId)}/write`).send({}).expect(200);
        body = await book(story.id, chatId);
        expect(body.chapters[0]).toMatchObject({ title: 'Gulp It', outOfDate: false, state: 'written' });
        expect(t.gateway.textCalls('book_chapter').at(-1)!.messages[1].content).toContain('Gulp it, then.');

        // Remove takes a chapter out of the Book.
        await api(owner).delete(`${bookPath(story.id, chatId)}/chapters/1`).expect(200);
        expect((await book(story.id, chatId)).chapters[0]).toMatchObject({ state: 'unwritten', text: null });
        await api(owner).delete(`${bookPath(story.id, chatId)}/chapters/1`).expect(404);
    });

    it('downloads the written chapters as an EPUB, and refuses an empty Book', async () => {
        const { story, chatId } = await twoChapters();
        const empty = await api(owner).get(`${bookPath(story.id, chatId)}/epub`).expect(409);
        expect(empty.body.error.code).toBe('409.004.134');

        t.gateway.scriptText('book_chapter', CHAPTER_ONE);
        await api(owner).post(`${bookPath(story.id, chatId)}/write`).send({ numbers: [1] }).expect(200);
        await book(story.id, chatId);
        const file = await api(owner)
            .get(`${bookPath(story.id, chatId)}/epub`)
            .buffer(true)
            .parse((response, done) => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) => chunks.push(chunk));
                response.on('end', () => done(null, Buffer.concat(chunks)));
            })
            .expect(200);
        expect(file.headers['content-type']).toBe('application/epub+zip');
        expect(file.headers['content-disposition']).toMatch(/attachment; filename="the-steppe-chat-1\.epub"|attachment; filename=".+\.epub"/);
        const bytes = file.body as Buffer;
        expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304');
        expect(bytes.subarray(30, 58).toString()).toBe('mimetypeapplication/epub+zip');
        expect(bytes.includes(Buffer.from('OEBPS/chapter-1.xhtml'))).toBe(true);
        expect(bytes.includes(Buffer.from('OEBPS/chapter-2.xhtml'))).toBe(false);
    });

    it('says when there is nothing to write from: a Story with no Scenes, an unknown chapter', async () => {
        const created = await api(owner).post('/api/stories').send({ title: 'No Scenes' }).expect(201);
        await api(owner).patch(`/api/stories/${created.body.id}`).send({ setting: 'A room.', opening: 'A room.' }).expect(200);
        await api(owner).patch(`/api/stories/${created.body.id}/role`).send({ name: 'Ash', description: 'Someone.' }).expect(200);
        await api(owner).post(`/api/stories/${created.body.id}/characters`).send({ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Quick.' }).expect(201);
        const chatId = (await api(owner).post(`/api/stories/${created.body.id}/chats`).expect(201)).body.id as number;
        const body = await book(created.body.id, chatId);
        expect(body).toMatchObject({ chapters: [], writeAllCount: 0, writeAllPriceUsd: 0 });
        expect((await api(owner).post(`${bookPath(created.body.id, chatId)}/write`).send({ numbers: [3] }).expect(404)).body.error.code).toBe('404.004.132');
        expect((await api(owner).post(`${bookPath(created.body.id, chatId)}/write`).send({}).expect(409)).body.error.code).toBe('409.004.130');
    });

    describe('Accounts', () => {
        async function spend(account: AccountEntity, costUsd: number): Promise<void> {
            const usage = t.app.get(UsageRecordModelService);
            const record = { kind: 'turn', pool: 'text', model: 'm', host: 'h', promptTokens: 1, completionTokens: 1, images: null, costUsd, storyId: null, chatId: null, characters: null } as never;
            await requestScope.run({ account }, () => usage.record(record));
        }

        it("refuses a Member at their Monthly cap before anything is queued, and hides another Account's Book", async () => {
            const rin = await accounts.save({ email: 'rin-book@example.com', role: AccountRole.Member, monthlyCapUsd: 5 });
            const as = cookie(rin.id);
            const { story, chatId } = await twoChapters(as);
            await spend(rin, 5);
            t.gateway.calls.length = 0;
            const refused = await api(as).post(`${bookPath(story.id, chatId)}/write`).send({}).expect(402);
            expect(refused.body.error.code).toBe('402.010.009');
            expect(t.gateway.textCalls('book_chapter')).toHaveLength(0);
            expect((await book(story.id, chatId, as)).chapters.map((chapter) => chapter.state)).toEqual(['unwritten', 'unwritten']);

            await api(owner).get(bookPath(story.id, chatId)).expect(404);
            await api(owner).get(`${bookPath(story.id, chatId)}/epub`).expect(404);
            await api(owner).post(`${bookPath(story.id, chatId)}/write`).send({}).expect(404);
        });
    });
});
