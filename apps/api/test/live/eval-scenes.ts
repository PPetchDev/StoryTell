import { ReplyLength } from '../../src/model/story/entities/story.entity.js';
import type { buildJudgePrompt, parseJudgement } from '../../src/manager/chat/judge/judge-prompt.js';
import type { Extraction, ExtractionPromptInput } from '../../src/manager/chat/memory/memory-prompt.js';
import { PromptCharacter, PromptHistoryMessage, TurnPromptInput } from '../../src/manager/chat/turn/prompt.js';
import { BACKGROUND_SCENES } from './eval-background-scenes.js';
import {
    avoids,
    Check,
    CodeCheck,
    endsCleanly,
    GradedCheck,
    lengthIs,
    mentions,
    neverSpeaksAsTheUser,
    noRefusal,
    parsesAsAReply,
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

export type EvalScene = TurnScene | JudgeScene | MemoryScene;

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

const SOUNDS_LIKE_MIRA: GradedCheck = {
    name: 'sounds like Mira',
    criterion: 'Mira’s spoken lines are short and teasing with dry humour, and at least one of them is a question. She does not give long speeches or speak formally.',
    speechOf: MIRA,
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
        expects: ['Reply length: 150–350 words'],
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
                criterion: 'Tobias Hale says nothing and does nothing in the reply, and is not in the room. Someone else mentioning him is allowed.',
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

export const EVAL_SCENES: EvalScene[] = [...TURN_SCENES, ...BACKGROUND_SCENES];
