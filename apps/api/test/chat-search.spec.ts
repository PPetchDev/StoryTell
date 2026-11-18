import { collapseSpace, foldCase, leadOf, matchAt, SEARCH_HITS_MAX, SearchablePart, searchParts, snippetAround } from '../src/manager/chat/search/chat-search.js';
import { startTestApp, TestApp } from './harness/test-app.js';

const OPENING = `The lamp went out an hour ago.

@Mira: You're late. Boots off, keeper.`;

const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';

interface Hit {
    messageId: number;
    kind: 'user' | 'ai';
    speaker: string;
    snippet: string;
    match: { start: number; length: number };
}
interface Bookmark {
    messageId: number;
    kind: 'user' | 'ai';
    speaker: string;
    snippet: string;
}
interface ChatBody {
    id: number;
    messages: Array<{ id: number; kind: 'user' | 'ai' }>;
}

/** The marked words of a hit. */
const marked = (hit: Hit) => hit.snippet.slice(hit.match.start, hit.match.start + hit.match.length);

// .scratch/chat-search/spec.md: search within a Chat, and Bookmarks.
describe('Search within a Chat', () => {
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
        for (const name of ['Mira', 'Nara']) {
            await t.http.post(`/api/stories/${storyId}/characters`).send({ name, appearance: 'Tall.', personality: 'Dry.', voice: 'Short.' }).expect(201);
        }
        return storyId;
    }

    async function settle(storyId: number, chatId: number): Promise<ChatBody> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200);
            const last = body.messages[body.messages.length - 1];
            if (last.kind === 'ai' && last.judge?.status !== 'pending' && last.memory?.status !== 'pending') return body as ChatBody;
            if (Date.now() > deadline) throw new Error('The turn did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    /** Sends one turn and waits until its background calls have settled. */
    async function send(storyId: number, chatId: number, text: string, reply: string): Promise<ChatBody> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settle(storyId, chatId);
    }

    async function playedChat(title: string): Promise<{ storyId: number; chat: ChatBody }> {
        const storyId = await createStory(title);
        const { body: created } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        await send(storyId, created.id, 'I set my bag down by the LAMP.', 'Mira snorts at the lamp.\n\n@Mira: The ferry. Of course.\n\n@Nara: Leave the lamp alone.');
        const chat = await send(storyId, created.id, 'Where is the lamp room?', '@Mira: Up the stairs.');
        return { storyId, chat };
    }

    const search = async (storyId: number, chatId: number, q: string) =>
        (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/search`).query({ q }).expect(200)).body as { total: number; hits: Hit[] };

    const bookmarks = async (storyId: number, chatId: number) =>
        ((await t.http.get(`/api/stories/${storyId}/chats/${chatId}/bookmarks`).expect(200)).body.bookmarks as Bookmark[]);

    const mark = (storyId: number, chatId: number, messageId: number) =>
        t.http.put(`/api/stories/${storyId}/chats/${chatId}/messages/${messageId}/bookmark`);

    const unmark = (storyId: number, chatId: number, messageId: number) =>
        t.http.delete(`/api/stories/${storyId}/chats/${chatId}/messages/${messageId}/bookmark`);

    it('finds user Messages and each part of a reply, any case, newest first, naming who said it', async () => {
        const { storyId, chat } = await playedChat('Find');
        const [opening, firstMine, firstReply, secondMine] = chat.messages;

        const found = await search(storyId, chat.id, 'lamp');

        expect(found.total).toBe(5);
        expect(found.hits.map((hit) => [hit.messageId, hit.kind, hit.speaker])).toEqual([
            [secondMine.id, 'user', 'Ash'],
            [firstReply.id, 'ai', 'Nara'],
            [firstReply.id, 'ai', 'Narrator'],
            [firstMine.id, 'user', 'Ash'],
            [opening.id, 'ai', 'Narrator'],
        ]);
        // Every hit marks the words it matched, as they are written.
        expect(found.hits.map(marked)).toEqual(['lamp', 'lamp', 'lamp', 'LAMP', 'lamp']);
        expect(found.hits[0].snippet).toBe('Where is the lamp room?');
    });

    it('matches across collapsed whitespace and newlines', async () => {
        const { storyId, chat } = await playedChat('Spaces');

        const found = await search(storyId, chat.id, 'hour   ago.\nMira');

        // The Opening's narration ends "an hour ago." and Mira's line is a part of its own: no match across parts.
        expect(found.total).toBe(0);
        expect((await search(storyId, chat.id, 'out  an\nhour')).hits.map(marked)).toEqual(['out an hour']);
    });

    it('reads AI parts as the screen shows them, with the On AI Replace rules applied', async () => {
        const { storyId, chat } = await playedChat('Rules');
        await t.http.post(`/api/stories/${storyId}/replace-rules`).send({ find: 'stairs', replace: 'ladder' }).expect(201);

        expect((await search(storyId, chat.id, 'stairs')).total).toBe(0);
        const found = await search(storyId, chat.id, 'ladder');
        expect(found.hits.map((hit) => hit.snippet)).toEqual(['Up the ladder.']);
    });

    it('refuses a blank or an over-long query, and a Chat of another Story', async () => {
        const { storyId, chat } = await playedChat('Refuse');
        const other = await createStory('Other');

        await t.http.get(`/api/stories/${storyId}/chats/${chat.id}/search`).query({ q: '   ' }).expect(400);
        await t.http.get(`/api/stories/${storyId}/chats/${chat.id}/search`).expect(400);
        await t.http.get(`/api/stories/${storyId}/chats/${chat.id}/search`).query({ q: 'x'.repeat(201) }).expect(400);
        await t.http.get(`/api/stories/${other}/chats/${chat.id}/search`).query({ q: 'lamp' }).expect(404);
        await t.http.get(`/api/stories/${other}/chats/${chat.id}/bookmarks`).expect(404);
    });

    it('marks and unmarks a Message, both idempotent, and lists the Bookmarks in thread order', async () => {
        const { storyId, chat } = await playedChat('Marks');
        const [opening, firstMine, firstReply, , secondReply] = chat.messages;

        await mark(storyId, chat.id, secondReply.id).expect(200);
        await mark(storyId, chat.id, firstMine.id).expect(200);
        await mark(storyId, chat.id, firstReply.id).expect(200);
        const { body } = await mark(storyId, chat.id, firstReply.id).expect(200);

        expect(body.bookmarks).toEqual(await bookmarks(storyId, chat.id));
        expect((body.bookmarks as Bookmark[]).map(({ messageId, kind, speaker, snippet }) => ({ messageId, kind, speaker, snippet }))).toEqual([
            { messageId: firstMine.id, kind: 'user', speaker: 'Ash', snippet: 'I set my bag down by the LAMP.' },
            { messageId: firstReply.id, kind: 'ai', speaker: 'Mira and Nara', snippet: 'Mira snorts at the lamp. The ferry. Of course. Leave the lamp alone.' },
            { messageId: secondReply.id, kind: 'ai', speaker: 'Mira', snippet: 'Up the stairs.' },
        ]);

        await unmark(storyId, chat.id, firstReply.id).expect(200);
        const after = await unmark(storyId, chat.id, firstReply.id).expect(200);
        expect((after.body.bookmarks as Bookmark[]).map((bookmark) => bookmark.messageId)).toEqual([firstMine.id, secondReply.id]);

        // The Opening can be marked too: it is a reply like any other, named by who speaks in it.
        await mark(storyId, chat.id, opening.id).expect(200);
        expect((await bookmarks(storyId, chat.id))[0]).toMatchObject({ messageId: opening.id, speaker: 'Mira' });
    });

    it("refuses to mark a Message of another Chat", async () => {
        const { storyId, chat } = await playedChat('Theirs');
        const { body: other } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);

        await mark(storyId, other.id, chat.messages[1].id).expect(404);
        await unmark(storyId, other.id, chat.messages[1].id).expect(404);
        expect(await bookmarks(storyId, chat.id)).toEqual([]);
    });

    it("keeps an edited Message's Bookmark and drops those after it", async () => {
        const { storyId, chat } = await playedChat('Edit');
        const [, firstMine, firstReply, secondMine, secondReply] = chat.messages;
        for (const message of [firstReply, secondMine, secondReply]) await mark(storyId, chat.id, message.id).expect(200);

        await t.http.patch(`/api/stories/${storyId}/chats/${chat.id}/messages/${firstReply.id}`).send({ text: 'Mira says nothing.' }).expect(200);

        const left = await bookmarks(storyId, chat.id);
        expect(left.map((bookmark) => bookmark.messageId)).toEqual([firstReply.id]);
        expect(left[0].snippet).toBe('Mira says nothing.');
        expect(firstMine.id).toBeLessThan(firstReply.id);
    });

    it("keeps the newest reply's Bookmark through Regenerate, and drops every one on Reset", async () => {
        const { storyId, chat } = await playedChat('Again');
        const [opening, firstMine, , , secondReply] = chat.messages;
        for (const message of [opening, firstMine, secondReply]) await mark(storyId, chat.id, message.id).expect(200);

        t.gateway.scriptText('turn', '@Mira: Third door on the left.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${secondReply.id}/regenerate`).expect(200);
        await settle(storyId, chat.id);
        const regenerated = await bookmarks(storyId, chat.id);
        expect(regenerated.map((bookmark) => bookmark.messageId)).toEqual([opening.id, firstMine.id, secondReply.id]);
        expect(regenerated[2].snippet).toBe('Third door on the left.');

        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/reset`).expect(200);
        // Reset writes the Opening afresh from the Story: nothing of the old Chat is left to mark.
        expect(await bookmarks(storyId, chat.id)).toEqual([]);
    });

    it('copies the Bookmarks at or before the Message to a Branch, under its own ids', async () => {
        const { storyId, chat } = await playedChat('Branch');
        const [opening, firstMine, firstReply, , secondReply] = chat.messages;
        for (const message of [opening, firstReply, secondReply]) await mark(storyId, chat.id, message.id).expect(200);

        const { body: made } = await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${firstReply.id}/branch`).expect(201);
        const { body: branch } = await t.http.get(`/api/stories/${storyId}/chats/${made.id}`).expect(200);

        const copied = await bookmarks(storyId, made.id);
        expect(copied.map((bookmark) => bookmark.messageId)).toEqual([branch.messages[0].id, branch.messages[2].id]);
        expect(copied.map((bookmark) => bookmark.snippet)).toEqual((await bookmarks(storyId, chat.id)).slice(0, 2).map((bookmark) => bookmark.snippet));
        // Each Chat's are its own from here.
        await unmark(storyId, made.id, branch.messages[0].id).expect(200);
        expect((await bookmarks(storyId, chat.id)).map((bookmark) => bookmark.messageId)).toEqual([opening.id, firstReply.id, secondReply.id]);
        expect(firstMine.id).toBeGreaterThan(opening.id);
    });
});

describe('Search matching (pure)', () => {
    it('folds case one unit at a time, keeping offsets', () => {
        expect(foldCase('ÉCOLE Lamp')).toBe('école lamp');
        // "İ" lowers to two units: it stays, so the offsets after it still line up.
        expect(foldCase('İx')).toBe('İx');
        expect(matchAt('The LAMP room', 'lamp')).toBe(4);
        expect(matchAt('abc', '')).toBe(-1);
    });

    it('matches Thai mid-word, with no spaces to split on', () => {
        const text = 'มิราหยิบตะเกียงขึ้นมาแล้วเดินไปที่หน้าต่าง';
        expect(matchAt(text, 'ตะเกียง')).toBe(8);
        expect(matchAt(text, 'เดินไป')).toBeGreaterThan(0);
        expect(matchAt(text, 'ทะเล')).toBe(-1);
    });

    it('collapses whitespace runs, newlines included', () => {
        expect(collapseSpace('  a\n\n b\t c  ')).toBe('a b c');
    });

    it('cuts a snippet at a space when one is near, with "…" at a cut end and the match marked', () => {
        const words = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ');
        const at = words.indexOf('word20');
        const { snippet, match } = snippetAround(words, at, 6);
        expect(snippet.startsWith('…word')).toBe(true);
        expect(snippet.endsWith('…')).toBe(true);
        expect(snippet.slice(match.start, match.start + match.length)).toBe('word20');
        expect(snippet.length).toBeLessThan(140);
    });

    it('never starts or ends a Thai snippet on a vowel or tone mark', () => {
        const thai = 'ที่นี่มีตะเกียงเก่าแก่ที่ส่องแสงทุกคืนเพื่อเรือที่ผ่านไปมาในทะเลที่มืดมิดและคลื่นที่ซัดสาดไม่หยุดหย่อนตลอดทั้งคืนจนเช้า'.repeat(2);
        for (let at = 55; at < 75; at++) {
            const { snippet, match } = snippetAround(thai, at, 2);
            const body = snippet.replace(/^…|…$/gu, '');
            expect(/^\p{M}/u.test(body)).toBe(false);
            expect(thai.includes(body)).toBe(true);
            expect(snippet.slice(match.start, match.start + match.length)).toBe(thai.slice(at, at + 2));
        }
    });

    it('never cuts a surrogate pair', () => {
        const text = '😀'.repeat(80);
        const { snippet } = snippetAround(text, 81, 2);
        expect(snippet.replace(/^…|…$/gu, '')).toMatch(/^(😀)+$/u);
    });

    it(`answers the newest ${SEARCH_HITS_MAX} hits and counts them all`, () => {
        const parts: SearchablePart[] = Array.from({ length: 60 }, (_, index) => ({ messageId: index + 1, kind: 'user', speaker: 'Ash', text: `lamp ${index}` }));
        const { total, hits } = searchParts(parts, 'LAMP');
        expect(total).toBe(60);
        expect(hits).toHaveLength(SEARCH_HITS_MAX);
        expect(hits[0].messageId).toBe(60);
        expect(hits.at(-1)!.messageId).toBe(11);
    });

    it("cuts a Bookmark's lead at about 120 characters", () => {
        expect(leadOf('Short\n\nline.')).toBe('Short line.');
        const long = leadOf('word '.repeat(60));
        expect(long.endsWith('…')).toBe(true);
        expect(long.length).toBeLessThanOrEqual(135);
    });
});
