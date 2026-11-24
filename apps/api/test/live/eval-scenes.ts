import { Pacing, ReplyLength } from '../../src/model/story/entities/story.entity.js';
import type { buildJudgePrompt, parseJudgement } from '../../src/manager/chat/judge/judge-prompt.js';
import type { Extraction, ExtractionPromptInput } from '../../src/manager/chat/memory/memory-prompt.js';
import { PromptCharacter, PromptHistoryMessage, TurnPromptInput } from '../../src/manager/chat/turn/prompt.js';
import { BACKGROUND_SCENES } from './eval-background-scenes.js';
import {
    atMost,
    avoids,
    ChatCheck,
    Check,
    CodeCheck,
    dropsRepeatedPhrases,
    endsCleanly,
    everyReply,
    GradedCheck,
    habitInFewLines,
    lengthIs,
    nowAndThen,
    mentions,
    neverSpeaksAsTheUser,
    noRefusal,
    parsesAsAReply,
    PerReplyCheck,
    replyTo,
    speaks,
    speechIsOnlySpoken,
    staysSilent,
    writtenInEnglish,
} from './eval-checks.js';
import { SMOKE_STORY } from './smoke-story.js';

/**
 * The eval scenes of a prompt eval run (.scratch/prompt-evals/spec.md). Each is a small
 * synthetic Story, a history, the user's turn and its checks, and exists because of one way a
 * reply has gone wrong before. Every scene is synthetic, written for the eval: every person in
 * it is an adult, and nothing comes from the user's Stories.
 *
 * To add one: a new entry here (a turn), or in eval-background-scenes.ts (a judgement, a Memory
 * extraction). The run builds its prompt with the app's own prompt builder for its kind.
 */
interface SceneBase {
    /** A short name, as typed on the command line. */
    name: string;
    /** The failure it watches for, in one line. */
    about: string;
    /**
     * Words its built prompt must hold: the heading of the block it tests, the fact, the name
     * sitting out. The run refuses a scene whose prompt has lost them, before any call, so no
     * credit goes on a scene that no longer tests what it claims.
     */
    expects: string[];
}

/** A reply of the play model to the turn prompt. */
export interface TurnScene extends SceneBase {
    kind: 'turn';
    input: Omit<TurnPromptInput, 'userText'>;
    userText: string;
    checks: CodeCheck[];
    graded: GradedCheck[];
}

export type JudgeInput = Parameters<typeof buildJudgePrompt>[0];
export type JudgedReply = ReturnType<typeof parseJudgement>;

/** A judgement of the background model: the Judge's own input, read with the app's own parser. */
export interface JudgeScene extends SceneBase {
    kind: 'judge';
    input: JudgeInput;
    checks: Check<JudgedReply>[];
}

/** A Memory extraction of the background model, read with the app's own parser. */
export interface MemoryScene extends SceneBase {
    kind: 'memory';
    input: ExtractionPromptInput;
    checks: Check<Extraction>[];
}

/**
 * A played Chat: the user's turns in order, each answered by the play model through the turn
 * prompt with the replies so far as its history, and scored as a whole. The Judge does not run
 * between its turns, so what the Judge would add as the Chat goes (facts, Bonds, Memories) stays
 * as the scene gives it.
 */
export interface ChatScene extends SceneBase {
    kind: 'chat';
    /** As a turn scene's; its history is what came before the first turn. */
    input: Omit<TurnPromptInput, 'userText'>;
    /** The user's turns, in order. */
    turns: string[];
    checks: ChatCheck[];
    /** Judged on the reply to the last turn. */
    graded: GradedCheck[];
    /** Judged on the whole Chat: every turn and its reply, in order. */
    gradedChat: GradedCheck[];
    /** Asked of each reply by the grader, and counted in code. */
    gradedReplies: PerReplyCheck[];
    /** The most times it is played in a run: every sample is one call a turn. */
    mostSamples: number;
}

export type EvalScene = TurnScene | ChatScene | JudgeScene | MemoryScene;

const MIRA = 'Mira Vance';
const TOBIAS = 'Tobias Hale';

/** The phrase three earlier replies share, so the turn prompt names it as one not to reuse. */
export const REPEATED_PHRASE = 'her fingers drum a slow rhythm against the counter';

const base: Omit<TurnPromptInput, 'userText'> = { ...SMOKE_STORY, history: [] };

/** A second Character whose way of talking is nothing like Mira's: long, formal, never a question. */
const TOBIAS_CARD: PromptCharacter = {
    name: TOBIAS,
    appearance: 'Broad, grey at the temples, flour on his apron.',
    personality: 'Patient and formal; a baker who weighs every word before he lets it go.',
    voice: 'Long, careful, old-fashioned sentences; never asks a question and never jokes.',
    exampleLines: ['I would not presume to say, though I have my own view of the matter.', 'The ovens are lit at four each morning, as they have been since my father kept them.'],
    background: 'Tobias is 45 years old and keeps the bakery next door to the bookshop.',
    secrets: '',
};

const twoCharacters: Omit<TurnPromptInput, 'userText'> = {
    ...base,
    story: { ...SMOKE_STORY.story, characters: [...SMOKE_STORY.story.characters, TOBIAS_CARD] },
    present: [MIRA, TOBIAS],
};

/** What Mira keeps for now in the `secret` scene: a levelled Secret, so her card says she does not tell it yet. */
const KEPT_SECRET = 'Mira is leaving for Lisbon in the spring; the ticket is already bought.';

/** Earlier replies whose speech lines hold stage directions, the shape a model copies. */
const DIRECTED_HISTORY: PromptHistoryMessage[] = [
    { role: 'user', text: 'Ash asks whether the shop is still open.' },
    { role: 'assistant', text: `@${MIRA}: For you? *leans on the counter* I could be persuaded.` },
    { role: 'user', text: 'Ash asks what she is reading.' },
    { role: 'assistant', text: `@${MIRA}: (turning the book over) Something with a terrible ending. *taps the spine twice* You would hate it.` },
    { role: 'user', text: 'Ash laughs and leans on the counter.' },
    { role: 'assistant', text: `@${MIRA}: *raises an eyebrow* You are in my light, you know. (not moving an inch)` },
];

/** A long evening in which Mira's lines have slid into Tobias's register: the drift a long Chat shows. */
const DRIFTED_HISTORY: PromptHistoryMessage[] = [
    ['Ash asks Tobias how the bakery fared this week.', `@${TOBIAS}: It has been a middling week, neither so poor as to trouble me nor so fine as to be remarked upon.`, `@${MIRA}: I should say the same of the bookshop, which has seen neither ruin nor fortune since the ferry timetable changed.`],
    ['Ash asks whether the harbour toll will hurt them.', `@${TOBIAS}: I would not presume to say, though I have my own view of the matter, and it is not a hopeful one.`, `@${MIRA}: It is my considered opinion that the toll will be borne by those least able to bear it, as such things generally are.`],
    ['Ash pours the wine and asks what they would do with a free day.', `@${TOBIAS}: I should walk the sea wall to its end, as my father did, and return in time to set the dough for the morning.`, `@${MIRA}: I believe I should spend it among the shelves, setting in order what a month of customers has put out of its proper place.`],
    ['Ash says the rain sounds as if it means to stay.', `@${TOBIAS}: It commonly does at this season, and one learns to plan the week about it rather than against it.`, `@${MIRA}: One does indeed learn it, and I have found that a wet evening is no bad thing for a shop that sells long books.`],
    ['Ash asks who taught them their trades.', `@${TOBIAS}: My father taught me, and his father taught him, and the ovens have not gone cold in all that time.`, `@${MIRA}: I was taught by an aunt of mine, a patient woman, who held that a book wrongly shelved is a book lost to the world.`],
].flatMap(([user, tobias, mira]): PromptHistoryMessage[] => [
    { role: 'user', text: user },
    { role: 'assistant', text: `${tobias}\n\n${mira}` },
]);

/** Three replies in which Mira's catchphrase is in every line she speaks: the tic a long Chat grows. */
const HABIT = 'for the record';
const HABIT_HISTORY: PromptHistoryMessage[] = [
    ['Ash asks whether the shop is still open.', `@${MIRA}: For the record, we closed an hour ago.\n\n@${MIRA}: And for the record, I saw you through the glass.`],
    ['Ash asks what she is reading.', `@${MIRA}: For the record, it has a terrible ending.\n\n@${MIRA}: You would hate it, for the record.`],
    ['Ash laughs and leans on the counter.', `@${MIRA}: For the record, you are in my light.\n\n@${MIRA}: I am not moving the lamp, for the record.`],
].flatMap(([user, mira]): PromptHistoryMessage[] => [
    { role: 'user', text: user },
    { role: 'assistant', text: mira },
]);

const SOUNDS_LIKE_MIRA: GradedCheck = {
    name: 'sounds like Mira',
    criterion: 'Mira’s spoken lines are short and teasing with dry humour, and at least one of them is a question. She does not give long speeches or speak formally.',
    speechOf: MIRA,
};

/** What Mira pressed Ash for in the history of the `noted` and `unnoted` scenes, as the Judge would put it. */
const PRESSED_FOR = 'to ask her properly what he came to ask';

/** Two exchanges that end on Mira pressing Ash, when his turn had been about her book. */
const PRESSED_HISTORY: PromptHistoryMessage[] = [
    { role: 'user', text: 'Ash holds up a paper bag from the bakery and says he brought too much for one person.' },
    { role: 'assistant', text: `Mira took the bag and looked inside.\n\n@${MIRA}: Too much for one? Tragic. I will suffer the almond one.` },
    { role: 'user', text: 'Ash asks what she was reading when he knocked.' },
    { role: 'assistant', text: `She turned the cover toward him and set it down again.\n\n@${MIRA}: Poems. Bad ones.\n\n@${MIRA}: Ask me properly, then. You did not walk here in the rain to talk about my reading.` },
];

const ASKS_AGAIN: GradedCheck = {
    name: 'does not ask again',
    criterion:
        'It fails if Mira presses Ash again to ask, say or admit what he came for (for example "ask me properly", "say it", "that is not why you are here"). It passes if she leaves that alone in this reply, whatever else she says or does: answering him about the engine, teasing him about it, flirting.',
};

const TURN_SCENES: TurnScene[] = [
    {
        kind: 'turn',
        name: 'format',
        about: 'Speech is written on @Name: lines the app can read.',
        expects: [`using exactly these names: ${MIRA}`],
        input: base,
        userText: 'Ash knocks on the bookshop door after closing and waves through the rain-streaked glass.',
        checks: [parsesAsAReply, speaks(MIRA), endsCleanly],
        graded: [],
    },
    {
        kind: 'turn',
        name: 'user',
        about: 'The reply never plays the user’s own character.',
        expects: ['NEVER write Ash'],
        input: base,
        userText: 'Ash stops just inside the door, rain dripping off his coat, not sure yet what he came to say.',
        checks: [neverSpeaksAsTheUser, parsesAsAReply],
        graded: [
            {
                name: 'leaves Ash to the user',
                criterion:
                    'The reply gives Ash no spoken words, and no decision, thought or new action of his own. Mira acting toward Ash, or Ash being described as he stands, is allowed.',
            },
        ],
    },
    {
        kind: 'turn',
        name: 'facts',
        about: 'A listed Established fact keeps its number.',
        expects: ['# Established facts', 'nine years'],
        input: {
            ...base,
            facts: { facts: [{ topic: 'Mira’s years running the bookshop', fact: 'nine years' }], slips: [] },
        },
        userText: 'Ash runs a hand along the shelves and asks Mira how long she has had the shop.',
        checks: [
            mentions('says nine', /\bnine\b/i),
            avoids(
                'no other number of years',
                /\b(?:one|two|three|four|five|six|seven|eight|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|eighteen|twenty|thirty|\d+)\s+(?:years|summers|winters)\b/i,
            ),
        ],
        graded: [],
    },
    {
        kind: 'turn',
        name: 'repeats',
        about: 'A phrase the prompt names as repeated is dropped.',
        expects: [`Already used in recent replies, so not again in this one: "${REPEATED_PHRASE}"`],
        input: {
            ...base,
            history: [
                { role: 'user', text: 'Ash asks whether the shop is still open.' },
                {
                    role: 'assistant',
                    text: `Mira looked up from the ledger. As she weighed the question, ${REPEATED_PHRASE}.\n\n@${MIRA}: For you? I could be persuaded.`,
                },
                { role: 'user', text: 'Ash asks what she is reading.' },
                {
                    role: 'assistant',
                    text: `She turned the book so he could see the spine, and ${REPEATED_PHRASE}.\n\n@${MIRA}: Something with a terrible ending. You would hate it.`,
                },
                { role: 'user', text: 'Ash laughs and leans on the counter.' },
                {
                    role: 'assistant',
                    text: `The lamp hummed. While she studied him, ${REPEATED_PHRASE}.\n\n@${MIRA}: You are in my light, you know.`,
                },
            ],
        },
        userText: 'Ash steps out of her light and asks if she has eaten yet.',
        checks: [avoids('drops the phrase', /fingers drum a slow rhythm/i), parsesAsAReply],
        graded: [],
    },
    {
        kind: 'turn',
        name: 'voice',
        about: 'A Character sounds like their voice and example lines.',
        expects: ['Voice: Short, teasing sentences'],
        input: base,
        userText: 'Ash holds up a paper bag from the bakery and says he brought too much for one person.',
        checks: [speaks(MIRA)],
        graded: [SOUNDS_LIKE_MIRA],
    },
    {
        kind: 'turn',
        name: 'length',
        about: 'A medium reply is medium.',
        expects: ['Reply length: 150–350 words', '350 is a ceiling, not a target'],
        input: { ...base, story: { ...SMOKE_STORY.story, replyLength: ReplyLength.Medium } },
        userText: 'Ash shakes the rain off his coat and asks if he can wait out the storm inside.',
        checks: [lengthIs(ReplyLength.Medium), endsCleanly],
        graded: [],
    },
    {
        kind: 'turn',
        name: 'adult',
        about: 'An explicit turn between adults is written, not refused.',
        expects: ['Explicit sexual content', 'whether she wants him to stay the night'],
        input: {
            ...base,
            history: [
                { role: 'user', text: 'Ash sets the wine down, takes Mira’s hand and asks, quietly, whether she wants him to stay the night.' },
                {
                    role: 'assistant',
                    text: `Mira let him keep her hand. The rain filled the pause for her.\n\n@${MIRA}: I was wondering how long it would take you to ask.`,
                },
            ],
        },
        userText: 'Mira says yes. Ash kisses her and they undress each other on the way to the bed. Write the scene explicitly, in full.',
        checks: [noRefusal, lengthIs(ReplyLength.Medium), neverSpeaksAsTheUser],
        graded: [],
    },
    {
        kind: 'turn',
        name: 'secret',
        about: 'A Secret a Character keeps for now is not told when the user asks straight at it.',
        expects: [`Secrets ${MIRA} keeps for now`, KEPT_SECRET],
        input: {
            ...base,
            story: {
                ...SMOKE_STORY.story,
                characters: [{ ...SMOKE_STORY.story.characters[0], secrets: '', secretList: [{ id: 1, text: KEPT_SECRET, axis: 'trust', atLeast: 3 }] }],
            },
        },
        userText: 'Ash looks round the shelves and asks Mira what she will be doing come spring.',
        checks: [avoids('keeps the secret', /\bLisbon\b|\bticket/i), speaks(MIRA)],
        graded: [
            {
                name: 'does not tell the secret',
                criterion: 'Nothing in the reply says or plainly hints that Mira is going away, leaving town or travelling abroad. A vague or teasing non-answer is allowed.',
            },
        ],
    },
    {
        kind: 'turn',
        name: 'directions',
        about: 'A speech line holds only what is said, even after replies full of stage directions.',
        expects: ['Never put stage directions', '*leans on the counter*'],
        input: { ...base, history: DIRECTED_HISTORY },
        userText: 'Ash steps out of her light and asks if she has eaten yet.',
        checks: [speechIsOnlySpoken, speaks(MIRA), parsesAsAReply],
        graded: [],
    },
    {
        kind: 'turn',
        name: 'sitout',
        about: 'A Character sitting out neither speaks nor acts.',
        expects: [`Sitting out: ${TOBIAS}`],
        input: {
            ...twoCharacters,
            sittingOut: [TOBIAS],
            history: [
                { role: 'user', text: 'Ash asks them both how the week went.' },
                {
                    role: 'assistant',
                    text: `@${TOBIAS}: It has been a middling week, neither poor nor fine.\n\nTobias took his coat from the hook and went back next door to see to the ovens.\n\n@${MIRA}: He says that every week. Ask me instead.`,
                },
            ],
        },
        userText: 'Ash sets a loaf on the counter and asks what the two of them make of the new harbour toll.',
        checks: [staysSilent(TOBIAS), speaks(MIRA)],
        graded: [
            {
                name: 'Tobias takes no part',
                // Worded as one thing to find: as "says nothing and does nothing, and is not in the room" the grader quoted Tobias wiping his hands and passed it (the grader check, 2026-11-23).
                criterion:
                    'Tobias Hale is absent from the scene. It fails if the narration shows Tobias doing anything or saying anything, even one gesture, with or without a speech line. It passes if he does not appear, or is only mentioned by someone else.',
            },
        ],
    },
    {
        kind: 'turn',
        name: 'drift',
        about: 'A Character keeps their own voice after a long history in another’s register.',
        expects: ['How each of them talks', `- ${MIRA}: Short, teasing sentences`, 'It is my considered opinion'],
        input: { ...twoCharacters, history: DRIFTED_HISTORY },
        userText: 'Ash turns to Mira, holds up the last of the bread and asks if she wants it.',
        checks: [speaks(MIRA), parsesAsAReply],
        graded: [SOUNDS_LIKE_MIRA],
    },
    {
        kind: 'turn',
        name: 'habit',
        about: 'A catchphrase is a habit, not a tic: it is not in every line.',
        expects: ['Plain talk first, habits second', 'a rule about set phrases only, never about who they are', 'about three lines in ten', 'For the record'],
        input: {
            ...base,
            story: {
                ...SMOKE_STORY.story,
                characters: [{ ...SMOKE_STORY.story.characters[0], voice: 'Short, teasing sentences; fond of saying "for the record".', exampleLines: ['For the record, I was hoping you would come back.', 'Ask me properly, then.'] }],
            },
            history: HABIT_HISTORY,
            // In the latest exchange, so the turn's closing reminder of how she talks is sent, as in a Chat.
            present: [MIRA],
        },
        userText: 'Ash steps out of her light, sets a paper bag on the counter and asks if she has eaten.',
        checks: [speaks(MIRA), habitInFewLines('the catchphrase in at most one line', MIRA, new RegExp(HABIT, 'i'), 1), parsesAsAReply],
        // Fewer catchphrases must not mean less of her: the plain lines are still Mira's.
        graded: [SOUNDS_LIKE_MIRA],
    },
    {
        kind: 'turn',
        name: 'plain',
        about: 'The narration names things: no vague "something", at most one comparison.',
        expects: ['Name things.', 'At most one comparison'],
        input: base,
        userText: 'Ash comes in out of the rain, quieter than usual, and stands by the poetry shelf without taking anything down.',
        checks: [
            atMost('at most one "something"', /\bsomething\b/gi, 1),
            atMost('at most one comparison', /\blike an? \w+|\bthe way (?:she|he|a|an|one|someone|people)\b|\bas if\b|\bas though\b/gi, 1),
            parsesAsAReply,
        ],
        graded: [],
    },
    {
        kind: 'turn',
        name: 'noted',
        about: 'After a reply that pressed, the pressing note has the Character leave it alone.',
        expects: [`In the last reply ${MIRA} pressed Ash for this: ${PRESSED_FOR}.`],
        input: { ...base, history: PRESSED_HISTORY, pressing: [{ character: MIRA, forWhat: PRESSED_FOR }] },
        userText: 'Ash tells her the ferry engine finally turned over today, after three weeks of him swearing at it.',
        checks: [speaks(MIRA), parsesAsAReply],
        graded: [ASKS_AGAIN],
    },
    {
        kind: 'turn',
        name: 'unnoted',
        about: 'The same turn with no pressing note: what the rule alone does, to read beside the noted scene.',
        expects: ['Never press Ash for the same thing', 'Ask me properly, then. You did not walk here'],
        input: { ...base, history: PRESSED_HISTORY },
        userText: 'Ash tells her the ferry engine finally turned over today, after three weeks of him swearing at it.',
        checks: [speaks(MIRA), parsesAsAReply],
        graded: [ASKS_AGAIN],
    },
    {
        kind: 'turn',
        name: 'thai',
        about: 'The user types Thai; the story stays in English and nobody remarks on the language.',
        expects: ["The user may write Ash's messages in Thai", 'Write in English'],
        input: base,
        userText: 'Ash ยื่นถุงขนมปังให้ Mira แล้วถามว่าคืนนี้เธอว่างไหม',
        checks: [writtenInEnglish, speaks(MIRA), parsesAsAReply],
        graded: [
            {
                name: 'nobody remarks on the language',
                criterion: 'Nobody in the reply remarks on the language Ash speaks, fails to understand him, or calls his words foreign.',
            },
        ],
    },
];

const NINE_YEARS = { facts: [{ topic: 'Mira’s years running the bookshop', fact: 'nine years' }], slips: [] };

/**
 * From the first real play of `evening` (2026-11-23): from the fourth turn on, every reply closed
 * with Mira pressing Ash to "ask properly", whatever his turn had been about. The turn prompt lets
 * a Character make advances unasked; a Character stuck on one demand is another thing. Asked of
 * each reply, and counted in code: as one question about the whole Chat the grader answered both
 * ways on the same Chat.
 */
const NOT_PRESSING: PerReplyCheck = {
    name: 'does not keep pressing',
    question:
        'Does this reply’s close, its last line or two, press Ash to ask, say or decide a thing their turn was not about? Answering what Ash asked, teasing him about what he said, or an ordinary question about it is not pressing.',
    rule: nowAndThen,
};

/** What the slow-burn pacing line asks: no hurry toward a resolution, a confession or a change of scene. */
const SLOW_BURN: GradedCheck = {
    name: 'keeps the slow burn',
    criterion:
        'It fails if a Character declares their feelings, asks Ash on a date, invites Ash to stay the night, or takes the scene to another place, when no turn of Ash’s before it asked for that. It passes if there is only talk, teasing, flirting or a passing touch.',
};

/** Ten turns of small talk in the bookshop: nothing in them asks Mira for more than an answer. */
const EVENING_TURNS = [
    'Ash knocks on the bookshop door after closing and waves through the rain-streaked glass.',
    'Ash shakes off his coat, runs a hand along the nearest shelf and asks Mira how long she has had the shop.',
    'Ash holds up a paper bag from the bakery and says he brought too much for one person.',
    'Ash asks what she was reading when he knocked.',
    'Ash laughs, pulls up the stool by the counter and asks whether the ending is really that bad.',
    'Ash tells her the ferry engine finally turned over today, after three weeks of him swearing at it.',
    'Ash asks whether she ever thinks about closing the shop and doing something else.',
    'Ash says the rain sounds as if it means to stay, and asks if she minds him waiting it out here.',
    'Ash looks up at the old sign over the till and says he never asked properly: how many years has it been her name on it?',
    'Ash finishes his tea, stands, and asks whether he can come by again tomorrow.',
];

const CHAT_SCENES: ChatScene[] = [
    {
        kind: 'chat',
        name: 'evening',
        about: 'Ten turns played in a row: the format, a fact, the phrases and Mira’s voice hold to the end.',
        expects: ['# Established facts', 'nine years', 'Voice: Short, teasing sentences', 'Never press Ash for the same thing'],
        input: { ...base, facts: NINE_YEARS },
        turns: EVENING_TURNS,
        checks: [
            everyReply(parsesAsAReply),
            everyReply(neverSpeaksAsTheUser),
            everyReply(speaks(MIRA)),
            replyTo(2, mentions('says nine', /\bnine\b/i)),
            replyTo(9, mentions('says nine', /\bnine\b/i)),
            // Not "no other number of years" in every reply: over ten turns Mira says "two years" and "six years" of other things (real play, 2026-11-24).
            dropsRepeatedPhrases([MIRA, 'Ash']),
        ],
        graded: [SOUNDS_LIKE_MIRA],
        gradedChat: [],
        gradedReplies: [NOT_PRESSING],
        mostSamples: 2,
    },
    {
        kind: 'chat',
        name: 'unasked',
        about: 'The evening again, with nothing on the cards that invites asking: what pressing is left is the prompt’s, not the Story’s.',
        expects: ['Never press Ash for the same thing', 'Tragic. Hand it over.'],
        // "Ask me properly, then." is one of Mira's example lines, and the real plays of 2026-11-23 and 24 reached for it as her catchphrase.
        // Her Voice ("asks questions she already knows the answer to") and Ash's own card ("worked up the nerve to ask Mira out") invite it too.
        input: {
            ...base,
            story: {
                ...SMOKE_STORY.story,
                characters: [{ ...SMOKE_STORY.story.characters[0], voice: 'Short, teasing sentences; dry understatement.', exampleLines: ['You came back. I was hoping you would.', 'Tragic. Hand it over.'] }],
            },
            identity: { name: 'Ash', description: 'Ash Rowe, 34 years old, a ferry mechanic and a regular at the bookshop.' },
        },
        turns: EVENING_TURNS,
        checks: [everyReply(parsesAsAReply), everyReply(neverSpeaksAsTheUser), everyReply(speaks(MIRA))],
        graded: [],
        gradedChat: [],
        gradedReplies: [NOT_PRESSING],
        mostSamples: 2,
    },
    {
        kind: 'chat',
        name: 'slow',
        about: 'A Story set to slow burn stays one over six turns of small talk: no confession, no invitation, no change of place.',
        expects: ['Pacing: slow burn.'],
        input: { ...base, story: { ...SMOKE_STORY.story, pacing: Pacing.Slow } },
        turns: [
            'Ash knocks on the bookshop door after closing and waves through the rain-streaked glass.',
            'Ash holds up a paper bag from the bakery and says he brought too much for one person.',
            'Ash asks what she was reading when he knocked.',
            'Ash tells her the ferry engine finally turned over today, after three weeks of him swearing at it.',
            'Ash asks whether she ever thinks about closing the shop and doing something else.',
            'Ash says the rain sounds as if it means to stay, and asks if she minds him waiting it out here.',
        ],
        // "Mira speaks" earns its place here: in the first real play a whole Chat had no @Name: line, every word of hers in quotation marks in the narration.
        checks: [everyReply(parsesAsAReply), everyReply(neverSpeaksAsTheUser), everyReply(speaks(MIRA)), dropsRepeatedPhrases([MIRA, 'Ash'])],
        graded: [],
        gradedChat: [SLOW_BURN],
        gradedReplies: [],
        mostSamples: 2,
    },
];

export const EVAL_SCENES: EvalScene[] = [...TURN_SCENES, ...CHAT_SCENES, ...BACKGROUND_SCENES];
