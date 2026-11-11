import { DataSource } from 'typeorm';

import { LedgerModelService } from '../src/model/ledger/ledger.service.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Branch ticket 01 (.scratch/branch/issues/01-rollback-in-a-callers-transaction.md): the
 * ledger's rollback can run inside a caller's transaction, so a Branch can copy a Chat and roll
 * the copy back as one. Given a manager it writes nothing until that transaction commits, and
 * nothing at all when it rolls back. Every existing caller keeps its own transaction (the
 * regenerate, reply-versions, judge and memory specs cover those).
 */

interface Dashboard {
    characters: Array<{
        name: string;
        bonds: Array<{ toward: { name: string }; label: string }>;
        arcChanges: Array<{ cause: string }>;
    }>;
    scene: { current: { name: string } | null };
}

interface Memory {
    text: string;
    writtenBy: 'ai' | 'user';
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';

describe('Ledger rollback inside a caller\'s transaction', () => {
    let t: TestApp;
    let ledger: LedgerModelService;
    let dataSource: DataSource;

    beforeAll(async () => {
        t = await startTestApp();
        ledger = t.app.get(LedgerModelService);
        dataSource = t.app.get(DataSource);
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    /** A Chat whose one reply (Message at position 2) changed a Bond, an Arc, the Scene and the Memory. */
    async function playedChat(): Promise<{ storyId: number; chatId: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse, 1890s.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const mira = await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short sentences.' })
            .expect(201);
        await t.http
            .post(`/api/stories/${storyId}/starting-bonds`)
            .send({ fromCharacterId: mira.body.characters[0].id, toCharacterId: null, label: 'Wary', description: 'She expects Ash to leave.' })
            .expect(201);
        await t.http
            .post(`/api/stories/${storyId}/scenes`)
            .send({ name: 'Arrival', situation: 'Reach the lamp room.', moveOnCondition: 'Mira lets Ash up.' })
            .expect(201);
        await t.http.post(`/api/stories/${storyId}/scenes`).send({ name: 'The lamp', situation: 'Light it.' }).expect(201);
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;

        t.gateway.scriptText('turn', '@Mira: Fine. Come up.');
        t.gateway.scriptText(
            'judge',
            JSON.stringify({
                bond_changes: [{ from: 'Mira', to: 'user', label: 'Curious', description: 'Curious.', cause: 'Ash climbed.' }],
                arc_steps: [{ character: 'Mira', step: 'Softens.', cause: 'Ash stayed.' }],
                scene: { move_on: true, reason: 'She let Ash up.' },
            }),
        );
        t.gateway.scriptText(
            'memory_extraction',
            JSON.stringify({ operations: [{ op: 'add', text: 'Mira let {user} up.', known_by: ['Mira'], cause: 'she did' }] }),
        );
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'I climb.' }).expect(201);
        const deadline = Date.now() + 5_000;
        for (;;) {
            const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200);
            const last = body.messages[body.messages.length - 1];
            if (last.judge?.status === 'done' && last.memory?.status === 'done') break;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return { storyId, chatId };
    }

    /** What the Chat holds now, as the dashboard and the Memory list read it from outside. */
    async function state(storyId: number, chatId: number) {
        const board = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/dashboard`).expect(200)).body as Dashboard;
        const memories = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/memories`).expect(200)).body.memories as Memory[];
        const mira = board.characters.find((character) => character.name === 'Mira')!;
        return {
            bonds: mira.bonds.map((bond) => bond.label),
            arcChanges: mira.arcChanges.map((change) => change.cause),
            scene: board.scene.current?.name ?? null,
            memories: memories.map((memory) => memory.text),
        };
    }

    const PLAYED = { bonds: ['Curious'], arcChanges: ['Ash stayed.'], scene: 'The lamp', memories: ['Mira let {user} up.'] };
    const ROLLED_BACK = { bonds: ['Wary'], arcChanges: [], scene: 'Arrival', memories: [] };

    it('writes nothing until the outer transaction commits, then the rollback lands', async () => {
        const { storyId, chatId } = await playedChat();
        expect(await state(storyId, chatId)).toEqual(PLAYED);

        await dataSource.transaction(async (manager) => {
            const counts = await ledger.rollbackFrom(chatId, 2, manager);
            expect(counts).toEqual({ memoryChanges: 1, bondChanges: 1, arcSteps: 1, sceneAdvances: 1 });
            // Read from outside the transaction: not committed yet, so nothing shows.
            expect(await state(storyId, chatId)).toEqual(PLAYED);
        });

        expect(await state(storyId, chatId)).toEqual(ROLLED_BACK);
    });

    it('leaves nothing rolled back when the outer transaction fails afterwards', async () => {
        const { storyId, chatId } = await playedChat();

        await expect(
            dataSource.transaction(async (manager) => {
                await ledger.rollbackFrom(chatId, 2, manager);
                throw new Error('a later copy step failed');
            }),
        ).rejects.toThrow('a later copy step failed');

        expect(await state(storyId, chatId)).toEqual(PLAYED);
    });

    it('without a manager still runs in its own transaction, as every existing caller uses it', async () => {
        const { storyId, chatId } = await playedChat();

        const counts = await ledger.rollbackFrom(chatId, 2);

        expect(counts).toEqual({ memoryChanges: 1, bondChanges: 1, arcSteps: 1, sceneAdvances: 1 });
        expect(await state(storyId, chatId)).toEqual(ROLLED_BACK);
    });
});
