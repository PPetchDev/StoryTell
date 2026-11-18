import pg from 'pg';
import { DataSource } from 'typeorm';

import { SecretRevealEntity } from '../src/model/ledger/entities/secret-reveal.entity.js';
import { CharacterSecretEntity } from '../src/model/story/entities/character-secret.entity.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Secret reveals (.scratch/secret-reveals/spec.md) through the HTTP API with the fake gateway: the
 * Secret routes, a Secret opening as a scripted Judge raises the Bond, the Narrator told, the Judge
 * asked, a reveal recorded, shown in the Chat and taken back with its Message.
 */

interface Secret {
    id: number;
    text: string;
    axis: string | null;
    atLeast: number | null;
}
interface Story {
    id: number;
    characters: Array<{ id: number; name: string; secretList: Secret[] }>;
}
interface Chat {
    id: number;
    secretReveals: Array<{ secretId: number; characterId: number; messageId: number; text: string }>;
    messages: Array<{ id: number; kind: 'user' | 'ai'; judge?: { status: string } | null; memory?: { status: string } | null }>;
}

const MARRIED = 'She was married once, to the bandit chief.';
const BOOK = 'She burned the old herd book.';
const SONG = 'She hums her mother’s song when afraid.';
const QUIET = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"no"}}';
const TRUSTS =
    '{"bond_changes":[{"from":"Nara","to":"user","label":"Trusting","description":"She lets Ash close.","levels":{"trust":2,"affection":0,"desire":0,"tension":0},"cause":"Ash kept watch."}],"arc_steps":[],"scene":{"move_on":false,"reason":"no"}}';
const REVEALS = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"no"},"secrets_revealed":[1]}';

describe('Secret reveals: through the HTTP API', () => {
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

    async function createStory(): Promise<{ storyId: number; nara: number }> {
        const storyId = (await t.http.post('/api/stories').send({ title: 'The Steppe' }).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'The open steppe.', opening: '@Nara: You again.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'A rider.' }).expect(200);
        const story = (await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Nara', appearance: 'Tall.', personality: 'Proud.', voice: 'Dry.' }).expect(201)).body as Story;
        const nara = story.characters[0].id;
        await t.http
            .post(`/api/stories/${storyId}/starting-bonds`)
            .send({ fromCharacterId: nara, toCharacterId: null, label: 'Wary', description: 'She watches Ash.', trust: 1 })
            .expect(201);
        return { storyId, nara };
    }

    /** Adds a Secret and sets it; answers its id. */
    async function addSecret(storyId: number, characterId: number, fields: Partial<Secret>): Promise<number> {
        const base = `/api/stories/${storyId}/characters/${characterId}/secrets`;
        const added = (await t.http.post(base).expect(201)).body as Story;
        const secret = added.characters.find((character) => character.id === characterId)!.secretList.at(-1)!;
        expect(secret).toMatchObject({ text: '', axis: null, atLeast: null });
        await t.http.patch(`${base}/${secret.id}`).send(fields).expect(200);
        return secret.id;
    }

    async function settled(storyId: number, chatId: number): Promise<Chat> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as Chat;
            const last = [...chat.messages].reverse().find((message) => message.kind === 'ai' && message.judge);
            if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    function script(judgement: string): void {
        t.gateway.scriptText('turn', { text: '@Nara: Sit, then.', model: 'glm-5.3' });
        t.gateway.scriptText('judge', judgement);
        t.gateway.scriptText('memory_extraction', '{"operations":[]}');
    }

    async function send(storyId: number, chatId: number, judgement: string): Promise<Chat> {
        script(judgement);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'I keep watch by the fire.' }).expect(201);
        return settled(storyId, chatId);
    }

    const lastJudge = (): TextCompletionRequest => t.gateway.textCalls('judge').at(-1)!;
    const lastClosing = (): string => t.gateway.textCalls('turn').at(-1)!.messages.at(-1)!.content;

    it('keeps the tables as the entities declare them', async () => {
        for (const entity of [CharacterSecretEntity, SecretRevealEntity]) {
            const metadata = t.app.get(DataSource).getMetadata(entity);
            const client = new pg.Client({ connectionString: t.databaseUrl });
            await client.connect();
            const { rows } = await client.query<{ column_name: string; is_nullable: 'YES' | 'NO' }>(
                `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
                [metadata.tableName],
            );
            await client.end();
            const migrated = new Map(rows.map((row) => [row.column_name, row]));
            for (const column of metadata.columns) {
                expect(migrated.get(column.databaseName), `${metadata.tableName}.${column.databaseName}`).toBeDefined();
                expect(migrated.get(column.databaseName)!.is_nullable === 'YES').toBe(column.isNullable);
            }
        }
    });

    it('adds, changes and removes Secrets, refuses bad ones, and Duplicate copies them', async () => {
        const { storyId, nara } = await createStory();
        const base = `/api/stories/${storyId}/characters/${nara}/secrets`;
        const married = await addSecret(storyId, nara, { text: MARRIED, axis: 'trust', atLeast: 2 });
        const song = await addSecret(storyId, nara, { text: SONG });
        let story = (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story;
        expect(story.characters[0].secretList).toEqual([
            { id: married, text: MARRIED, axis: 'trust', atLeast: 2 },
            { id: song, text: SONG, axis: null, atLeast: null },
        ]);

        // A level outside the scale, half a level, an unknown feeling, too long a text.
        expect((await t.http.patch(`${base}/${married}`).send({ axis: 'tension', atLeast: -1 }).expect(422)).body.error.code).toBe('422.003.151');
        expect((await t.http.patch(`${base}/${song}`).send({ axis: 'trust' }).expect(422)).body.error.code).toBe('422.003.151');
        await t.http.patch(`${base}/${married}`).send({ atLeast: 9 }).expect(400);
        await t.http.patch(`${base}/${married}`).send({ axis: 'love' }).expect(400);
        await t.http.patch(`${base}/${married}`).send({ text: 'x'.repeat(1001) }).expect(400);
        expect((await t.http.patch(`${base}/9999`).send({ text: 'x' }).expect(404)).body.error.code).toBe('404.003.150');
        await t.http.delete(`${base}/9999`).expect(404);
        await t.http.post(`/api/stories/${storyId}/characters/9999/secrets`).expect(404);
        // Only the level changes; clearing the feeling clears the level.
        story = (await t.http.patch(`${base}/${married}`).send({ atLeast: 3 }).expect(200)).body as Story;
        expect(story.characters[0].secretList[0]).toEqual({ id: married, text: MARRIED, axis: 'trust', atLeast: 3 });
        story = (await t.http.patch(`${base}/${married}`).send({ axis: null }).expect(200)).body as Story;
        expect(story.characters[0].secretList[0]).toEqual({ id: married, text: MARRIED, axis: null, atLeast: null });
        await t.http.patch(`${base}/${married}`).send({ axis: 'affection', atLeast: 1 }).expect(200);

        for (let i = 2; i < 8; i++) await t.http.post(base).expect(201);
        expect((await t.http.post(base).expect(422)).body.error.code).toBe('422.003.152');

        const copy = (await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201)).body as Story;
        expect(copy.characters[0].secretList.slice(0, 2).map(({ text, axis, atLeast }) => ({ text, axis, atLeast }))).toEqual([
            { text: MARRIED, axis: 'affection', atLeast: 1 },
            { text: SONG, axis: null, atLeast: null },
        ]);
        expect(copy.characters[0].secretList).toHaveLength(8);
        expect(copy.characters[0].secretList[0].id).not.toBe(married);

        story = (await t.http.delete(`${base}/${song}`).expect(200)).body as Story;
        expect(story.characters[0].secretList.map((secret) => secret.id)).not.toContain(song);
        await t.http.delete(`/api/stories/${copy.id}`).expect(204);
        await t.http.delete(`/api/stories/${storyId}`).expect(204);
    });

    it('opens a Secret as the Bond grows, tells the Narrator, records the Judge’s reveal, and takes it back with its Message', async () => {
        const { storyId, nara } = await createStory();
        const married = await addSecret(storyId, nara, { text: MARRIED, axis: 'trust', atLeast: 2 });
        await addSecret(storyId, nara, { text: BOOK, axis: 'trust', atLeast: 2 });
        await addSecret(storyId, nara, { text: SONG });
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
        expect(chat.secretReveals).toEqual([]);

        // Trust "inclined to trust": nothing open. The card holds the Secrets all the same; the shape names the field.
        await send(storyId, chat.id, TRUSTS);
        const turn = t.gateway.textCalls('turn').at(-1)!;
        expect(turn.messages[0].content).toContain(`Secrets Nara keeps for now (Nara does not tell them, or hint at them outright, until the Narrator's notes say Nara may):\n- ${MARRIED}\n- ${BOOK}`);
        expect(turn.messages[0].content).toContain(`- ${SONG}`);
        expect(lastClosing()).not.toContain('# Secrets');
        const shape = lastJudge().messages[0].content;
        expect(shape).toContain('"secrets_revealed":[]}');
        expect(lastJudge().messages[1].content).not.toContain('# Secrets that may come out');

        // The Judge raised Trust to "trusts": the next turn offers the first, and the Judge is asked about it.
        let played = await send(storyId, chat.id, REVEALS);
        expect(lastClosing()).toContain(`# Secrets\n- Nara may now tell Ash this, if and when the moment truly fits; never force it or steer toward it: ${MARRIED}`);
        expect(lastClosing()).not.toContain(BOOK);
        expect(lastJudge().messages[0].content).toBe(shape);
        expect(lastJudge().messages[1].content).toContain(`# Secrets that may come out\n[1] Nara: ${MARRIED}`);
        const told = played.messages.at(-1)!;
        expect(played.secretReveals).toEqual([{ secretId: married, characterId: nara, messageId: told.id, text: MARRIED }]);
        // Never a Secret not yet revealed, nor one without a level, anywhere in the Chat.
        expect(JSON.stringify(played)).not.toContain(BOOK);
        expect(JSON.stringify(played)).not.toContain(SONG);

        // The next turn reads it as told and offers the second; a reveal of a number not offered is dropped.
        played = await send(storyId, chat.id, '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"no"},"secrets_revealed":[2]}');
        expect(lastClosing()).toContain(`Already told to Ash, so never told again as news: Nara: ${MARRIED}`);
        expect(lastClosing()).toContain(`- Nara may now tell Ash this, if and when the moment truly fits; never force it or steer toward it: ${BOOK}`);
        expect(played.secretReveals).toHaveLength(1);

        // A Branch at the Message before the telling has none; one at the telling Message carries it.
        const early = (await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${played.messages[played.messages.findIndex((message) => message.id === told.id) - 2].id}/branch`).expect(201)).body as Chat;
        expect(early.secretReveals).toEqual([]);
        const branch = (await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${told.id}/branch`).expect(201)).body as Chat;
        expect(branch.secretReveals).toEqual([{ secretId: married, characterId: nara, messageId: branch.messages.at(-1)!.id, text: MARRIED }]);
        await t.http.delete(`/api/stories/${storyId}/chats/${early.id}`).expect(204);
        await t.http.delete(`/api/stories/${storyId}/chats/${branch.id}`).expect(204);

        // Reset clears every reveal.
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/reset`).expect(200);
        expect(((await t.http.get(`/api/stories/${storyId}/chats/${chat.id}`).expect(200)).body as Chat).secretReveals).toEqual([]);
        await t.http.delete(`/api/stories/${storyId}`).expect(204);
    });

    it('takes a reveal back when its reply is regenerated, and the Secret is offered again', async () => {
        const { storyId, nara } = await createStory();
        const married = await addSecret(storyId, nara, { text: MARRIED, axis: 'trust', atLeast: 1 });
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
        // Trust is "inclined to trust" from the start: open at once.
        const played = await send(storyId, chat.id, REVEALS);
        expect(played.secretReveals.map((reveal) => reveal.secretId)).toEqual([married]);

        script(QUIET);
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${played.messages.at(-1)!.id}/regenerate`).expect(200);
        const again = await settled(storyId, chat.id);
        expect(again.secretReveals).toEqual([]);
        // The regenerated reply was written with the Secret on offer again, and judged with it.
        expect(lastClosing()).toContain(`may now tell Ash this, if and when the moment truly fits; never force it or steer toward it: ${MARRIED}`);
        expect(lastJudge().messages[1].content).toContain(`[1] Nara: ${MARRIED}`);

        // Told again, then the author removes the Secret: its reveal goes with it.
        const told = await send(storyId, chat.id, REVEALS);
        expect(told.secretReveals).toHaveLength(1);
        await t.http.delete(`/api/stories/${storyId}/characters/${nara}/secrets/${married}`).expect(200);
        expect(((await t.http.get(`/api/stories/${storyId}/chats/${chat.id}`).expect(200)).body as Chat).secretReveals).toEqual([]);
        await t.http.delete(`/api/stories/${storyId}`).expect(204);
    });

    it('sends the Judge exactly the prompt it sent before for a Story with no levelled Secret', async () => {
        const { storyId, nara } = await createStory();
        await addSecret(storyId, nara, { text: SONG });
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
        await send(storyId, chat.id, REVEALS);
        expect(lastJudge().messages[0].content).not.toContain('secrets_revealed');
        expect(lastJudge().messages[1].content).not.toContain('# Secrets');
        expect(lastClosing()).not.toContain('# Secrets');
        expect(((await t.http.get(`/api/stories/${storyId}/chats/${chat.id}`).expect(200)).body as Chat).secretReveals).toEqual([]);
        await t.http.delete(`/api/stories/${storyId}`).expect(204);
    });
});
