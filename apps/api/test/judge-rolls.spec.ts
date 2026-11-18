import { buildJudgePrompt, parseJudgement } from '../src/manager/chat/judge/judge-prompt.js';
import { judgeFactsSection } from '../src/manager/chat/details/facts.js';
import { rollBlock, rollOutcome } from '../src/manager/chat/roll.js';
import {
    applyRollOffer,
    judgeRollOfferSection,
    OfferMessage,
    pendingRollOffer,
    readJudgedRollOffer,
    ROLL_OFFER_EXTRA_TOKENS,
    ROLL_OFFER_GAP,
    rollOfferAllowed,
    statsProblem,
} from '../src/manager/chat/roll-offer/roll-offer.js';
import { MessageKind } from '../src/model/chat/entities/message.entity.js';
import { Dice } from '../src/service/dice/dice.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Roll offers and Stats (.scratch/judge-rolls/spec.md): a Roll for a Role's Stat, when the Judge
 * may offer one, its section and reply shape, and the offer a Chat shows. Pure logic first, then
 * through the HTTP API with the fake gateway and the dice scripted.
 */

const opening: OfferMessage = { kind: MessageKind.Ai, model: 'author', roll: null, rollOffer: null };
const user = (roll: number | null = null): OfferMessage => ({ kind: MessageKind.User, model: null, roll, rollOffer: null });
const reply = (offer = false, epilogue = false): OfferMessage => ({
    kind: MessageKind.Ai,
    model: 'glm-5.3',
    roll: null,
    rollOffer: offer ? { stakes: 'Can you?', stat: null, dismissed: false } : null,
    epilogue,
});
/** The Opening, then `count` exchanges; the last reply is the one judged. */
const exchanges = (count: number, last: Partial<{ roll: number; epilogue: boolean }> = {}): OfferMessage[] => {
    const messages = [opening];
    for (let i = 1; i <= count; i++) messages.push(user(i === count ? (last.roll ?? null) : null), reply(false, i === count && last.epilogue === true));
    return messages;
};
const allowed = (messages: OfferMessage[], rollOffers = true) => rollOfferAllowed({ rollOffers, messages, index: messages.length - 1 });

describe('Roll offers and Stats (pure)', () => {
    it('adds the Stat to the throw, keeps a natural 20 and 1 critical, and tells the Narrator the sum', () => {
        const strength = { name: 'Strength', bonus: 2 };
        expect(rollOutcome({ value: 9, target: 11, stat: strength })).toBe('success');
        expect(rollOutcome({ value: 8, target: 11, stat: strength })).toBe('failure');
        expect(rollOutcome({ value: 12, target: 11, stat: { name: 'Charm', bonus: -2 } })).toBe('failure');
        expect(rollOutcome({ value: 1, target: 2, stat: { name: 'Luck', bonus: 5 } })).toBe('critical_failure');
        expect(rollOutcome({ value: 20, target: 11, stat: { name: 'Charm', bonus: -3 } })).toBe('critical_success');
        expect(rollBlock({ value: 9, target: 11, stat: strength }, 'Ash')).toContain('a success (9 + 2 for Strength = 11, needing 11 or more). It works.');
        expect(rollBlock({ value: 12, target: 11, stat: { name: 'Charm', bonus: -2 } }, 'Ash')).toContain('a failure (12 - 2 for Charm = 10, needing 11 or more)');
        // Without a Stat the block reads as before.
        expect(rollBlock({ value: 14, target: 11, stat: null }, 'Ash')).toBe(rollBlock({ value: 14, target: 11 }, 'Ash'));
    });

    it(`allows an offer only after ${ROLL_OFFER_GAP} written replies since the last offer or Roll, and never on a Roll or an Epilogue`, () => {
        expect(allowed(exchanges(ROLL_OFFER_GAP - 1))).toBe(false);
        expect(allowed(exchanges(ROLL_OFFER_GAP))).toBe(true);
        expect(allowed(exchanges(ROLL_OFFER_GAP), false)).toBe(false);
        // The User Message it answers had a Roll: the dice already decided this moment.
        expect(allowed(exchanges(ROLL_OFFER_GAP + 3, { roll: 12 }))).toBe(false);
        expect(allowed(exchanges(ROLL_OFFER_GAP + 3, { epilogue: true }))).toBe(false);
        // An earlier offer, taken, dismissed or ignored, starts the count again; so does a Roll.
        const afterOffer = [...exchanges(3).slice(0, -1), reply(true), ...exchanges(ROLL_OFFER_GAP - 1).slice(1)];
        expect(allowed(afterOffer)).toBe(false);
        expect(allowed([...afterOffer, user(), reply()])).toBe(true);
        // The reply to the Roll is the first after it.
        const afterRoll = [opening, user(15), reply(), ...exchanges(ROLL_OFFER_GAP - 2).slice(1)];
        expect(allowed(afterRoll)).toBe(false);
        expect(allowed([...afterRoll, user(), reply()])).toBe(true);
        // The judged reply's own offer, from an earlier judgement of it, does not count against it.
        const judgedAgain = exchanges(ROLL_OFFER_GAP);
        judgedAgain[judgedAgain.length - 1] = reply(true);
        expect(allowed(judgedAgain)).toBe(true);
    });

    it('asks the Judge in a section of its own, names the field in the reply shape on every call, and keeps the system message the same', () => {
        const section = judgeRollOfferSection([{ name: 'Strength', value: 2 }, { name: 'Charm', value: -1 }]);
        expect(section).toMatch(/^# Roll offer\n/);
        expect(section).toContain('Their Stats: Strength +2, Charm -1.');
        expect(section).toContain('set "roll_offer" to {"stakes": "...", "stat": "..."} only when');
        expect(section).toContain('Never offer during an intimate, romantic or sexual moment');
        expect(judgeRollOfferSection([])).toContain('Their Stats: none.');

        const input = { cast: [], identityName: 'Ash', bonds: [], arcs: [], scene: null, recent: [], userText: 'I run.', aiText: '@Mira: Faster!', factsSection: judgeFactsSection([]) };
        const plain = buildJudgePrompt(input);
        const offering = buildJudgePrompt({ ...input, rollOfferSection: section });
        // The field is named in the shape of the system message sent with the facts (every call on live), offer or not.
        expect(plain.messages[0].content).toContain(',\n "roll_offer":null}\nEmpty arrays when nothing changed.');
        expect(offering.messages[0].content).toBe(plain.messages[0].content);
        const tagged = { ...input, expressionParts: [{ kind: 'speech' as const, characterId: 1, speakerName: 'Mira', text: 'Faster!' }] };
        expect(buildJudgePrompt(tagged).messages[0].content).toBe(buildJudgePrompt({ ...tagged, rollOfferSection: section }).messages[0].content);
        expect(buildJudgePrompt(tagged).messages[0].content).toContain('"roll_offer":null}');
        // The section goes last, with its tokens; without it, the user message is as before.
        expect(offering.messages[1].content).toBe(`${plain.messages[1].content}\n\n${section}`);
        expect(offering.maxTokens).toBe(plain.maxTokens + ROLL_OFFER_EXTRA_TOKENS);
        // Without the facts section (only tests send none) the system message is as it was.
        const { factsSection: _facts, ...bare } = input;
        expect(buildJudgePrompt(bare).messages[0].content).not.toContain('roll_offer');
    });

    it('reads the offer loosely and applies the rules', () => {
        const base = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"no"}';
        expect(parseJudgement(`${base},"roll_offer":{"stakes":" Can you  outrun them? ","stat":"strength"}}`).rollOffer).toEqual({ stakes: 'Can you outrun them?', stat: 'strength' });
        expect(parseJudgement(`${base},"roll_offer":null}`).rollOffer).toBeUndefined();
        expect(parseJudgement(`${base}}`)).not.toHaveProperty('rollOffer');
        expect(readJudgedRollOffer({ stakes: '' })).toBeNull();
        expect(readJudgedRollOffer('Can you?')).toBeNull();
        expect(readJudgedRollOffer({ stakes: 'Can you?', stat: 'null' })).toEqual({ stakes: 'Can you?', stat: null });

        const stats = [{ name: 'Strength', value: 2 }];
        expect(applyRollOffer({ allowed: true, stats }, { stakes: 'Can you?', stat: 'STRENGTH' })).toEqual({ offer: { stakes: 'Can you?', stat: 'Strength' }, rejected: [] });
        const unknown = applyRollOffer({ allowed: true, stats }, { stakes: 'Can you?', stat: 'Luck' });
        expect(unknown.offer).toEqual({ stakes: 'Can you?', stat: null });
        expect(unknown.rejected).toHaveLength(1);
        const refused = applyRollOffer({ allowed: false, stats }, { stakes: 'Can you?', stat: null });
        expect(refused.offer).toBeNull();
        expect(refused.rejected[0]).toContain('none is allowed now');
        expect(applyRollOffer({ allowed: true, stats }, { stakes: 'x'.repeat(400), stat: null }).offer!.stakes).toHaveLength(160);
        expect(applyRollOffer({ allowed: true, stats }, null)).toEqual({ offer: null, rejected: [] });
    });

    it('shows the newest Message’s offer while it is not dismissed and offers are on, with the Stat’s number now', () => {
        const stats = [{ name: 'Strength', value: 3 }];
        const newest = { kind: MessageKind.Ai, rollOffer: { stakes: 'Can you?', stat: 'Strength', dismissed: false } };
        expect(pendingRollOffer({ rollOffers: true, stats }, newest)).toEqual({ stakes: 'Can you?', stat: { name: 'Strength', bonus: 3 } });
        expect(pendingRollOffer({ rollOffers: false, stats }, newest)).toBeNull();
        expect(pendingRollOffer({ rollOffers: true, stats }, { ...newest, rollOffer: { ...newest.rollOffer, dismissed: true } })).toBeNull();
        expect(pendingRollOffer({ rollOffers: true, stats: [] }, newest)).toEqual({ stakes: 'Can you?', stat: null });
        expect(pendingRollOffer({ rollOffers: true, stats }, { kind: MessageKind.User, rollOffer: null })).toBeNull();
    });

    it('checks a Role’s Stats', () => {
        expect(statsProblem([{ name: 'Strength', value: 2 }, { name: 'Charm', value: -3 }])).toBeNull();
        expect(statsProblem(Array.from({ length: 7 }, (_, i) => ({ name: `S${i}`, value: 0 })))).toContain('at most 6');
        expect(statsProblem([{ name: ' ', value: 1 }])).toContain('1 to 24');
        expect(statsProblem([{ name: 'x'.repeat(25), value: 1 }])).toContain('1 to 24');
        expect(statsProblem([{ name: 'Charm', value: 1 }, { name: 'charm', value: 2 }])).toContain('Two Stats');
        expect(statsProblem([{ name: 'Luck', value: 6 }])).toContain('-3 to 5');
        expect(statsProblem([{ name: 'Luck', value: 1.5 }])).toContain('-3 to 5');
    });
});

interface Chat {
    id: number;
    rollOffer: { stakes: string; stat: { name: string; bonus: number } | null } | null;
    messages: Array<{ id: number; kind: 'user' | 'ai'; roll?: Record<string, unknown> | null; judge?: { status: string } | null; memory?: { status: string } | null }>;
}

const OFFER = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"no"},"roll_offer":{"stakes":"Can you outrun the guards?","stat":"strength"}}';
const NONE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"no"},"roll_offer":null}';

describe('Roll offers and Stats: through the HTTP API', () => {
    let t: TestApp;
    let dice: Dice;

    beforeAll(async () => {
        t = await startTestApp();
        dice = t.app.get(Dice);
    });

    afterEach(() => {
        t.gateway.reset();
        dice.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function createStory(): Promise<number> {
        const storyId = (await t.http.post('/api/stories').send({ title: 'The Gate' }).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A walled city.', opening: '@Mira: The guards are coming.' }).expect(200);
        await t.http
            .patch(`/api/stories/${storyId}/role`)
            .send({ name: 'Ash', description: 'A thief.', stats: [{ name: 'Strength', value: 2 }, { name: 'Charm', value: 1 }] })
            .expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Quick.', voice: 'Short.' }).expect(201);
        return storyId;
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
        t.gateway.scriptText('turn', { text: '@Mira: Run!', model: 'glm-5.3' });
        t.gateway.scriptText('judge', judgement);
        t.gateway.scriptText('memory_extraction', '{"operations":[]}');
    }

    async function send(storyId: number, chatId: number, body: Record<string, unknown> = { text: 'I run.' }, judgement = OFFER): Promise<Chat> {
        script(judgement);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send(body).expect(201);
        return settled(storyId, chatId);
    }

    const lastJudge = (): TextCompletionRequest => t.gateway.textCalls('judge').at(-1)!;

    it('keeps the Role’s Stats and the switch, refuses bad ones, and Duplicate copies both', async () => {
        const storyId = await createStory();
        const story = (await t.http.get(`/api/stories/${storyId}`).expect(200)).body;
        expect(story.role.stats).toEqual([{ name: 'Strength', value: 2 }, { name: 'Charm', value: 1 }]);
        expect(story.rollOffers).toBe(true);

        const role = `/api/stories/${storyId}/role`;
        await t.http.patch(role).send({ stats: [{ name: 'Luck', value: 6 }] }).expect(422);
        await t.http.patch(role).send({ stats: [{ name: 'Charm', value: 1 }, { name: 'CHARM', value: 2 }] }).expect(422);
        await t.http.patch(role).send({ stats: Array.from({ length: 7 }, (_, i) => ({ name: `S${i}`, value: 0 })) }).expect(422);
        await t.http.patch(role).send({ stats: [{ name: 'Luck', value: 1.5 }] }).expect(400);
        await t.http.patch(role).send({ stats: [{ name: 'Luck' }] }).expect(400);
        await t.http.patch(`/api/stories/${storyId}`).send({ rollOffers: 'no' }).expect(400);
        // Refused lists change nothing; a name or description save leaves the Stats alone.
        await t.http.patch(role).send({ name: 'Ash the Quick' }).expect(200);
        expect((await t.http.get(`/api/stories/${storyId}`).expect(200)).body.role.stats).toHaveLength(2);

        const saved = await t.http.patch(role).send({ stats: [{ name: ' Nerve ', value: -1 }] }).expect(200);
        expect(saved.body.role.stats).toEqual([{ name: 'Nerve', value: -1 }]);
        expect((await t.http.patch(`/api/stories/${storyId}`).send({ rollOffers: false }).expect(200)).body.rollOffers).toBe(false);

        const copy = (await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201)).body;
        expect(copy.role.stats).toEqual([{ name: 'Nerve', value: -1 }]);
        expect(copy.rollOffers).toBe(false);
    });

    it(`offers a Roll from the ${ROLL_OFFER_GAP}th reply, with the same system message, and a Roll for its Stat adds it`, async () => {
        const storyId = await createStory();
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
        expect(chat.rollOffer).toBeNull();

        for (let i = 1; i < ROLL_OFFER_GAP; i++) {
            const played = await send(storyId, chat.id);
            // The Judge offered every time, but none is allowed yet: dropped, and no section asked for one.
            expect(played.rollOffer).toBeNull();
            expect(lastJudge().messages[1].content).not.toContain('# Roll offer');
        }
        const before = lastJudge();
        const offered = await send(storyId, chat.id);
        const judge = lastJudge();
        expect(judge.messages[0].content).toBe(before.messages[0].content);
        expect(judge.messages[0].content).toContain('"roll_offer":null}');
        expect(judge.messages[1].content).toContain('# Roll offer\n');
        expect(judge.messages[1].content).toContain('Their Stats: Strength +2, Charm +1.');
        // Other sections may join as the Chat grows (an Ending suggestion); the offer's own tokens are there.
        expect(judge.maxTokens).toBeGreaterThanOrEqual((before.maxTokens ?? 0) + ROLL_OFFER_EXTRA_TOKENS);
        expect(offered.rollOffer).toEqual({ stakes: 'Can you outrun the guards?', stat: { name: 'Strength', bonus: 2 } });

        // Taking it: the send carries the Roll and the Stat. 9 + 2 reaches 11.
        dice.script(9);
        const rolled = await send(storyId, chat.id, { text: 'I sprint for the gate.', roll: true, rollStat: 'strength' });
        expect(rolled.messages.at(-2)!.roll).toEqual({ value: 9, target: 11, outcome: 'success', stat: { name: 'Strength', bonus: 2 } });
        const turn = t.gateway.textCalls('turn').at(-1)!;
        expect(turn.messages.at(-1)!.content).toContain('a success (9 + 2 for Strength = 11, needing 11 or more)');
        // The reply to a Roll offers none, whatever the Judge says, and the next prompt says nothing of offers.
        expect(rolled.rollOffer).toBeNull();
        expect(lastJudge().messages[1].content).not.toContain('# Roll offer');
        expect(turn.messages.some((message) => message.content.includes('outrun the guards'))).toBe(false);

        // Again reads the same Roll with its Stat.
        script(NONE);
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${rolled.messages.at(-1)!.id}/regenerate`).expect(200);
        expect(t.gateway.textCalls('turn').at(-1)!.messages.at(-1)!.content).toContain('9 + 2 for Strength = 11');
        await settled(storyId, chat.id);

        // A Stat the Role doesn't have adds nothing; a Stat without a Roll is ignored; a non-string is refused.
        dice.script(10);
        const luck = await send(storyId, chat.id, { text: 'I try my luck.', roll: true, rollStat: 'Luck' });
        expect(luck.messages.at(-2)!.roll).toEqual({ value: 10, target: 11, outcome: 'failure' });
        const plain = await send(storyId, chat.id, { text: 'I walk.', rollStat: 'Strength' });
        expect(plain.messages.at(-2)!.roll).toBeNull();
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).send({ text: 'x', roll: true, rollStat: 3 }).expect(400);

        // A Branch keeps the Roll with its Stat.
        const branch = (await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${rolled.messages.at(-1)!.id}/branch`).expect(201)).body as Chat;
        expect(branch.messages.find((message) => message.id !== undefined && message.kind === 'user' && message.roll)?.roll).toMatchObject({ stat: { name: 'Strength', bonus: 2 } });
    });

    it('dismisses an offer, which still counts for the gap; Again clears one; the switch hides one and asks for none', async () => {
        const storyId = await createStory();
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
        const base = `/api/stories/${storyId}/chats/${chat.id}`;
        for (let i = 1; i < ROLL_OFFER_GAP; i++) await send(storyId, chat.id, { text: 'I run.' }, NONE);
        expect((await send(storyId, chat.id)).rollOffer).not.toBeNull();

        const dismissed = (await t.http.delete(`${base}/roll-offer`).expect(200)).body as Chat;
        expect(dismissed.rollOffer).toBeNull();
        expect(((await t.http.get(base).expect(200)).body as Chat).rollOffer).toBeNull();
        // Nothing pending: the same Chat.
        expect(((await t.http.delete(`${base}/roll-offer`).expect(200)).body as Chat).rollOffer).toBeNull();

        // The dismissed offer starts the count again.
        for (let i = 1; i < ROLL_OFFER_GAP; i++) {
            expect((await send(storyId, chat.id)).rollOffer).toBeNull();
            expect(lastJudge().messages[1].content).not.toContain('# Roll offer');
        }
        const again = await send(storyId, chat.id);
        expect(again.rollOffer).not.toBeNull();

        // Again rewinds the reply's judgement: its offer goes, and the new judgement gives none.
        script(NONE);
        await t.http.post(`${base}/messages/${again.messages.at(-1)!.id}/regenerate`).expect(200);
        expect((await settled(storyId, chat.id)).rollOffer).toBeNull();
        // Judged again with an offer, it is back; the switch hides it, and asks the Judge for none.
        script(OFFER);
        await t.http.post(`${base}/messages/${again.messages.at(-1)!.id}/regenerate`).expect(200);
        expect((await settled(storyId, chat.id)).rollOffer).not.toBeNull();
        await t.http.patch(`/api/stories/${storyId}`).send({ rollOffers: false }).expect(200);
        expect(((await t.http.get(base).expect(200)).body as Chat).rollOffer).toBeNull();
        await t.http.patch(`/api/stories/${storyId}`).send({ rollOffers: true }).expect(200);
        expect(((await t.http.get(base).expect(200)).body as Chat).rollOffer).not.toBeNull();
        await t.http.patch(`/api/stories/${storyId}`).send({ rollOffers: false }).expect(200);
        for (let i = 0; i < ROLL_OFFER_GAP; i++) {
            expect((await send(storyId, chat.id)).rollOffer).toBeNull();
            expect(lastJudge().messages[1].content).not.toContain('# Roll offer');
        }
    });

    it('drops a Stat the Role doesn’t have from an offer, and keeps the offer', async () => {
        const storyId = await createStory();
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
        for (let i = 1; i < ROLL_OFFER_GAP; i++) await send(storyId, chat.id, { text: 'I run.' }, NONE);
        const played = await send(storyId, chat.id, { text: 'I run.' }, OFFER.replace('"strength"', '"Luck"'));
        expect(played.rollOffer).toEqual({ stakes: 'Can you outrun the guards?', stat: null });
    });
});
