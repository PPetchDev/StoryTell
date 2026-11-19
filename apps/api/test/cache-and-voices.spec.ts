import { applyDetails, ChatDetails, judgeDetailsSection, PLACE_AGE_SHOWN, placeAge, readJudgedDetails } from '../src/manager/chat/details/details.js';
import { buildJudgePrompt, parseJudgement } from '../src/manager/chat/judge/judge-prompt.js';
import { buildExtractionPrompt, ExtractionMemory } from '../src/manager/chat/memory/memory-prompt.js';
import { DetailKind } from '../src/model/ledger/entities/detail-change.entity.js';
import { JUDGE_FIXTURE_INPUTS } from './judge-prompt-inputs.js';
import { repeatedGestures, repeatedGesturesLine } from '../src/manager/chat/speech/repeated-phrases.js';
import { storySoFarCoverage } from '../src/manager/chat/story-so-far/story-so-far-prompt.js';
import { DETAILS_LAG_SENTENCE, PromptHistoryMessage, PromptLayersInput, stateReminder, TURN_PROMPT_TOKEN_BUDGET, voicesReminder } from '../src/manager/chat/turn/prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';

/**
 * .scratch/cache-and-voices/spec.md: the Memory extraction's prompt keeps what changes little first,
 * the Story so far leaves several exchanges word for word, repeated gestures are named, and the
 * reminder says how each present Character talks. Pure functions, no database.
 */

const memories: ExtractionMemory[] = Array.from({ length: 30 }, (_, at) => ({
    id: at + 1,
    text: `Mira logged the tide at the north reef on day ${at}.`,
    knownBy: ['Mira'],
    locked: false,
}));

function extraction(present: string[], userText: string, aiText: string): string {
    return buildExtractionPrompt({
        cast: ['Mira', 'Kai'],
        identityName: 'Ash',
        present,
        memories,
        beliefs: [{ id: 1, characterName: 'Kai', text: 'The reef is cursed.', contradicts: null }],
        userText,
        aiText,
    }).messages[1].content;
}

describe('Memory extraction prompt order', () => {
    it('lists the Memories and Beliefs before who is present and the latest exchange', () => {
        const user = extraction(['Mira'], 'I watch the tide.', '@Mira: Low again.');
        const at = (heading: string) => user.indexOf(heading);
        expect(at('# Cast')).toBe(0);
        expect(at('# Current Memories')).toBeGreaterThan(at('# Cast'));
        expect(at('# Active Beliefs')).toBeGreaterThan(at('# Current Memories'));
        expect(at('# Characters present in this exchange')).toBeGreaterThan(at('# Active Beliefs'));
        expect(at('# LATEST EXCHANGE')).toBeGreaterThan(at('# Characters present in this exchange'));
    });

    it('opens the same on two turns that differ only in who is present and what was said, through the Beliefs', () => {
        const one = extraction(['Mira'], 'I watch the tide.', '@Mira: Low again.');
        const two = extraction(['Kai', 'Mira'], 'I ask Kai about the curse.', '@Kai: Never say that word here.');
        const shared = one.slice(0, one.indexOf('# Characters present'));
        expect(shared).toContain('30: - [known by Mira]');
        expect(shared).toContain('Kai believes: The reef is cursed.');
        expect(two.startsWith(shared)).toBe(true);
    });
});

/**
 * Live Chat 2 on 2026-11-19: the standing part, reserves and trailing blocks left the history about
 * 2-3k tokens of a 16k budget. A setting sized to that stands in for all of them here.
 */
function liveLikeLayers(storySoFar: PromptLayersInput['storySoFar']): PromptLayersInput {
    return {
        story: {
            setting: 'The camp on the road. '.repeat(1_935),
            pov: Pov.First,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [{ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Short, sure sentences.', exampleLines: [], background: '', secrets: '' }],
        },
        identity: { name: 'Petch', description: 'The keeper.' },
        scene: null,
        bonds: [],
        arcs: [],
        memories: [],
        storySoFar,
    };
}

/** One exchange as live's averaged: a ~60-token user line and a ~290-token reply. */
const exchange = (n: number): PromptHistoryMessage[] => [
    { role: 'user', text: `U${n} ${'I lean in. '.repeat(21)}` },
    { role: 'assistant', text: `A${n} ${'Nara watches the fire and says little. '.repeat(29)}` },
];

/** Plays `turns` exchanges, running the update check after each; the coverage steps it took and the Messages left uncovered after each. */
function play(budget: number, turns: number): Array<{ turn: number; covered: number; uncovered: number }> {
    const history: PromptHistoryMessage[] = [];
    let covered = 0;
    const steps: Array<{ turn: number; covered: number; uncovered: number }> = [];
    for (let turn = 1; turn <= turns; turn++) {
        history.push(...exchange(turn));
        const storySoFar = covered > 0 ? { text: 'Petch came to the camp and stayed. '.repeat(60), coveredMessages: covered } : null;
        const next = storySoFarCoverage(liveLikeLayers(storySoFar), history, budget);
        if (next !== null) {
            covered = next;
            steps.push({ turn, covered, uncovered: history.length - covered });
        }
    }
    return steps;
}

describe('Story so far cadence at live-like sizes', () => {
    it('at the old 16k budget, covers all but the newest exchange every few turns (what live did)', () => {
        const steps = play(16_000, 60).slice(1);
        expect(steps.length).toBeGreaterThan(8);
        for (const step of steps) expect(step.uncovered).toBe(2);
    });

    it('at the turn budget, leaves several exchanges word for word and comes about every dozen turns', () => {
        expect(TURN_PROMPT_TOKEN_BUDGET).toBe(22_000);
        const steps = play(TURN_PROMPT_TOKEN_BUDGET, 90).slice(1);
        expect(steps.length).toBeGreaterThan(2);
        for (const step of steps) expect(step.uncovered).toBeGreaterThanOrEqual(8);
        const gaps = steps.slice(1).map((step, at) => step.turn - steps[at].turn);
        for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(10);
    });
});

/** Replies from live Chat 2 (positions 813-817, shortened): the tail on the wrist, told three ways. */
const TAIL_ON_WRIST = [
    'Her tail uncoils from her own ankle and slides across the felt to wrap once around my wrist.\n\n@Nara: You did that on purpose.',
    "She hasn't pulled away. Her tail is still around my wrist.\n\n@Tavri: He definitely did.",
    "Her tail tightens on my wrist, not restraining, just holding.\n\n@Nara: While I'm talking?",
];
/** The story's own running material: a saucer, the tent flap, four jugs a day. No body part in any. */
const RUNNING = [
    'Dulcie sets the saucer down on the cart bed. The tent flap falls closed.\n\n@Dulcie: Four jugs a day, sweetheart.',
    'Dulcie picks up the saucer and sets it on the cart bed. The tent flap stirs.\n\n@Tavri: Four jugs a day.',
    'The saucer sits on the cart bed where Dulcie set it. Someone ties the tent flap back.\n\n@Nara: Four jugs a day, every day.',
];
const NAMES = ['Petch', 'Nara', 'Tavri', 'Dulcie'];

describe('Repeated gestures', () => {
    it('names the tail on the wrist, told in other words in three replies', () => {
        const gestures = repeatedGestures(TAIL_ON_WRIST, NAMES);
        expect(gestures).toContainEqual(['tail', 'wrist']);
        expect(repeatedGesturesLine(gestures)).toContain("several recent replies: tail and wrist. Leave them out of this reply entirely: don't write those words together, not even to say a pose is kept.");
    });

    it("leaves the story's own running material alone: no body part, no gesture", () => {
        expect(repeatedGestures(RUNNING, NAMES)).toEqual([]);
    });

    it('needs three of the last six replies', () => {
        expect(repeatedGestures(TAIL_ON_WRIST.slice(0, 2), NAMES)).toEqual([]);
        // Six newer replies push the three out of the window.
        expect(repeatedGestures([...TAIL_ON_WRIST, ...RUNNING, ...RUNNING], NAMES)).toEqual([]);
    });

    it('never counts names, common words or speech', () => {
        const replies = ['@Nara: My tail, your wrist.', '@Nara: My tail, your wrist again.', '@Nara: Tail. Wrist. Every time.'];
        expect(repeatedGestures(replies, NAMES)).toEqual([]);
        const named = ['Nara looks at her hand.', 'Nara looks down at her hand.', 'Nara looks up from her hand.'];
        expect(repeatedGestures(named, NAMES)).toEqual([]);
    });

    it('names one gesture once, by its commonest pair', () => {
        const ears = ['Her ears swivel forward.', 'Her ears swivel forward again.', 'Both ears swivel forward, slow.'];
        expect(repeatedGestures(ears, NAMES)).toHaveLength(1);
    });
});

describe('The Judge is asked the Place every time', () => {
    const cast = [
        { id: 1, name: 'Nara' },
        { id: 2, name: 'Tavri' },
    ];
    const underTheTree: ChatDetails = { place: 'under the tree by the eastern row of jugs', weather: null, outfits: [], goals: [] };

    it('names details on the reply shape, with the Place as "same" by default', () => {
        const input = JUDGE_FIXTURE_INPUTS[0];
        const system = buildJudgePrompt({ ...input, detailsSection: judgeDetailsSection(underTheTree, cast) }).messages[0].content;
        expect(system).toContain(',\n "details":{"where":"...","place":"same","weather":null,"outfits":[],"goals":[]}}\nEmpty arrays when nothing changed.');
        // Without the section, as before.
        expect(buildJudgePrompt(input).messages[0].content).not.toContain('"details"');
    });

    it('reads "same" as no move, and a new Place as a change (live Chat 2: into the tent)', () => {
        const same = parseJudgement('{"bond_changes":[],"arc_steps":[],"scene":null,"details":{"where":"...","place":"same","weather":null,"outfits":[],"goals":[]}}');
        expect(same.details).toBeNull();
        expect(applyDetails({ current: underTheTree, cast }, readJudgedDetails({ place: 'Same.' })).changes).toEqual([]);

        const moved = parseJudgement('{"bond_changes":[],"arc_steps":[],"scene":null,"details":{"place":"inside the tent","weather":null,"outfits":[],"goals":[]}}');
        expect(applyDetails({ current: underTheTree, cast }, moved.details ?? null).changes).toEqual([{ kind: DetailKind.Place, characterId: null, value: 'inside the tent' }]);
    });

    it("tells the Narrator the replies win over a Place that lags them, and says nothing of it with no Place or Weather", () => {
        const layers = liveLikeLayers(null);
        const base = { story: layers.story, identity: layers.identity, scene: null, present: ['Nara'] };
        const reminder = stateReminder({ ...base, details: { place: 'under the tree by the eastern row of jugs', weather: null, outfits: [] } });
        expect(reminder).toContain(`Place: under the tree by the eastern row of jugs. ${DETAILS_LAG_SENTENCE} In the latest exchange: Nara.`);
        expect(stateReminder({ ...base, details: { place: null, weather: null, outfits: [] } })).not.toContain(DETAILS_LAG_SENTENCE);
    });

    it('shows the Judge how long ago the Place was noted once it is 20 Messages old, and leaves an old Place or Weather out of the Narrator\'s reminder', () => {
        const ids = Array.from({ length: 90 }, (_, at) => 1000 + at);
        const records = [
            { kind: DetailKind.Place, messageId: 1002 },
            { kind: DetailKind.Weather, messageId: 1050 },
            { kind: DetailKind.Place, messageId: 1004 },
        ];
        // The newest Place record, counted from the newest Message: live Chat 2's tree, 85 Messages on.
        expect(placeAge(records, ids)).toBe(85);
        expect(placeAge([], ids)).toBeNull();
        expect(placeAge([{ kind: DetailKind.Place, messageId: null }], ids)).toBeNull();
        expect(placeAge(records, ids, DetailKind.Weather)).toBe(39);

        expect(judgeDetailsSection(underTheTree, cast, 85)).toContain('\nPlace: under the tree by the eastern row of jugs (last noted 85 messages ago)\n');
        expect(judgeDetailsSection(underTheTree, cast, PLACE_AGE_SHOWN - 1)).toContain('\nPlace: under the tree by the eastern row of jugs\n');
        expect(judgeDetailsSection(underTheTree, cast)).toContain('\nPlace: under the tree by the eastern row of jugs\n');

        const layers = liveLikeLayers(null);
        const base = { story: layers.story, identity: layers.identity, scene: null, present: ['Nara'] };
        // Live Chat 2: an old Place and Weather say nothing, so nothing pulls the reply back under the tree.
        const old = stateReminder({ ...base, details: { place: 'under the tree', weather: 'morning light', outfits: [], placeAge: 85, weatherAge: 85 } });
        expect(old).not.toContain('under the tree');
        expect(old).not.toContain('morning light');
        expect(old).not.toContain(DETAILS_LAG_SENTENCE);
        expect(old).toBe(stateReminder({ ...base, details: null }));
        // A fresh Place still shows; an old Weather beside it doesn't.
        expect(stateReminder({ ...base, details: { place: 'inside the tent', weather: 'morning light', outfits: [], placeAge: 3, weatherAge: PLACE_AGE_SHOWN } })).toContain(
            `Place: inside the tent. ${DETAILS_LAG_SENTENCE} In the latest exchange: Nara.`,
        );
    });

    it('asks for "where" first, in the story\'s own words, then the Place every time, and says going inside is a move', () => {
        const section = judgeDetailsSection(underTheTree, cast);
        expect(section).toContain('"where": first, in a few words of the story\'s own');
        expect(section).toContain('the Place above may be out of date');
        expect(section).toContain('"place": answer it every time, from "where": "same" when the story is still at the Place above');
        expect(section).toContain('going inside or out, into another room or to another spot is a move');
    });
});

describe('How the present Characters talk', () => {
    const characters = [
        { name: 'Nara', voice: 'Talks like a seller who has never lost a haggle.' },
        { name: 'Tavri', voice: 'Soft and halting. The only one who stammers.' },
        { name: 'Dulcie', voice: '' },
        { name: 'Morra', voice: 'Never in a hurry to answer.' },
    ];

    it('gives the Voice of each Character in the latest exchange, and the line against borrowed images', () => {
        const block = voicesReminder(characters, ['Nara', 'Tavri', 'Dulcie'])!;
        expect(block).toContain('- Nara: Talks like a seller who has never lost a haggle.');
        expect(block).toContain('- Tavri: Soft and halting. The only one who stammers.');
        // No Voice on the card, nothing to say; and Morra isn't there.
        expect(block).not.toContain('Dulcie');
        expect(block).not.toContain('Morra');
        expect(block).toContain("don't lend one Character's trade or images to another");
    });

    it("follows each Voice with the card's Example lines, quoted, leaving blank ones out", () => {
        const block = voicesReminder(
            [{ name: 'Tavri', voice: 'Soft and halting.', exampleLines: ["It's, um. It's a family recipe.", '  ', "I'm sorry! I mean, nothing."] }],
            ['Tavri'],
        )!;
        expect(block).toContain(`- Tavri: Soft and halting. As in: "It's, um. It's a family recipe." "I'm sorry! I mean, nothing."`);
        expect(voicesReminder([{ name: 'Tavri', voice: 'Soft.', exampleLines: [] }], ['Tavri'])).toContain('- Tavri: Soft.\n');
    });

    it('is left out with no one present who has a Voice', () => {
        expect(voicesReminder(characters, [])).toBeNull();
        expect(voicesReminder(characters, ['Dulcie'])).toBeNull();
    });

    it('rides on Where things stand, never for a Character sitting out', () => {
        const layers = liveLikeLayers(null);
        const story = { ...layers.story, characters: characters.map((character) => ({ ...layers.story.characters[0], ...character })) };
        const reminder = stateReminder({ story, identity: layers.identity, scene: null, present: ['Nara', 'Morra'], sittingOut: ['Morra'] });
        expect(reminder.startsWith('Where things stand:')).toBe(true);
        expect(reminder).toContain('- Nara: Talks like a seller');
        expect(reminder).not.toContain('- Morra:');
    });
});
