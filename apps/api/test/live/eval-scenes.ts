import { ReplyLength } from '../../src/model/story/entities/story.entity.js';
import { TurnPromptInput } from '../../src/manager/chat/turn/prompt.js';
import { avoids, CodeCheck, endsCleanly, GradedCheck, lengthIs, mentions, neverSpeaksAsTheUser, noRefusal, parsesAsAReply, speaks } from './eval-checks.js';
import { SMOKE_STORY } from './smoke-story.js';

/**
 * The eval scenes of a prompt eval run (.scratch/prompt-evals/spec.md). Each is a small
 * synthetic Story, a history, the user's turn and its checks, and exists because of one way a
 * reply has gone wrong before. Every scene is synthetic, written for the eval: every person in
 * it is an adult, and nothing comes from the user's Stories.
 *
 * To add one: a new entry here. The run builds its prompt with the app's own turn prompt builder.
 */
export interface EvalScene {
    /** A short name, as typed on the command line. */
    name: string;
    /** The failure it watches for, in one line. */
    about: string;
    input: Omit<TurnPromptInput, 'userText'>;
    userText: string;
    checks: CodeCheck[];
    graded: GradedCheck[];
}

const MIRA = 'Mira Vance';

/** The phrase three earlier replies share, so the turn prompt names it as one not to reuse. */
export const REPEATED_PHRASE = 'her fingers drum a slow rhythm against the counter';

const base: Omit<TurnPromptInput, 'userText'> = { ...SMOKE_STORY, history: [] };

export const EVAL_SCENES: EvalScene[] = [
    {
        name: 'format',
        about: 'Speech is written on @Name: lines the app can read.',
        input: base,
        userText: 'Ash knocks on the bookshop door after closing and waves through the rain-streaked glass.',
        checks: [parsesAsAReply, speaks(MIRA), endsCleanly],
        graded: [],
    },
    {
        name: 'user',
        about: 'The reply never plays the user’s own character.',
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
        name: 'facts',
        about: 'A listed Established fact keeps its number.',
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
        name: 'repeats',
        about: 'A phrase the prompt names as repeated is dropped.',
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
        name: 'voice',
        about: 'A Character sounds like their voice and example lines.',
        input: base,
        userText: 'Ash holds up a paper bag from the bakery and says he brought too much for one person.',
        checks: [speaks(MIRA)],
        graded: [
            {
                name: 'sounds like Mira',
                criterion:
                    'Mira’s spoken lines are short and teasing with dry humour, and at least one of them is a question. She does not give long speeches or speak formally.',
            },
        ],
    },
    {
        name: 'length',
        about: 'A medium reply is medium.',
        input: { ...base, story: { ...SMOKE_STORY.story, replyLength: ReplyLength.Medium } },
        userText: 'Ash shakes the rain off his coat and asks if he can wait out the storm inside.',
        checks: [lengthIs(ReplyLength.Medium), endsCleanly],
        graded: [],
    },
    {
        name: 'adult',
        about: 'An explicit turn between adults is written, not refused.',
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
];
