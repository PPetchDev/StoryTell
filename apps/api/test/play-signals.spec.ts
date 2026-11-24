import { formatPlaySignals, playSignals, SignalQuery } from '../src/manager/play-signals/play-signals.js';
import { createDataSource } from '../src/store/db/data-source.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * The play-signals report (.scratch/reply-repair/spec.md, ticket 05): what the user's own
 * Regenerates say. It reads a database, changes nothing, and prints counts and rates only. Here it
 * reads a test database seeded through the API.
 */
describe('The play-signals report', () => {
    let t: TestApp;
    let source: ReturnType<typeof createDataSource>;
    let query: SignalQuery;

    const NO_OPS = '{"operations":[]}';
    const NO_CHANGE = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' } });
    /** Words no report line may hold: they are in the replies, the Story's title and the Character's name. */
    const PRIVATE = ['kettle', 'Moonlit Camp', 'Nara', 'Tea?'];

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

    function script(reply: string) {
        t.gateway.scriptText('turn', { text: reply, model: 'glm-5.3' });
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
    }

    let storyId: number;
    let chatId: number;

    beforeAll(async () => {
        t = await startTestApp();
        source = createDataSource(t.databaseUrl);
        await source.initialize();
        query = (sql, params) => source.query(sql, params);

        storyId = (await t.http.post('/api/stories').send({ title: 'Moonlit Camp' }).expect(201)).body.id;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A summer camp.', opening: 'Smoke rises from the fire.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'A traveller.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Short.' }).expect(201);
        chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id;

        // Three replies. The last is first written with no speech line; the user Regenerates it, and the reply kept in
        // its place has Nara speaking. Only a Chat's newest AI Message keeps its replaced replies: sending the next
        // Message drops them, so the Regenerate has to be the last thing done here.
        const send = async (text: string, reply: string) => {
            script(reply);
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
            await settle(storyId, chatId);
        };
        await send('I sit.', 'Nara fills the kettle.\n\n@Nara: Tea?');
        await send('Thanks.', '@Stranger: Evening.');
        await send('Yes.', 'Nara fills the kettle and says nothing at all.');
        const last = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body.messages.at(-1).id;
        script('@Nara: Here. *hands it over* Careful.');
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${last}/regenerate`).expect(200);
        await settle(storyId, chatId);
    });

    afterAll(async () => {
        await source.destroy();
        await t.close();
    });

    it('counts, by play model and week, the AI Messages written, those with a replaced reply, and what the kept and the replaced replies had wrong', async () => {
        const groups = await playSignals(query);

        expect(groups).toHaveLength(1);
        const [group] = groups;
        expect(group.model).toBe('glm-5.3');
        expect(group.week).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // The Opening is the author's, not a play model's: three replies, one of them Regenerated once.
        expect(group).toMatchObject({ aiMessages: 3, regenerated: 1 });
        expect(group.kept).toMatchObject({ replies: 3, noSpeechLine: 0, unknownSpeaker: 1, stageDirectionInSpeech: 1 });
        expect(group.replaced).toMatchObject({ replies: 1, noSpeechLine: 1, unknownSpeaker: 0, stageDirectionInSpeech: 0 });
        expect(group.kept.words).toBeGreaterThan(0);
    });

    it('prints counts and rates, and nothing of a reply, a Story or a Character', async () => {
        const text = formatPlaySignals(await playSignals(query), { minimum: 1 });

        expect(text).toContain('glm-5.3');
        expect(text).toContain('AI Messages 3, Regenerated 1 (33%)');
        expect(text).toContain('no speech line: kept 0% (0 of 3), replaced 100% (1 of 1)');
        expect(text).toContain('a stage direction in a speech line: kept 33% (1 of 3), replaced 0% (0 of 1)');
        for (const word of PRIVATE) expect(text).not.toContain(word);
    });

    it('gives no rate where there are too few replies to say anything', async () => {
        const text = formatPlaySignals(await playSignals(query));

        expect(text).toContain('no speech line: kept too few (3), replaced too few (1)');
    });

    it('says in its own words that an edit of an AI Message is not counted', async () => {
        expect(formatPlaySignals(await playSignals(query))).toContain('An edit of an AI Message is not counted: the app keeps no trace of one.');
    });

    it('reads one account’s replies when one is named, and says so when there are none', async () => {
        const [{ user_id: owner }] = (await source.query('SELECT "user_id" FROM "story" WHERE "id" = $1', [storyId])) as { user_id: number }[];

        expect(await playSignals(query, { userId: owner })).toHaveLength(1);
        expect(await playSignals(query, { userId: owner + 1000 })).toEqual([]);
        expect(formatPlaySignals([])).toContain('No AI Messages by a play model.');
    });

    it('says that it undercounts: a replaced reply is kept only while its Message is the Chat’s newest', async () => {
        expect(formatPlaySignals(await playSignals(query))).toContain(
            'Regenerates are undercounted: a replaced reply is kept only while its Message is the newest of its Chat, and is dropped when the next Message is sent.',
        );
    });

    it('gives no share of nothing: a week and model with replaced replies only prints no percentage', () => {
        const tally = { replies: 0, noSpeechLine: 0, unknownSpeaker: 0, stageDirectionInSpeech: 0, sharedPhrase: 0, words: 0, overused: 0 };
        const text = formatPlaySignals([{ week: '2026-11-23', model: 'glm-5.3', aiMessages: 0, regenerated: 0, kept: tally, replaced: { ...tally, replies: 2, noSpeechLine: 1 } }], { minimum: 1 });

        expect(text).not.toContain('NaN');
        expect(text).toContain('AI Messages 0, Regenerated 0');
        expect(text).toContain('no speech line: kept too few (0), replaced 50% (1 of 2)');
    });

    it('says what else it cannot count', async () => {
        const text = formatPlaySignals(await playSignals(query));

        expect(text).toContain('A line written as the user is not counted: the reply parser cuts it before a reply is stored.');
        expect(text).toContain('A line by a Character deleted since reads as an unknown speaker’s.');
        expect(text).toContain('The Messages a Branch copied are counted again in the Branch.');
    });

    it('writes nothing', async () => {
        const counts = async () => (await source.query('SELECT (SELECT count(*) FROM "message") AS m, (SELECT count(*) FROM "message_part") AS p, (SELECT count(*) FROM "reply_version") AS v, (SELECT count(*) FROM "detail_change") AS d'))[0];
        const before = await counts();

        await playSignals(query);

        expect(await counts()).toEqual(before);
    });
});
