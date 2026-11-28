import { Logger } from '@nestjs/common';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { gatewayUnderTest } from './harness/gateway-under-test.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Scene move-on by a decision model (.scratch/scene-decisions/spec.md, "Build"): Pplx-decider first,
 * Jev as its backup, both on NanoGPT with ZDR; the Judge's own `move_on` stands only where no host
 * serves decision models.
 */

const DECISIONS = 'https://nano-gpt.com/api/v1/decisions';
const STATE = 'Scene: Arrival. Move-on condition: Nara opens the door.\nLatest exchange: ...';

interface Sent {
    url: string;
    body: Record<string, any>;
}

function scripted(answers: Array<{ status?: number; json: unknown }>): { fetchImpl: FetchLike; sent: Sent[] } {
    const sent: Sent[] = [];
    const left = [...answers];
    const fetchImpl: FetchLike = async (url, init) => {
        if (/\/(credits|key|subscription\/v1\/usage)$/.test(String(url))) return Response.json({ data: { total_credits: 30, total_usage: 20 } });
        sent.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
        const answer = left.shift();
        if (!answer) throw new Error(`No scripted answer for ${url}`);
        return new Response(JSON.stringify(answer.json), { status: answer.status ?? 200, headers: { 'content-type': 'application/json' } });
    };
    return { fetchImpl, sent };
}

const pplx = (happened: number) => ({
    json: { id: 'd1', model: 'perplexity/pplx-decider-v1.2', answers: { status: { type: 'choice', choice: 'x', probabilities: { happened, partly: 0, not_really: 1 - happened, not_yet: 0 } } }, usage: { input_tokens: 812, output_tokens: 3, cost: 0 } },
});
const jev = (noul: number) => ({ json: { id: 'd2', model: 'typesafe/jev-1.14', answers: { met: { type: 'noul', noul } }, usage: { input_tokens: 790, output_tokens: 2, cost: 0 } } });
const DOWN = { status: 503, json: { error: { message: 'The requested service is temporarily unavailable.', code: 'provider_unavailable' } } };

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Scene decisions on NanoGPT (contract)', () => {
    const SERVED = { storyId: 1, chatId: 4, messageId: 9 };

    it('asks Pplx-decider the four-way question with ZDR, meets the condition at 0.55, and records it at $0', async () => {
        const { fetchImpl, sent } = scripted([pplx(0.91)]);
        const { gateway, records } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt', 'openrouter', 'free'] });

        const decision = await gateway.decide({ kind: 'scene_decision', state: STATE, servedFor: SERVED });

        expect(decision).toEqual({ met: true, probability: 0.91, model: 'pplx-decider-v1.2' });
        expect(sent).toHaveLength(1);
        expect(sent[0].url).toBe(DECISIONS);
        expect(sent[0].body).toMatchObject({ model: 'perplexity/pplx-decider-v1.2', state: STATE, provider: { zdr: true } });
        expect(sent[0].body.questions.status).toMatchObject({ type: 'choice' });
        expect(Object.keys(sent[0].body.questions.status.criteria)).toEqual(['happened', 'partly', 'not_really', 'not_yet']);
        expect(records).toEqual([
            {
                kind: 'scene_decision',
                pool: 'text',
                model: 'pplx-decider-v1.2',
                host: 'nanogpt',
                promptTokens: 812,
                completionTokens: 0,
                images: null,
                costUsd: 0,
                ...SERVED,
            },
        ]);
    });

    it('says not met below 0.55', async () => {
        const { fetchImpl } = scripted([pplx(0.4)]);
        const { gateway } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt', 'openrouter'] });

        expect(await gateway.decide({ kind: 'scene_decision', state: STATE })).toEqual({ met: false, probability: 0.4, model: 'pplx-decider-v1.2' });
    });

    it('asks Jev the plain question when Pplx-decider fails, met at 0.7', async () => {
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
        const { fetchImpl, sent } = scripted([DOWN, jev(0.72)]);
        const { gateway, records } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt', 'openrouter'] });

        const decision = await gateway.decide({ kind: 'scene_decision', state: STATE });

        expect(decision).toEqual({ met: true, probability: 0.72, model: 'jev-1.14' });
        expect(sent[1].body).toMatchObject({ model: 'typesafe/jev-1.14', provider: { zdr: true }, questions: { met: { type: 'noul' } } });
        expect(records).toEqual([expect.objectContaining({ kind: 'scene_decision', model: 'jev-1.14', host: 'nanogpt', promptTokens: 790 })]);
    });

    it('fails when both decision models fail, and records nothing', async () => {
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
        const { fetchImpl } = scripted([DOWN, DOWN]);
        const { gateway, records } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt', 'openrouter'] });

        await expect(gateway.decide({ kind: 'scene_decision', state: STATE })).rejects.toBeInstanceOf(ProviderOutageError);
        expect(records).toEqual([]);
    });

    it('answers null, asking nothing, when no host in the chain serves decision models', async () => {
        const { fetchImpl, sent } = scripted([]);
        const { gateway } = gatewayUnderTest(fetchImpl, { textHosts: ['openrouter', 'free'] });

        expect(await gateway.decide({ kind: 'scene_decision', state: STATE })).toBeNull();
        expect(sent).toEqual([]);
    });
});

describe('Scene decisions in the Judge', () => {
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

    const judgement = (moveOn: boolean, passedBy = false) =>
        JSON.stringify({ bond_changes: [], arc_steps: [], scene: { reason: moveOn ? 'Nara opened the door.' : 'Not yet.', move_on: moveOn, passed_by: passedBy, went_to: null } });

    async function chatInArrival(): Promise<{ storyId: number; chatId: number }> {
        const storyId = (await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island.', opening: 'The lamp went out.\n\n@Nara: Boots off.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Nara', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.' }).expect(201);
        await t.http.post(`/api/stories/${storyId}/scenes`).send({ name: 'Arrival', situation: 'Ash reaches the lighthouse.', moveOnCondition: 'Nara opens the door.' }).expect(201);
        await t.http.post(`/api/stories/${storyId}/scenes`).send({ name: 'The lamp', situation: 'Light it.', moveOnCondition: 'The lamp is lit.' }).expect(201);
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        return { storyId, chatId };
    }

    async function play(storyId: number, chatId: number, judge: string): Promise<string | undefined> {
        t.gateway.scriptText('turn', '@Nara: Hm.');
        t.gateway.scriptText('judge', judge);
        t.gateway.scriptText('memory_extraction', '{"operations":[]}');
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'I knock.' }).expect(201);
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
            const last = [...chat.messages].reverse().find((message: { kind: string; judge?: { status: string } }) => message.kind === 'ai' && message.judge);
            if (!last || last.judge.status !== 'pending') return chat.currentScene?.name;
            if (Date.now() > deadline) throw new Error('The judge did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
    }

    it('moves on when the decision model says met, though the Judge said no, with the condition as the event', async () => {
        const { storyId, chatId } = await chatInArrival();
        t.gateway.scriptDecision('scene_decision', { met: true, probability: 0.93, model: 'pplx-decider-v1.2' });

        expect(await play(storyId, chatId, judgement(false))).toBe('The lamp');

        const state = t.gateway.decisionCalls('scene_decision')[0].state;
        expect(state).toContain('Move-on condition: Nara opens the door.');
        expect(state).toContain('I knock.');
        expect(state).toContain('@Nara: Hm.');
        const board = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/dashboard`).expect(200)).body;
        expect(board.scene.advance).toMatchObject({ fromSceneName: 'Arrival', toSceneName: 'The lamp', event: 'Nara opens the door.' });
    });

    it('stays when the decision model says not met, though the Judge said yes', async () => {
        const { storyId, chatId } = await chatInArrival();
        t.gateway.scriptDecision('scene_decision', { met: false, probability: 0.2, model: 'pplx-decider-v1.2' });

        expect(await play(storyId, chatId, judgement(true))).toBe('Arrival');
    });

    it('stays when the decision fails, whatever the Judge said', async () => {
        vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
        const { storyId, chatId } = await chatInArrival();
        t.gateway.scriptDecision('scene_decision', new ProviderOutageError('both decision models are down'));

        expect(await play(storyId, chatId, judgement(true))).toBe('Arrival');
    });

    it("keeps the Judge's own move_on where no host serves decision models", async () => {
        const { storyId, chatId } = await chatInArrival();

        expect(await play(storyId, chatId, judgement(true))).toBe('The lamp');
        expect(t.gateway.decisionCalls('scene_decision')).toHaveLength(1);
    });
});
