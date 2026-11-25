import { memoryCost } from '../../src/manager/chat/memory/memory-choice.js';
import { ExtractedOperation, Extraction, ExtractionPromptInput } from '../../src/manager/chat/memory/memory-prompt.js';
import { PromptHistoryMessage, PromptMemory } from '../../src/manager/chat/turn/prompt.js';
import { avoids, Check, GradedCheck, mentions, neverSpeaksAsTheUser, parsesAsAReply, speaks } from './eval-checks.js';
import type { GraderCase } from './eval-grade.js';
import { anchor, AnchorName, ANCHORS, BRAM, CHANGED_ITEMS, CORIN, FIXTURE_MEMORIES, ILSE, ILSE_BELIEF, MEMORY_CAST, MEMORY_STORY, SERA } from './eval-memory-fixture.js';
import type { MemoryScene, TurnScene } from './eval-scenes.js';

/**
 * The cases and scenes of the long-term memory eval (.scratch/long-term-memory-eval/spec.md), one
 * group a layer. They are kept out of the prompt eval run's own scene list on purpose: `all` never
 * plays them, and they start only with `--memory`.
 */

// ---------------------------------------------------------------------------------------------
// Layer 1, Choice.

export type Cue = 'direct' | 'context' | 'unrelated';

/** One question put to the app's Memory choice: this turn, after this history, is the anchor's Memory sent? */
export interface ChoiceCase {
    anchor: AnchorName;
    cue: Cue;
    /** With locked Memories taking half the budget before the search starts. */
    crowded: boolean;
    /** With a quarter of the budget: what a Chat four times as long leaves each Memory, so being sent is not nearly certain. */
    tight: boolean;
    /** The Character the turn is put to: the one present. */
    with: string;
    userText: string;
    /** The Messages before the turn, oldest first; the search reads the last four. */
    history: { text: string }[];
    /** The topics that bear on the cue; a Memory chosen by meaning with another topic counts as unrelated. */
    topics: string[];
}

/** What the Chat was about just before the turn: the new lock, thirty Chapters in. The search reads it with the turn, as on live. */
export const RECENT_HISTORY: { text: string }[] = [
    { text: `${CORIN} walks the wall of the new lock chamber at dusk, checking the mortar with his thumb.` },
    { text: 'The stone was still pale and sharp-edged, and the river slid past below it as though nothing had been built at all.' },
    { text: `${CORIN} sits down on the coping and watches the lamps come on along the towpath.` },
    { text: 'From the Wheatsheaf came the sound of a fiddle being tuned, and somewhere a dog barked twice and gave up.' },
];

const CUES: Cue[] = ['direct', 'context', 'unrelated'];

/** The budget of a tight case. The first run showed the full budget holds more than half of this Chat, whatever the turn. */
export const TIGHT_BUDGET_TOKENS = 1_000;

export const CHOICE_CASES: ChoiceCase[] = (['plain', 'crowded', 'tight'] as const).flatMap((setting) =>
    ANCHORS.flatMap((one) =>
        CUES.filter((cue) => setting === 'plain' || cue !== 'unrelated').map((cue): ChoiceCase => ({
            anchor: one.name,
            cue,
            crowded: setting === 'crowded',
            tight: setting === 'tight',
            with: one.with,
            userText: cue === 'direct' ? one.directCue : cue === 'context' ? one.contextCue : one.unrelatedTurn,
            history: RECENT_HISTORY,
            topics: cue === 'unrelated' ? [] : one.topics,
        })),
    ),
);

// ---------------------------------------------------------------------------------------------
// Layer 2, Extraction.

const CAST_NAMES = MEMORY_CAST.map((character) => character.name);
type Added = Extract<ExtractedOperation, { op: 'add' }>;
const added = (extraction: Extraction): Added[] => extraction.operations.filter((operation): operation is Added => operation.op === 'add');
const said = (texts: string[]): string => texts.join(' | ') || 'nothing added';

/** An added Memory holds every one of `words`: the event, in its own words. */
function addsTheEvent(name: string, ...words: RegExp[]): Check<Extraction> {
    return {
        name,
        run: (extraction) => {
            const found = added(extraction).find((operation) => words.every((word) => word.test(operation.text)));
            return { pass: found !== undefined, reason: found?.text ?? said(added(extraction).map((operation) => operation.text)) };
        },
    };
}

/**
 * Not checked: that a Memory writes {user} for the worn identity. The model wrote the name four
 * times in five on the first run, and the app writes {user} for it when it stores the Memory, so
 * no fault reaches a Chat.
 */

/** As the app reads a known-by list: the worn identity is no Character, and is skipped. */
const isUser = (name: string): boolean => ['user', '{user}', CORIN.toLowerCase()].includes(name.trim().toLowerCase());

/** The Memory of the event is known by exactly `names` of the cast: those present, and nobody who was away. */
function knownByExactly(word: RegExp, names: string[]): Check<Extraction> {
    return {
        name: `who knows it: only ${names.join(' and ')}`,
        run: (extraction) => {
            const found = added(extraction).find((operation) => word.test(operation.text));
            if (!found) return { pass: false, reason: 'no Memory of the event' };
            const cast = found.knownBy.filter((name) => !isUser(name));
            const same = cast.length === names.length && names.every((name) => cast.includes(name));
            return { pass: same, reason: `known by ${found.knownBy.join(', ') || 'nobody'}` };
        },
    };
}

const extractionBase: ExtractionPromptInput = { cast: CAST_NAMES, identityName: CORIN, present: [], memories: [], beliefs: [], userText: null, aiText: '' };
const EXTRACTS = ['# LATEST EXCHANGE (extract from this)'];
/** A claim about the fire stated as what happened, with no "told", "said" or "believes" about it. */
const STATES_THE_LIE = /\{user\}[^.]*\b(?:set|started|lit|burned|burnt)\b[^.]*\b(?:fire|shed)\b/i;
const AS_A_CLAIM = /\b(?:told|said|claim|lied|lie\b|accus|believ|rumou?r|blam)/i;

export const EXTRACTION_SCENES: MemoryScene[] = [
    {
        kind: 'memory',
        name: 'extract-event',
        about: 'A plain pivotal event becomes one Memory: what happened, who was in it, known by those present.',
        expects: EXTRACTS,
        input: {
            ...extractionBase,
            present: [SERA],
            userText: `${CORIN} wades in to the chest, gets both arms under the overturned skiff and drags the man out from beneath it.`,
            aiText: `The skiff rolled free, her name showing for a moment on the wet stern: Marigold. The man came up coughing river water, and Sera was on her knees in the shallows before he had finished.\n\n@${SERA}: That is my brother. That is Tobin.\n\n@${SERA}: I owe you a life, surveyor. I do not say that twice.`,
        },
        checks: [addsTheEvent('what happened: the rescue', /Tobin|brother/i, /Marigold|skiff|river|drown|water/i), knownByExactly(/Tobin|brother/i, [SERA])],
    },
    {
        kind: 'memory',
        name: 'extract-away',
        about: 'A thing told with the others away is known by the one who told it, and by nobody who was not there.',
        expects: EXTRACTS,
        input: {
            ...extractionBase,
            present: [BRAM],
            userText: `${CORIN} holds out the bill of lading and asks Bram to check the figures.`,
            aiText: `Bram took the paper, held it a moment, and handed it back without looking down. There was nobody else on the mooring.\n\n@${BRAM}: I will tell you a thing, and you will keep it. I cannot read a word of that. Never could. My niece Odalys keeps my ledger, and not a soul on this river knows it but her and now you.`,
        },
        checks: [addsTheEvent('what happened: the secret', /read/i, /Odalys|niece|ledger/i), knownByExactly(/read/i, [BRAM])],
    },
    {
        kind: 'memory',
        name: 'extract-lie',
        about: 'A lie told to a Character is that Character’s Belief, and never a Memory of what happened.',
        expects: [...EXTRACTS, 'believe'],
        input: {
            ...extractionBase,
            present: [BRAM, ILSE],
            userText: null,
            aiText: `Ilse stood in the ash of her drying shed with her burned hand wrapped in her apron. Bram would not meet her eye. It was his own lantern that had done it, and he knew it; ${CORIN} had been at the lock-house all that evening.\n\n@${BRAM}: I saw the surveyor by your yard that night, Ilse. With a torch. I would not say it if I had not seen it.\n\nIt was a lie, and Ilse believed every word of it.\n\n@${ILSE}: Then I know who to thank for this.`,
        },
        checks: [
            {
                name: 'fact or belief: the lie is Ilse’s Belief',
                run: (extraction) => {
                    const beliefs = extraction.operations.filter((operation): operation is Extract<ExtractedOperation, { op: 'believe' }> => operation.op === 'believe');
                    const hers = beliefs.find((belief) => belief.character === ILSE && /fire|shed|torch|burn/i.test(belief.text));
                    return { pass: hers !== undefined, reason: hers?.text ?? `${beliefs.length} Beliefs, none of Ilse Varn about the fire` };
                },
            },
            {
                name: 'fact or belief: no Memory states the lie as true',
                run: (extraction) => {
                    const stated = added(extraction).find((operation) => STATES_THE_LIE.test(operation.text) && !AS_A_CLAIM.test(operation.text));
                    return { pass: stated === undefined, reason: stated ? `stated as fact: ${stated.text}` : 'not stated as fact' };
                },
            },
            {
                name: 'what happened: the lantern, known only by Bram',
                run: (extraction) => {
                    const truth = added(extraction).find((operation) => /lantern/i.test(operation.text));
                    if (!truth) return { pass: false, reason: 'no Memory of the lantern' };
                    return { pass: !truth.knownBy.includes(ILSE), reason: `known by ${truth.knownBy.join(', ') || 'nobody'}` };
                },
            },
        ],
    },
    {
        kind: 'memory',
        name: 'extract-change',
        about: 'An event that changes an earlier Memory changes that Memory, and does not leave two that disagree.',
        expects: [...EXTRACTS, 'green cord'],
        input: {
            ...extractionBase,
            present: [SERA, ILSE],
            memories: [{ id: 1, text: anchor('key').memory.text, knownBy: [SERA, BRAM, ILSE], locked: false }],
            userText: `${CORIN} steadies Sera’s good arm while Ilse finishes the splint.`,
            aiText: `Sera lifted the cord over her head one-handed, the silver key swinging, and held it out across the table.\n\n@${SERA}: Take it. I cannot work a gate with one wrist, and I will not have it hanging on a cripple. Keep it till I ask.\n\nIlse closed her fingers round the key and put it in her apron pocket.\n\n@${ILSE}: I will hang it behind the counter, beside the scales. It is safe with me.`,
        },
        checks: [
            {
                name: 'the change: the earlier Memory is changed, by its id',
                run: (extraction) => {
                    const changed = extraction.operations.find(
                        (operation) => ((operation.op === 'update' || operation.op === 'archive' || operation.op === 'delete') && operation.id === 1) || (operation.op === 'merge' && operation.ids.includes(1)),
                    );
                    return { pass: changed !== undefined, reason: changed ? changed.op : `Memory 1 untouched: ${extraction.operations.map((operation) => operation.op).join(', ') || 'no operations'}` };
                },
            },
            {
                name: 'the change: Ilse now holds the key',
                run: (extraction) => {
                    const texts = extraction.operations.flatMap((operation) => (operation.op === 'add' || operation.op === 'update' || operation.op === 'merge' ? [operation.text] : []));
                    const now = texts.find((text) => /Ilse/.test(text) && /key/i.test(text));
                    return { pass: now !== undefined, reason: now ?? said(texts) };
                },
            },
        ],
    },
    {
        kind: 'memory',
        name: 'extract-buried',
        about: 'A promise made in the middle of small talk is kept, and the small talk is not.',
        expects: EXTRACTS,
        input: {
            ...extractionBase,
            present: [ILSE],
            userText: `${CORIN} says the lane was all mud this morning, that the cooper’s boy nearly lost a boot in it, and, by the way, that he will bring her ghostcap moss from the Tarn fen before the first frost, he promises. Then he asks whether it always rains like this in autumn.`,
            aiText: `Ilse went on labelling jars while he talked, and looked up only once.\n\n@${ILSE}: It always rains like this. The cooper’s boy loses a boot every year; it is very nearly a festival.\n\n@${ILSE}: Before the first frost, then. I will hold you to it.`,
        },
        checks: [
            addsTheEvent('what happened: the promise', /ghostcap|moss/i, /promis|bring|frost/i),
            knownByExactly(/ghostcap|moss/i, [ILSE]),
            {
                name: 'the small talk is not kept',
                run: (extraction) => ({ pass: added(extraction).length <= 2, reason: `${added(extraction).length} Memories added: ${said(added(extraction).map((operation) => operation.text))}` }),
            },
        ],
    },
];

// ---------------------------------------------------------------------------------------------
// Layer 3, Use.

/** The Memories sent beside the anchor's in every arm: the newest of the Chat, as much as leaves the anchor room in the budget. */
export const FILLER_BUDGET_TOKENS = 3_500;

export const FILLER_MEMORIES: PromptMemory[] = (() => {
    const kept: typeof FIXTURE_MEMORIES = [];
    let used = 0;
    for (const memory of [...FIXTURE_MEMORIES].reverse()) {
        if (memory.anchor) continue;
        const cost = memoryCost(memory);
        if (used + cost > FILLER_BUDGET_TOKENS) break;
        used += cost;
        kept.unshift(memory);
    }
    return kept.map((memory) => ({ text: memory.text, knownBy: memory.knownBy, locked: false }));
})();

export type Arm = 'with' | 'without' | 'offtopic' | 'alone';

/** One anchor as Layer 3 plays it: the Character, the ask their card opposes, and the choice the past points to. */
interface UseAnchor {
    anchor: AnchorName;
    character: string;
    /** Where they are when the turn comes: narration only, so nothing in it greets the user warmly or coldly. */
    history: PromptHistoryMessage[];
    /** The turn of arms A and B: it asks for what the card alone would settle the other way. */
    ask: string;
    /** The turn of arm C, on which the past has no bearing; none when the past bears on every turn. */
    offTopic: string | null;
    /** Words the card holds, so the scene names what its prompt must keep. */
    cardSays: string;
    impact: GradedCheck;
}

export const IMPACT = 'behavioural impact';

const USE_ANCHORS: UseAnchor[] = [
    {
        anchor: 'rescue',
        character: SERA,
        history: [
            { role: 'user', text: `${CORIN} climbs the steps to the lock-house at dusk and knocks on the open door.` },
            { role: 'assistant', text: 'Sera was at the table with the gauge book open in front of her, her sleeves rolled to the elbow. She did not get up.' },
        ],
        // A favour her card leans against and does not forbid. The first two asks were for the lock ledger, which a rule on her card kept shut: with the Memory she named the debt, offered "coin, if you need coin", and kept the book.
        ask: `${CORIN} tells Sera the Board’s pay is a month late, and asks her to lend him twelve crowns until it comes.`,
        offTopic: anchor('rescue').unrelatedTurn,
        cardSays: 'As a habit she does not lend money',
        impact: {
            name: IMPACT,
            criterion:
                'It passes only if Sera lends Corin the money in this reply: she hands it over, or says plainly that she will. It fails if she refuses, offers something else in its place, puts him off, or leaves it undecided, however kindly she speaks. Judge by how the reply ends: what she does or decides last counts over what she says first.',
        },
    },
    {
        anchor: 'report',
        character: BRAM,
        history: [
            { role: 'user', text: `${CORIN} walks down to the mooring where the Dunlin is tied up.` },
            { role: 'assistant', text: 'Bram was on the foredeck with a coil of rope across his knees, working a splice. The flat sat low and square in the water behind him.' },
        ],
        ask: `${CORIN} asks Bram to lend him the Dunlin for a day, to carry survey stakes up to the quarry.`,
        offTopic: anchor('report').unrelatedTurn,
        cardSays: 'lends his boat, his tools and his coin to anyone who asks',
        impact: {
            name: IMPACT,
            criterion:
                'It passes only if Bram does not lend Corin the boat in this reply: he refuses, or makes plain that he will not. It fails if he agrees, offers the boat, names a day, or leaves the matter open in a friendly way, whatever else he says. Judge by how the reply ends: what he does or decides last counts over what he says first.',
        },
    },
    {
        anchor: 'fire',
        character: ILSE,
        history: [
            { role: 'user', text: `${CORIN} pushes open the door of the apothecary’s shop, and the bell over it rings.` },
            { role: 'assistant', text: 'Ilse was weighing something on the brass scales and did not look up at once. The grey cat on the counter opened one eye.' },
        ],
        // Not a sale: her card has her serve every customer alike, and the first runs measured that. Whether he may stay is hers to give or refuse.
        ask: `${CORIN} asks Ilse whether he may sit by her stove this evening and draw the plants on her racks.`,
        // What she believes of him bears on every turn between them, so there is no turn it has no bearing on.
        offTopic: null,
        cardSays: 'serves every customer alike',
        impact: {
            name: IMPACT,
            criterion:
                // Worded as one thing to find. As "does not serve him as she would any customer" the grader passed two real replies in which she kindly asked about his sleep before selling (the first run).
                'It fails if Ilse lets Corin stay in a friendly or ordinary way: she agrees, makes room for him, or talks with him about the drawing. It passes only if she does not welcome him: she refuses, sends him away, or lets him stay while showing him open coldness, blame or accusation. Judge by how the reply ends: what she does or decides last counts over what she says first.',
        },
    },
];

function useScene(use: UseAnchor, arm: Arm): TurnScene {
    const own = anchor(use.anchor);
    const telltale = own.telltale.source.split('|')[0];
    const withMemory = arm !== 'without';
    const fire = use.anchor === 'fire';
    const about: Record<Arm, string> = {
        with: `With the Memory of the ${use.anchor} among the others, ${use.character} makes the choice that past points to.`,
        without: `The same turn without the Memory: what ${use.character}’s card alone gives, and no past invented.`,
        offtopic: `With the Memory, on a turn it has no bearing on: ${use.character} leaves it alone.`,
        alone: `The same turn with the Memory and no other: a Memory lost in the crowd acts here, one the card overrules does not.`,
    };
    return {
        kind: 'turn',
        name: `use-${use.anchor}-${arm}`,
        about: about[arm],
        expects: withMemory ? [use.cardSays, telltale, ...(fire ? [`${ILSE} believes:`, 'dropped lantern'] : [])] : [use.cardSays],
        input: {
            ...MEMORY_STORY,
            history: use.history,
            present: [use.character],
            memories: [...(withMemory ? [{ text: own.memory.text, knownBy: own.memory.knownBy, locked: false }] : []), ...(arm === 'alone' ? [] : FILLER_MEMORIES)],
            ...(fire && withMemory ? { beliefs: [ILSE_BELIEF] } : {}),
        },
        userText: arm === 'offtopic' ? use.offTopic! : use.ask,
        checks: [
            ...(arm === 'with' || arm === 'alone' ? [mentions('recall evidence', own.telltale)] : []),
            ...(arm === 'without' ? [avoids('invents no past', own.eventWords)] : []),
            ...(arm === 'offtopic' ? [avoids('leaves it alone', own.eventWords)] : []),
            // The truth of the fire is in the prompt, known by Bram alone: Ilse was never told.
            ...(fire && withMemory ? [avoids('does not know what she was never told', /lantern/i)] : []),
            parsesAsAReply,
            speaks(use.character),
            neverSpeaksAsTheUser,
        ],
        graded: arm === 'offtopic' ? [] : [use.impact],
    };
}

export const USE_SCENES: TurnScene[] = USE_ANCHORS.flatMap((use) => (['with', 'without', ...(use.offTopic ? ['offtopic'] : []), 'alone'] as Arm[]).map((arm) => useScene(use, arm)));

/** The anchors Layer 3 plays, in order. */
export const USE_ANCHOR_NAMES: AnchorName[] = USE_ANCHORS.map((use) => use.anchor);

// ---------------------------------------------------------------------------------------------
// Layer 4, Story so far.

/** The name the grader check knows the Story so far scene by. */
export const ACCOUNT_SCENE = 'account';

/** For each changed item, the one thing asked of an account written after its change: what is true of it now. */
export const CURRENT_STATE: Record<string, GradedCheck> = {
    [CHANGED_ITEMS[0].name]: {
        name: 'the lock key: who holds it now',
        criterion:
            'This is about who holds the silver lock key at the end of the account. It passes only if the account gives Ilse Varn as holding or keeping the key. It fails if the account gives Sera Quill as wearing or carrying the key and never says it passed to Ilse. Saying that Sera once wore it, and then gave it to Ilse, is a pass.',
    },
    [CHANGED_ITEMS[1].name]: {
        name: 'Bram’s boat: what he works now',
        criterion:
            'This is about Bram Oakes’s boat at the end of the account. It passes only if the account says Bram sold the Heron, or no longer has it. It fails if the account gives the Heron as Bram’s boat and never says he sold or lost it. Saying that he once owned the Heron, and then sold it, is a pass.',
    },
};

// ---------------------------------------------------------------------------------------------
// The grader check: for every graded check above, a text that passes and texts that must fail.

const S = `@${SERA}:`;
const B = `@${BRAM}:`;
const I = `@${ILSE}:`;

export const MEMORY_GRADER_CASES: GraderCase[] = [
    {
        scene: 'use-rescue-with',
        check: IMPACT,
        label: 'pass',
        reply: `Sera went to the tin on the mantel without a word and counted twelve crowns onto the table.\n\n${S} Take it. Pay me when the Board pays you.`,
        why: 'She lends it.',
    },
    {
        scene: 'use-rescue-with',
        check: IMPACT,
        label: 'fail',
        reply: `Sera closed the gauge book.\n\n${S} No. I do not lend. Ask the Board for an advance.`,
        why: 'A plain refusal.',
    },
    {
        scene: 'use-rescue-with',
        check: IMPACT,
        label: 'fail',
        reply: `Sera’s face softened, and she poured him a cup from the pot without being asked.\n\n${S} A month late is hard, and I am sorry for it. Eat here till it comes. There is always stew.\n\n${S} But I do not lend coin. Not to you, not to anyone.`,
        why: 'Warm, and offers something else in its place: kindness is not the loan.',
    },
    {
        scene: 'use-rescue-with',
        check: IMPACT,
        label: 'fail',
        reply: `Sera turned the cup in her hands.\n\n${S} You pulled Tobin out from under the Marigold. I have not forgotten.\n\n${S} Ask me for anything else. Money between friends drowns them both. No.`,
        why: 'Names the event, and still refuses: recall is not impact.',
    },
    {
        scene: 'use-rescue-with',
        check: IMPACT,
        label: 'pass',
        reply: `Sera did not answer at once. She set her pen across the page and looked at the fire.\n\n${S} I do not lend money. You know that. I have seen what a debt does to a man on this river.\n\nShe was quiet a while longer. The lamp hissed. Then she got up, stiffly, and went to the dresser, and stood with her hand on the drawer.\n\n${S} My mother would have said no and slept well on it.\n\nShe opened the drawer, took out the leather purse, and counted twelve crowns into his hand, one at a time.\n\n${S} There. Do not thank me. Pay it back when you can.`,
        why: 'From the first runs: a long reply that opens against it and ends by doing it. The grader once failed such a reply on its first lines.',
    },
    {
        scene: 'use-report-with',
        check: IMPACT,
        label: 'pass',
        reply: `Bram went on with the splice and did not look up.\n\n${B} No. Not to you. Find another boat, surveyor, there are plenty on this river that owe you nothing.`,
        why: 'He refuses the boat.',
    },
    {
        scene: 'use-report-with',
        check: IMPACT,
        label: 'fail',
        reply: `Bram threw down the rope and laughed.\n\n${B} The Dunlin? Take her, take her, she steers like a barn door but she will carry your sticks. Have her back by dark.`,
        why: 'He lends it.',
    },
    {
        scene: 'use-report-with',
        check: IMPACT,
        label: 'fail',
        reply: `Bram scratched his beard and looked at the sky for a while.\n\n${B} Stakes to the quarry, is it. Well, I have a load of my own Thursday. Come by Wednesday and we will see how the water sits.`,
        why: 'Left open in a friendly way: not a refusal.',
    },
    {
        scene: 'use-report-with',
        check: IMPACT,
        label: 'fail',
        reply: `Bram’s hands stopped on the rope.\n\n${B} Forty crowns that Vessin oil cost me, and I have not forgotten whose tongue it was.\n\n${B} But a boat is a boat. Take her for the day, and bring her back clean.`,
        why: 'Names the grievance, and lends the boat all the same.',
    },
    {
        scene: 'use-fire-with',
        check: IMPACT,
        label: 'pass',
        reply: `Ilse set the weight down on the pan with a small hard click.\n\n${I} No. Not in my shop, and not near my racks. You know why.`,
        why: 'She refuses him.',
    },
    {
        scene: 'use-fire-with',
        check: IMPACT,
        label: 'pass',
        reply: `Ilse did not look up from the scales.\n\n${I} Sit, if you must. I will not put a man out into the cold, even one who burned what was mine. Do not touch anything, and do not speak to me.`,
        why: 'She lets him stay, with open blame: not a welcome.',
    },
    {
        scene: 'use-fire-with',
        check: IMPACT,
        label: 'fail',
        reply: `Ilse looked up and smiled, and moved a crate off the stool by the stove.\n\n${I} Sit there, the light is best. Start with the yarrow, it holds still.`,
        why: 'An ordinary welcome.',
    },
    {
        scene: 'use-fire-with',
        check: IMPACT,
        label: 'fail',
        reply: `Ilse considered the racks, then him.\n\n${I} The stove is lit till nine. Which plants did you have in mind? Some of these are past drawing, and I would rather be asked twice than guessed at once.`,
        why: 'She has not said yes in so many words, but she is making room for him, civilly, as she would for anyone.',
    },
    {
        scene: 'use-fire-with',
        check: IMPACT,
        label: 'fail',
        reply: `Ilse folded the paper and set it aside.\n\n${I} I have not forgotten Candle Night. But the evenings are long, and the stove is warm. Sit, and draw what you like. I will make tea.`,
        why: 'Names the night, and welcomes him all the same: recall is not impact.',
    },
    {
        scene: ACCOUNT_SCENE,
        check: CURRENT_STATE[CHANGED_ITEMS[0].name].name,
        label: 'pass',
        reply: 'Sera wore the silver lock key on a cord until she broke her wrist on the winch, when she gave it to Ilse to keep. Ilse has held it since, behind her counter.',
        why: 'The old state is given as past, and the new one as now.',
    },
    {
        scene: ACCOUNT_SCENE,
        check: CURRENT_STATE[CHANGED_ITEMS[0].name].name,
        label: 'fail',
        reply: 'Sera keeps the lock and wears its silver key on a cord round her neck, never taking it off. She broke her wrist on the winch and Corin worked the gates for three weeks.',
        why: 'The old state given as current; the handing over is lost.',
    },
    {
        scene: ACCOUNT_SCENE,
        check: CURRENT_STATE[CHANGED_ITEMS[0].name].name,
        label: 'pass',
        reply: 'After Sera broke her wrist the lock key went to Ilse, who hung it beside her scales, and it stayed with her even once Sera was working the gates again.',
        why: 'Ilse holds it, with no word of the cord at all.',
    },
    {
        scene: ACCOUNT_SCENE,
        check: CURRENT_STATE[CHANGED_ITEMS[1].name].name,
        label: 'pass',
        reply: 'Bram owned the barge Heron until the chandler’s debt forced him to sell it. He poled a hired flat, the Dunlin, after that.',
        why: 'The Heron is given as sold.',
    },
    {
        scene: ACCOUNT_SCENE,
        check: CURRENT_STATE[CHANGED_ITEMS[1].name].name,
        label: 'fail',
        reply: 'Bram carries grain and salt to Stell on his barge, the Heron, and took Corin downriver on it to see the sea locks. The chandler pressed him for an old bill.',
        why: 'The Heron is still his; the sale is lost.',
    },
    {
        scene: ACCOUNT_SCENE,
        check: CURRENT_STATE[CHANGED_ITEMS[1].name].name,
        label: 'pass',
        reply: 'Bram lost the Heron to his debts and worked the Dunlin, a hired flat, until he took a half share and built a barge of his own, the Kestrel.',
        why: 'The Heron is gone, in other words than "sold".',
    },
];
