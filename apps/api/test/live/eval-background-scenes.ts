import { judgeFactsSection } from '../../src/manager/chat/details/facts.js';
import { ExtractedOperation, ExtractionPromptInput } from '../../src/manager/chat/memory/memory-prompt.js';
import { judgeSecretsSection } from '../../src/manager/chat/secrets/secrets.js';
import type { EvalScene, JudgeInput } from './eval-scenes.js';

/**
 * The eval scenes of the background model (.scratch/prompt-evals/spec.md, "Upgrades"): the Judge
 * and Memory extraction. Each holds the prompt's own input, is built with the app's own prompt
 * builder and read with the app's own parser, and its checks read what the parser gave. Synthetic
 * like the turn scenes: the same bookshop, every person an adult, nothing from the user's Stories.
 */

const MIRA = 'Mira Vance';
const LABEL = 'curious warmth';

const judgeBase: JudgeInput = {
    cast: [{ name: MIRA, personality: 'Dry humour, direct about what she wants, warm once she trusts someone.', arcDirection: '' }],
    identityName: 'Ash',
    bonds: [
        {
            fromName: MIRA,
            toName: null,
            label: LABEL,
            description: 'She likes Ash and is waiting to see whether he will ask.',
            levels: { trust: 1, affection: 1, desire: 1, tension: 0 },
        },
    ],
    arcs: [{ name: MIRA, steps: [] }],
    scene: null,
    timeOfDay: 'evening',
    recent: ['Ash: Ash knocks on the bookshop door after closing.', `Mira let him in and locked the door behind him.\n\n@${MIRA}: You came back. I was hoping you would.`],
    userText: null,
    aiText: '',
    // Sent with every judgement on live, so the scenes read the reply shape the app's Judge reads.
    factsSection: judgeFactsSection([]),
};

/** The Scene both Scene-rule scenes are in: its condition names who must act, and what they must do. */
const ASKING_OUT = {
    name: 'After closing',
    situation: 'Ash has come to the bookshop after closing, meaning to ask Mira out.',
    moveOnCondition: 'The user asks Mira out to dinner',
};

const added = (operations: ExtractedOperation[]) => operations.filter((operation): operation is Extract<ExtractedOperation, { op: 'add' }> => operation.op === 'add');

const memoryBase: ExtractionPromptInput = {
    cast: [MIRA, 'Tobias Hale'],
    identityName: 'Ash',
    present: [MIRA],
    memories: [{ id: 1, text: '{user} left a note for Mira Vance in a book he returned.', knownBy: [MIRA], locked: false }],
    beliefs: [],
    userText: null,
    aiText: '',
};

export const BACKGROUND_SCENES: EvalScene[] = [
    {
        kind: 'judge',
        name: 'judge-waits',
        about: 'A Scene’s condition that was only promised is not met.',
        expects: [`Move-on condition: ${ASKING_OUT.moveOnCondition}`, 'Not met: getting closer'],
        input: {
            ...judgeBase,
            scene: ASKING_OUT,
            userText: 'Ash turns a book over in his hands and says there is something he means to ask her, but not tonight. Tomorrow, maybe.',
            aiText: `Mira took the book from him and set it back on the shelf.\n\n@${MIRA}: Tomorrow, then. I will try to look surprised.`,
        },
        checks: [
            {
                name: 'does not move on',
                run: (judgement) => ({ pass: !judgement.scenes.some((scene) => scene.moveOn), reason: judgement.scenes.map((scene) => scene.reason).join(' ') || 'no Scene answer' }),
            },
        ],
    },
    {
        kind: 'judge',
        name: 'judge-moves',
        about: 'A Scene’s condition that has happened is met.',
        expects: [`Move-on condition: ${ASKING_OUT.moveOnCondition}`],
        input: {
            ...judgeBase,
            scene: ASKING_OUT,
            userText: 'Ash puts the book down, looks at Mira and asks her to have dinner with him on Friday.',
            aiText: `Mira did not make him wait for it.\n\n@${MIRA}: Friday. Yes. I thought you would never ask.`,
        },
        checks: [
            {
                name: 'moves on',
                run: (judgement) => ({ pass: judgement.scenes.some((scene) => scene.moveOn), reason: judgement.scenes.map((scene) => scene.reason).join(' ') || 'no Scene answer' }),
            },
        ],
    },
    {
        kind: 'judge',
        name: 'judge-quiet',
        about: 'Small talk changes no Bond’s label and adds no Arc step.',
        expects: [`"${LABEL}"`, 'Expect NO change on most turns'],
        input: {
            ...judgeBase,
            userText: 'Ash says the rain is heavier than yesterday and asks if she has any tea.',
            aiText: `Mira filled the kettle and found two cups that nearly matched.\n\n@${MIRA}: It always is, this time of year. Milk?`,
        },
        checks: [
            { name: 'no Arc step', run: (judgement) => ({ pass: judgement.arcSteps.length === 0, reason: judgement.arcSteps.map((step) => step.step).join('; ') || 'none' }) },
            {
                name: 'keeps the Bond’s label',
                run: (judgement) => {
                    const renamed = judgement.bondChanges.filter((change) => change.label.toLowerCase() !== LABEL);
                    return { pass: renamed.length === 0, reason: renamed.map((change) => `"${change.label}"`).join(', ') || 'kept' };
                },
            },
        ],
    },
    {
        kind: 'judge',
        name: 'judge-facts',
        about: 'A number a reply states comes back as a fact.',
        expects: ['# Established facts', 'Facts rule:'],
        input: {
            ...judgeBase,
            userText: 'Ash runs a hand along the shelves and asks Mira how long she has had the shop.',
            aiText: `Mira did not have to count.\n\n@${MIRA}: Nine years in March. My aunt left it to me, books and debts together.`,
        },
        checks: [
            {
                name: 'gives the nine years',
                run: (judgement) => {
                    const facts = judgement.facts?.facts ?? [];
                    return { pass: facts.some((entry) => /\bnine\b|\b9\b/i.test(entry.fact)), reason: facts.map((entry) => `${entry.topic}: ${entry.fact}`).join('; ') || 'no facts' };
                },
            },
        ],
    },
    {
        kind: 'judge',
        name: 'judge-secret',
        about: 'A Secret only hinted at is not revealed.',
        expects: ['# Secrets that may come out', 'A hint, a hesitation'],
        input: {
            ...judgeBase,
            secretsShape: true,
            secretsSection: judgeSecretsSection([
                { id: 1, characterId: 1, characterName: MIRA, text: 'Mira is leaving for Lisbon in the spring; the ticket is already bought.', axis: 'trust', atLeast: 1 },
            ]),
            userText: 'Ash asks Mira what she will be doing come spring.',
            aiText: `Mira straightened a shelf that did not need it.\n\n@${MIRA}: Ask me again in spring. Things may look different by then.`,
        },
        checks: [
            {
                name: 'reveals nothing',
                run: (judgement) => ({ pass: (judgement.secretsRevealed ?? []).length === 0, reason: `revealed: ${(judgement.secretsRevealed ?? []).join(', ') || 'none'}` }),
            },
        ],
    },
    {
        kind: 'memory',
        name: 'memory-quiet',
        about: 'Small talk adds no Memory.',
        expects: ['# LATEST EXCHANGE (extract from this)', 'Expect nothing to change on many turns'],
        input: {
            ...memoryBase,
            userText: 'Ash says the rain is heavier than yesterday.',
            aiText: `Mira glanced at the window.\n\n@${MIRA}: It always is, this time of year.`,
        },
        checks: [
            {
                name: 'adds nothing',
                run: ({ operations }) => ({ pass: added(operations).length === 0, reason: added(operations).map((operation) => operation.text).join(' | ') || 'none' }),
            },
        ],
    },
    {
        kind: 'memory',
        name: 'memory-promise',
        about: 'A promise becomes a Memory, written with {user} and known only by those present.',
        expects: ['write {user} wherever a Memory refers to them', 'an open promise or plan'],
        input: {
            ...memoryBase,
            userText: 'Ash promises to come by on Sunday morning and fix the shop door that sticks.',
            aiText: `Mira tried the door, which stuck, as if to make his point for him.\n\n@${MIRA}: Sunday, then. Bring your own tools. Mine are for show.`,
        },
        checks: [
            {
                name: 'adds the promise',
                run: ({ operations }) => {
                    const promise = added(operations).find((operation) => /sunday|door/i.test(operation.text));
                    return { pass: promise !== undefined, reason: promise?.text ?? `${added(operations).length} Memories added, none about Sunday or the door` };
                },
            },
            {
                name: 'writes {user}, never the name',
                run: ({ operations }) => {
                    const texts = added(operations).map((operation) => operation.text);
                    const named = texts.find((text) => /\bAsh\b/.test(text));
                    if (named) return { pass: false, reason: `wrote the name: ${named}` };
                    return { pass: texts.some((text) => text.includes('{user}')), reason: texts.join(' | ') || 'nothing added' };
                },
            },
            {
                name: 'known only by those present',
                run: ({ operations }) => {
                    const others = added(operations).flatMap((operation) => operation.knownBy.filter((name) => name !== MIRA));
                    return { pass: others.length === 0, reason: others.length > 0 ? `also known by ${[...new Set(others)].join(', ')}` : 'only Mira Vance' };
                },
            },
        ],
    },
];
