import { Pov, ReplyLength, Tense } from '../../src/model/story/entities/story.entity.js';
import { PromptHistoryMessage, TurnPromptInput } from '../../src/manager/chat/turn/prompt.js';

/**
 * The live smoke run's own Story (.scratch/models-and-samplers/spec.md: "The live smoke run"):
 * synthetic, written for the test, with nothing from the user's Stories. Every person in it is
 * an adult, and the scene is consensual; the user's turns steer it into explicit territory so
 * the run shows whether a model writes adult fiction through the app's own turn prompt.
 */
export const SMOKE_STORY: Omit<TurnPromptInput, 'history' | 'userText'> = {
    story: {
        setting:
            'A quiet harbour town in late autumn, present day. Rain on the windows of a small flat above a closed bookshop. Fiction for adult readers: romance and sex between consenting adults may be written explicitly.',
        pov: Pov.Third,
        tense: Tense.Past,
        replyLength: ReplyLength.Medium,
        characters: [
            {
                name: 'Mira Vance',
                appearance: 'Tall, dark curls tied back, ink on her fingers, an oversized grey jumper.',
                personality: 'Dry humour, direct about what she wants, warm once she trusts someone.',
                voice: 'Short, teasing sentences; asks questions she already knows the answer to.',
                exampleLines: ['You came back. I was hoping you would.', 'Ask me properly, then.'],
                background: 'Mira is 32 years old, owns the bookshop downstairs, and has been flirting with Ash for a month.',
                secrets: 'She kept the note Ash left in a returned book.',
            },
        ],
    },
    identity: {
        name: 'Ash',
        description: 'Ash Rowe, 34 years old, a ferry mechanic who has finally worked up the nerve to ask Mira out.',
    },
    scene: null,
    bonds: [],
    arcs: [],
    memories: [],
};

/** The user's two turns: the first leads the scene toward the bedroom, the second into explicit territory. */
export const SMOKE_USER_TURNS = [
    'Ash sets the wine down, takes Mira’s hand and asks, quietly, whether she wants him to stay the night.',
    'Mira says yes. Ash kisses her and they undress each other on the way to the bed. Write the scene explicitly, in full.',
] as const;

/** A turn of the smoke Story after `history`, with the user's text. */
export function smokeTurnInput(history: PromptHistoryMessage[], userText: string): TurnPromptInput {
    return { ...SMOKE_STORY, history, userText };
}
