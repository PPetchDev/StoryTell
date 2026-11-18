import { DetailKind } from '../src/model/ledger/entities/detail-change.entity.js';
import {
    applyFacts,
    currentFacts,
    factsBlock,
    FACTS_MAX,
    judgeFactsSection,
    promptFacts,
    readJudgedFacts,
    saidByUser,
    topicKey,
} from '../src/manager/chat/details/facts.js';
import { buildJudgePrompt, parseJudgement } from '../src/manager/chat/judge/judge-prompt.js';
import { repeatedPhrases, repeatedPhrasesLine } from '../src/manager/chat/speech/repeated-phrases.js';
import { buildTurnPrompt, PromptHistoryMessage, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { storySoFarCoverage } from '../src/manager/chat/story-so-far/story-so-far-prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { closingParts, trailingOf } from './harness/prompt-layers.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Story quality (.scratch/story-quality/spec.md): the Established facts the Judge keeps and the
 * Narrator reads, and the phrases the last few replies keep reusing, named before the next one.
 * Fixtures from live Chat 2 (2026-11-17).
 */

describe('Repeated phrases: found in code (pure)', () => {
    const names = ['Petch', 'Nara', 'Tavri'];

    it('finds the Chat 2 beats, each in the newest reply\'s words', () => {
        const replies = [
            '@Nara: I had a whole speech ready. Stages and everything.\n\nHer tail wraps around my wrist, warm and sure.',
            'She laughs. Her tail wraps around my wrist again.\n\n@Nara: I had a whole speech ready, you know.',
            'The lamp gutters.\n\n@Nara: Well. I had a whole speech ready.',
        ];
        expect(repeatedPhrases(replies, names)).toEqual(['I had a whole speech ready', 'Her tail wraps around my wrist']);
    });

    it('needs two replies, and reads only the last four', () => {
        expect(repeatedPhrases(['Her tail wraps around my wrist. Her tail wraps around my wrist.'], names)).toEqual([]);
        expect(repeatedPhrases(['Her tail wraps around my wrist.', 'Rain.', 'Rain.', 'Rain.', 'Her tail wraps around my wrist.'], names)).toEqual([]);
        expect(repeatedPhrases(['Rain.', 'Her tail wraps around my wrist.', 'Rain.', 'Rain.', 'Her tail wraps around my wrist.'], names)).toEqual([
            'Her tail wraps around my wrist',
        ]);
    });

    it('leaves alone runs of common words and names, and never runs across a sentence end', () => {
        const replies = [
            'Nara looks at Petch. I don\'t know what you want. Tavri grins. Fine weather.',
            'Nara looks at Petch. I don\'t know what you want. Tavri grins. Fine weather.',
        ];
        expect(repeatedPhrases(replies, names)).toEqual([]);
        // "grins fine weather" would be four words only across the full stop.
        expect(repeatedPhrases(['Tavri grins. Fine weather today.', 'Tavri grins. Fine weather today.'], names)).toEqual([]);
        // Four words alone are mostly a place the story names again, as it should (dev Chat 2).
        expect(repeatedPhrases(['She waits at her tent flap.', 'Dawn finds me at her tent flap.'], names)).toEqual([]);
    });

    it('reads speech lines without their names or stage directions, and joins a run that grows', () => {
        const replies = [
            '@Nara: *(softly)* The river stones were for you, all of them.',
            '@Tavri: The river stones were for you, all of them, every single one.',
        ];
        expect(repeatedPhrases(replies, names)).toEqual(['The river stones were for you all of them']);
    });

    it('names at most four, those in the most replies first', () => {
        const beats = ['salt wind stings her bare skin', 'copper lanterns swing high overhead', 'wet sand clings to her ankles', 'old drums thunder down the beach', 'gulls wheel crying above the nets'];
        const replies = [beats.join('. '), beats.join('. '), `${beats[4]}.`];
        const found = repeatedPhrases(replies, names);
        expect(found).toHaveLength(4);
        expect(found[0]).toBe('gulls wheel crying above the nets');
    });

    it('writes one short line, or none', () => {
        expect(repeatedPhrasesLine([])).toBeNull();
        expect(repeatedPhrasesLine(['I had a whole speech ready', 'Her tail wraps around my wrist'])).toBe(
            'Already used in recent replies, so not again in this one: "I had a whole speech ready"; "Her tail wraps around my wrist". Find a fresh way, or leave it out.',
        );
    });
});

const record = (kind: DetailKind, value: string, messageId = 1) => ({ kind, value, messageId });

describe('Established facts: what stands, and what the Judge says (pure)', () => {
    it('keeps the newest of each topic in first-set order, drops one emptied, and reads slips of one Message', () => {
        const records = [
            record(DetailKind.Fact, "Nara's age: twenty-six", 1),
            record(DetailKind.Place, 'the stall', 1),
            record(DetailKind.Fact, "Nara's years at the stall: nine summers", 2),
            record(DetailKind.Fact, 'Married: three days ago', 2),
            record(DetailKind.Fact, "the nara's AGE: twenty-seven", 3),
            record(DetailKind.Fact, 'married: ', 3),
            record(DetailKind.Slip, "Nara's years at the stall: twenty summers", 3),
            record(DetailKind.Slip, "Nara's years at the stall: six summers", 2),
        ];
        expect(currentFacts(records)).toEqual([
            { topic: "Nara's age", fact: 'twenty-seven' },
            { topic: "Nara's years at the stall", fact: 'nine summers' },
        ]);
        expect(promptFacts(records, 3).slips).toEqual([{ topic: "Nara's years at the stall", said: 'twenty summers' }]);
        expect(promptFacts(records, null).slips).toEqual([]);
        expect(topicKey("The Nara's  Age!")).toBe('naras age');
    });

    it('reads the facts and slips loosely, at the top level of the answer', () => {
        expect(readJudgedFacts([{ topic: 'Age', fact: '26' }, { topic: '', fact: 'x' }, { topic: 'Gone', fact: null }, { topic: 'Bad', fact: 3 }, 'x'], [{ topic: 'Age', said: '30' }, { topic: 'Age' }])).toEqual({
            facts: [
                { topic: 'Age', fact: '26' },
                { topic: 'Gone', fact: '' },
            ],
            slips: [{ topic: 'Age', said: '30' }],
        });
        expect(readJudgedFacts(undefined, undefined)).toBeNull();
        expect(parseJudgement('{"bond_changes":[],"arc_steps":[],"scene":null,"facts":[{"topic":"Age","fact":"26"}]}').facts).toEqual({ facts: [{ topic: 'Age', fact: '26' }], slips: [] });
        expect(parseJudgement('{"bond_changes":[],"arc_steps":[],"scene":null}').facts).toBeNull();
    });

    const listed = [
        { topic: "Nara's age", fact: 'twenty-six' },
        { topic: "Nara's years at the stall", fact: 'nine summers' },
    ];

    it('takes a new fact and a real change, keeps a listed topic\'s wording, and says why the rest was dropped', () => {
        const applied = applyFacts(listed, {
            facts: [
                { topic: 'nara\'s AGE', fact: 'Twenty-six.' },
                { topic: "The Nara's years at the stall", fact: 'ten summers' },
                { topic: 'Petch and Nara: married', fact: 'the night of the summer market' },
                { topic: "Nara's years at the stall", fact: 'eleven summers' },
            ],
            slips: [
                { topic: "Nara's age", said: 'thirty' },
                { topic: "Nara's years at the stall", said: 'twenty summers' },
                { topic: 'Tavri\'s age', said: 'nine' },
                { topic: "nara's age", said: 'twenty-six' },
            ],
        }, 'It was ten summers at the stall, not nine.');
        expect(applied.changes).toEqual([
            { kind: DetailKind.Fact, characterId: null, value: "Nara's years at the stall: ten summers" },
            { kind: DetailKind.Fact, characterId: null, value: 'Petch and Nara married: the night of the summer market' },
            { kind: DetailKind.Slip, characterId: null, value: "Nara's age: thirty" },
        ]);
        expect(applied.rejected).toEqual([
            'Fact "nara\'s AGE": unchanged',
            'Fact "Nara\'s years at the stall": a second change in one turn',
            'Slip on "Nara\'s years at the stall": the fact changed this turn',
            'Slip on "Tavri\'s age": not a listed fact',
            'Slip on "Nara\'s age": said the same',
        ]);
    });

    it('takes a slip on a fact the same answer first records from an earlier telling (seen on the free model)', () => {
        const seeded = applyFacts([], {
            facts: [{ topic: "Nara's years at the stall", fact: 'nine summers' }],
            slips: [{ topic: "Nara's years at the stall", said: 'six summers, give or take' }],
        });
        expect(seeded).toEqual({
            changes: [
                { kind: DetailKind.Fact, characterId: null, value: "Nara's years at the stall: nine summers" },
                { kind: DetailKind.Slip, characterId: null, value: "Nara's years at the stall: six summers, give or take" },
            ],
            rejected: [],
        });
    });

    // From the real-model check on DeepSeek V4 Flash (spec, "Real-model check after the merge").
    const palace = [
        { topic: "Mirelle's years at the palace", fact: 'eleven years' },
        { topic: "Nara's mother", fact: 'Morra' },
    ];

    it("keeps a listed fact a reply tells differently, and records the telling as a slip (V4 Flash gave it as the change)", () => {
        const applied = applyFacts(palace, { facts: [{ topic: "Mirelle's years at the palace", fact: 'Six years' }], slips: [] }, 'You must miss the palace.');
        expect(applied.changes).toEqual([{ kind: DetailKind.Slip, characterId: null, value: "Mirelle's years at the palace: Six years" }]);
        expect(applied.rejected).toEqual(['Fact "Mirelle\'s years at the palace": "Six years" is not in the user\'s words; kept "eleven years", the telling as a slip']);
        // Given as a fact and as a slip too: one slip, the Judge's own.
        const both = applyFacts(palace, { facts: [{ topic: "Mirelle's years at the palace", fact: 'six years' }], slips: [{ topic: "Mirelle's years at the palace", said: 'Six years' }] }, '');
        expect(both.changes).toEqual([{ kind: DetailKind.Slip, characterId: null, value: "Mirelle's years at the palace: Six years" }]);
    });

    it("changes a listed fact when the user's own words say so, given as a fact or as a slip", () => {
        const userText = "You told me eleven years, but it was twelve, wasn't it?";
        const asFact = applyFacts(palace, { facts: [{ topic: "Mirelle's years at the palace", fact: 'twelve years' }], slips: [] }, userText);
        expect(asFact.changes).toEqual([{ kind: DetailKind.Fact, characterId: null, value: "Mirelle's years at the palace: twelve years" }]);
        const asSlip = applyFacts(palace, { facts: [], slips: [{ topic: "Mirelle's years at the palace", said: 'twelve' }] }, userText);
        expect(asSlip.changes).toEqual([{ kind: DetailKind.Fact, characterId: null, value: "Mirelle's years at the palace: twelve" }]);
        expect(asSlip.rejected).toEqual(['Slip on "Mirelle\'s years at the palace": the user\'s own words, taken as the change']);
        const asBoth = applyFacts(palace, { facts: [{ topic: "Mirelle's years at the palace", fact: 'twelve years' }], slips: [{ topic: "Mirelle's years at the palace", said: 'twelve years' }] }, userText);
        expect(asBoth.changes).toEqual([{ kind: DetailKind.Fact, characterId: null, value: "Mirelle's years at the palace: twelve years" }]);
    });

    it('reads a listed topic followed by the telling as that topic ("Nara\'s mother Ilse"), and no other longer topic', () => {
        const applied = applyFacts(palace, { facts: [{ topic: "Nara's mother Ilse", fact: 'Ilse' }], slips: [] }, 'Your mother would laugh at us.');
        expect(applied.changes).toEqual([{ kind: DetailKind.Slip, characterId: null, value: "Nara's mother: Ilse" }]);
        // A new topic that only starts with a listed one is its own fact (review, 2026-11-18).
        const ages = applyFacts(listed, { facts: [{ topic: "Nara's age at the wedding", fact: 'nineteen' }], slips: [] }, '');
        expect(ages.changes).toEqual([{ kind: DetailKind.Fact, characterId: null, value: "Nara's age at the wedding: nineteen" }]);
    });

    it("tells the user's own words by the words that name the fact: numbers, units and names, not after a \"not\"", () => {
        expect(saidByUser('twelve', "it was twelve, wasn't it?")).toBe(true);
        expect(saidByUser('Ilse', 'my mother ilse sold rugs')).toBe(true);
        expect(saidByUser('Jo', "Let's call him Jo")).toBe(true);
        // Numerals, number words and Thai digits are one word; a Thai telling may sit inside a Thai run.
        expect(saidByUser('9 summers', 'nine summers')).toBe(true);
        expect(saidByUser('twenty-seven', 'You are 27 now')).toBe(true);
        expect(saidByUser('27', 'อายุ ๒๗ แล้ว')).toBe(true);
        expect(saidByUser('ยี่สิบเจ็ด', 'เธออายุยี่สิบเจ็ดแล้วนะ')).toBe(true);
        // The unit tells which fact it is: three years is not three months.
        expect(saidByUser('three months', 'Three years married, and you still blush.')).toBe(false);
        expect(saidByUser('twelve years', "it was twelve, wasn't it?")).toBe(false);
        expect(saidByUser('six years', 'You must miss the palace.')).toBe(false);
        expect(saidByUser('the', 'the the')).toBe(false);
        expect(saidByUser('twelve years', '')).toBe(false);
        // Not after a "not"; and where the user says the listed telling too, the one said last.
        expect(saidByUser('twelve', 'Not twelve. Twenty-six.')).toBe(false);
        expect(saidByUser('twelve', 'You said twelve last time? You are twenty-six, silly.', 'twenty-six')).toBe(false);
        expect(saidByUser('twelve', 'It was twelve, not eleven.', 'eleven')).toBe(true);
        expect(saidByUser('twelve years', 'You told me eleven years, but it was twelve years.', 'eleven years')).toBe(true);
    });

    it("keeps canon when the user's words only quote the wrong telling (review, 2026-11-18)", () => {
        const applied = applyFacts(listed, { facts: [{ topic: "Nara's age", fact: 'twelve' }], slips: [{ topic: "Nara's age", said: 'twelve' }] }, 'You said twelve last time? You are twenty-six, silly.');
        expect(applied.changes).toEqual([{ kind: DetailKind.Slip, characterId: null, value: "Nara's age: twelve" }]);
        const married = applyFacts([{ topic: 'Kai and Nara married', fact: 'three years' }], { facts: [{ topic: 'Kai and Nara married', fact: 'three months' }], slips: [] }, 'Three years married, and you still blush.');
        expect(married.changes).toEqual([{ kind: DetailKind.Slip, characterId: null, value: 'Kai and Nara married: three months' }]);
    });

    it('never lets the Judge drop a listed fact; takes four a turn, and no new topic past the cap', () => {
        expect(applyFacts(listed, { facts: [{ topic: "Nara's age", fact: '' }, { topic: 'Unknown', fact: '' }], slips: [] })).toEqual({
            changes: [],
            rejected: ['Fact "Nara\'s age": only the user changes a listed fact; kept "twenty-six"', 'Fact "Unknown": unchanged'],
        });
        const five = Array.from({ length: 5 }, (_, i) => ({ topic: `Topic ${i}`, fact: 'x' }));
        expect(applyFacts([], { facts: five, slips: [] }).changes).toHaveLength(4);
        const full = Array.from({ length: FACTS_MAX }, (_, i) => ({ topic: `Topic ${i}`, fact: 'x' }));
        const capped = applyFacts(full, { facts: [{ topic: 'One more', fact: 'y' }, { topic: 'Topic 3', fact: 'seven' }], slips: [] }, 'Topic 3 is seven now.');
        expect(capped.changes).toEqual([{ kind: DetailKind.Fact, characterId: null, value: 'Topic 3: seven' }]);
        expect(capped.rejected).toEqual([`Fact "One more": the Chat already holds ${FACTS_MAX}`]);
    });

    it('shows the Judge the facts and the rule after the exchange, and only when given', () => {
        const section = judgeFactsSection(listed);
        expect(section.startsWith("# Established facts\n- Nara's age: twenty-six\n- Nara's years at the stall: nine summers\nFacts rule:")).toBe(true);
        expect(section).toContain('"slips": [{"topic": "...", "said": "..."}]');
        // Worded after the real-model check (spec): give listed facts told differently too, and work none out.
        expect(section).toContain('Give a fact that is listed above too when the exchange tells it differently');
        expect(section).toContain('Never work a fact out from others');
        expect(section).toContain('never to now ("four days ago")');
        expect(judgeFactsSection([])).toContain('# Established facts\n(none yet)\n');
        const input = { cast: [], identityName: 'Petch', bonds: [], arcs: [], scene: null, recent: [], userText: 'Hi', aiText: '@Nara: Nine summers.' };
        const without = buildJudgePrompt(input);
        const withFacts = buildJudgePrompt({ ...input, factsSection: section });
        // With the section, the reply shape names the two fields, with and without the Expression rule (spec, "Real-model check"),
        // and then the Roll offer's (.scratch/judge-rolls/spec.md), which goes on the same system message.
        const shape = ',\n "facts":[{"topic":"...","fact":"..."}],\n "slips":[{"topic":"...","said":"..."}],\n "roll_offer":null}\nEmpty arrays when nothing changed.';
        expect(without.messages[0].content).not.toContain('"facts"');
        expect(withFacts.messages[0].content).toBe(without.messages[0].content.replace(/\}\nEmpty arrays when nothing changed\.$/, shape));
        const parts = [{ kind: 'speech' as const, characterId: 1, speakerName: 'Nara', text: 'Nine summers.' }];
        const tagged = buildJudgePrompt({ ...input, factsSection: section, expressionParts: parts });
        expect(tagged.messages[0].content).toContain('"expressions":[{"line":1,"emotion":"joy"}],\n "facts"');
        expect(buildJudgePrompt({ ...input, expressionParts: parts }).messages[0].content).not.toContain('"facts"');
        expect(withFacts.messages[1].content).toBe(`${without.messages[1].content}\n\n${section}`);
        expect(withFacts.maxTokens).toBeGreaterThan(without.maxTokens);
    });

    it('tells the Narrator the facts, and the last reply\'s slip on a fact still listed', () => {
        expect(factsBlock(null)).toBeNull();
        expect(factsBlock({ facts: [], slips: [{ topic: 'x', said: 'y' }] })).toBeNull();
        expect(factsBlock({ facts: listed, slips: [{ topic: "nara's years at the stall", said: 'twenty summers' }, { topic: 'Gone', said: 'z' }] })).toBe(
            [
                "# Established facts (true in this Chat; where the Story so far, a Memory or an earlier reply says otherwise, these win)",
                "- Nara's age: twenty-six",
                "- Nara's years at the stall: nine summers",
                'Keep every number, age, length of time, name and tie as listed here, in narration and in what the Characters say. A Character still knows only what they have seen or been told.',
                'The last reply got these wrong; keep to the facts above and don\'t repeat it: nara\'s years at the stall (it said "twenty summers").',
            ].join('\n'),
        );
    });
});

function turnInput(history: PromptHistoryMessage[], overrides: Partial<TurnPromptInput> = {}): TurnPromptInput {
    return {
        story: {
            setting: 'A summer market.',
            pov: Pov.First,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [{ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Short.', exampleLines: [], background: '', secrets: '' }],
        },
        identity: { name: 'Petch', description: 'A trader.' },
        scene: null,
        bonds: [],
        arcs: [],
        memories: [],
        history,
        userText: 'I wait.',
        authorsNote: 'Slow burn.',
        ...overrides,
    };
}

describe('Story quality in the turn prompt (pure)', () => {
    const repeating: PromptHistoryMessage[] = [
        { role: 'assistant', text: '@Nara: I had a whole speech ready.' },
        { role: 'user', text: 'I had a whole speech ready too.' },
        { role: 'assistant', text: 'She sighs.\n\n@Nara: Nara had a whole speech ready.' },
    ];

    it('puts the facts after the Author\'s note and before "Where things stand", and the repeats right before the final instruction', () => {
        const prompt = buildTurnPrompt(turnInput(repeating, { facts: { facts: [{ topic: "Nara's age", fact: 'twenty-six' }], slips: [] }, cue: 'Make it rain.' }));
        const trailing = trailingOf(prompt);
        const notes = trailing.indexOf("# Author's note");
        const facts = trailing.indexOf('# Established facts (');
        const where = trailing.indexOf('Where things stand:');
        const cue = trailing.indexOf("The user's cue");
        const repeats = trailing.indexOf('Already used in recent replies, so not again in this one: "had a whole speech ready".');
        const final = trailing.indexOf('Write the next turn now.');
        expect(notes).toBeGreaterThanOrEqual(0);
        expect([notes, facts, where, cue, repeats, final].every((at, i, all) => at >= 0 && (i === 0 || at > all[i - 1]))).toBe(true);
        // The standing system message never carries them.
        expect(prompt.messages[0].content).not.toContain('Established facts');
        expect(prompt.messages[0].content).not.toContain('Already used');
    });

    it('sends neither when there is nothing to say, and the user\'s words never count as a repeat', () => {
        const prompt = buildTurnPrompt(turnInput(repeating.slice(0, 2)));
        expect(closingParts(prompt).trailing).not.toContain('Established facts');
        expect(closingParts(prompt).trailing).not.toContain('Already used');
    });

    it('reads the repeats on an Epilogue too', () => {
        const prompt = buildTurnPrompt(turnInput(repeating, { userText: null, epilogue: { endingName: null, note: '' } }));
        expect(trailingOf(prompt)).toContain('Already used in recent replies');
    });

    it('lets the Story so far trigger reserve room for the facts', () => {
        const long: PromptHistoryMessage[] = Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? 'user' : 'assistant', text: 'word '.repeat(200) }));
        const facts = { facts: Array.from({ length: 40 }, (_, i) => ({ topic: `Topic number ${i}`, fact: 'a fact of some length, kept for many turns' })), slips: [] };
        const { history: _history, userText: _userText, ...layers } = turnInput([]);
        const plain = storySoFarCoverage(layers, long, 12_000);
        const reserved = storySoFarCoverage({ ...layers, facts }, long, 12_000);
        expect(reserved).toBeGreaterThan(plain ?? 0);
    });
});

const NO_OPS = '{"operations":[]}';
const judged = (extra: Record<string, unknown> = {}) => JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' }, ...extra });

describe('Story quality: the Judge, the ledger and the turn (HTTP)', () => {
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

    async function createChat(): Promise<{ storyId: number; chatId: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Market' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A summer market.', opening: '@Nara: Peaches?' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Petch', description: 'A trader.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Short.' }).expect(201);
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body;
        await t.http.patch(`/api/stories/${storyId}/chats/${chat.id}`).send({ characterThoughts: false }).expect(200);
        return { storyId, chatId: chat.id as number };
    }

    /** The Chat once its newest reply's Judge and Memory extraction have finished. */
    async function settled(storyId: number, chatId: number) {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
            const last = [...chat.messages].reverse().find((message: { kind: string; judge?: unknown }) => message.kind === 'ai' && message.judge);
            if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    async function play(storyId: number, chatId: number, reply: string, judgement: string, text = 'Well?') {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', judgement);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    it('keeps the facts the Judge gives, shows them to it and to the Narrator, reads a slip once, and Regenerate takes them back', async () => {
        const { storyId, chatId } = await createChat();
        await play(storyId, chatId, '@Nara: Nine summers at this stall.', judged({ facts: [{ topic: "Nara's years at the stall", fact: 'nine summers' }] }));
        expect(t.gateway.textCalls('judge').at(-1)!.messages[1].content).toContain('# Established facts\n(none yet)\nFacts rule:');

        // The next turn reads the fact; the Judge sees it listed, and finds the reply slipped.
        await play(storyId, chatId, '@Nara: Twenty summers, give or take.', judged({ slips: [{ topic: "Nara's years at the stall", said: 'twenty summers' }] }));
        const second = t.gateway.textCalls('turn').at(-1)!;
        expect(trailingOf(second)).toContain("# Established facts (true in this Chat");
        expect(trailingOf(second)).toContain("- Nara's years at the stall: nine summers");
        expect(trailingOf(second)).not.toContain('The last reply got these wrong');
        expect(t.gateway.textCalls('judge').at(-1)!.messages[1].content).toContain("# Established facts\n- Nara's years at the stall: nine summers\nFacts rule:");

        // The turn after the slip names it; the one after that no longer does.
        await play(storyId, chatId, '@Nara: Nine. I said nine.', judged());
        expect(trailingOf(t.gateway.textCalls('turn').at(-1)!)).toContain('The last reply got these wrong; keep to the facts above and don\'t repeat it: Nara\'s years at the stall (it said "twenty summers").');

        // Regenerate the newest reply, whose Judge changed the fact: the change goes with it.
        const changed = await play(storyId, chatId, '@Nara: Ten summers now.', judged({ facts: [{ topic: "Nara's years at the stall", fact: 'ten summers' }] }), 'A year passes.');
        t.gateway.scriptText('turn', '@Nara: Still nine.');
        t.gateway.scriptText('judge', judged());
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${changed.messages.at(-1).id}/regenerate`).expect(200);
        await settled(storyId, chatId);
        const regenerated = t.gateway.textCalls('turn').at(-1)!;
        expect(trailingOf(regenerated)).toContain("- Nara's years at the stall: nine summers");
        expect(trailingOf(regenerated)).not.toContain('ten summers');
        // Its slips are those of the reply before the one replaced: none.
        expect(trailingOf(regenerated)).not.toContain('The last reply got these wrong');
    });

    it('names a phrase the last replies keep reusing, and nothing when none repeats', async () => {
        const { storyId, chatId } = await createChat();
        await play(storyId, chatId, 'Her tail wraps around my wrist.\n\n@Nara: Come on.', judged());
        expect(trailingOf(t.gateway.textCalls('turn').at(-1)!)).not.toContain('Already used');
        await play(storyId, chatId, '@Nara: Stay.\n\nHer tail wraps around my wrist, tighter.', judged());
        expect(trailingOf(t.gateway.textCalls('turn').at(-1)!)).not.toContain('Already used');
        await play(storyId, chatId, '@Nara: There.', judged());
        const closing = t.gateway.textCalls('turn').at(-1)!;
        expect(trailingOf(closing)).toContain('Already used in recent replies, so not again in this one: "Her tail wraps around my wrist". Find a fresh way, or leave it out.\nWrite the next turn now.');
        // The cached opening is untouched: the standing system message is as on the turn before.
        expect(closing.messages[0].content).toBe(t.gateway.textCalls('turn').at(-2)!.messages[0].content);
    });
});
