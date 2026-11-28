/**
 * The decision models a Scene's move-on is asked of (.scratch/scene-decisions/spec.md, "Build"), in
 * the order they are tried, each with the question shape and threshold the eval chose for it. Both
 * are on NanoGPT's subscription and take Zero Data Retention.
 */

/** What a decision model answers per question: a `noul`'s probability, or a `choice`'s per option. */
export type DecisionAnswers = Record<string, { noul?: number; probabilities?: Record<string, number> } | undefined>;

export interface DecisionModelSpec {
    /** The app's name, as usage records carry it. */
    name: string;
    /** NanoGPT's id. */
    id: string;
    questions: Record<string, unknown>;
    /** The probability that the condition has happened, from the answers; NaN when it is not there. */
    probability(answers: DecisionAnswers): number;
    /** Met at or above this. */
    threshold: number;
}

export const SCENE_DECISION_MODELS: DecisionModelSpec[] = [
    // Tuned on the 12 bookshop cases, then 100/100 on 20 blind ones with no wrong answer past 0.06 or
    // right one below 0.97; on real Chats it caught the Judge's early and late moves.
    {
        name: 'pplx-decider-v1.2',
        id: 'perplexity/pplx-decider-v1.2',
        questions: {
            status: {
                type: 'choice',
                instructions: "Where does the Scene's move-on condition stand at the end of the latest exchange?",
                criteria: {
                    happened: 'The whole condition has actually happened in the story, done by the person it names, in any words, now or earlier.',
                    partly: 'Only part of the condition has happened.',
                    not_really: 'Something like it was promised, planned, rehearsed, imagined, joked about, refused, interrupted, or done by someone other than the one the condition names.',
                    not_yet: 'Nothing like it has happened.',
                },
            },
        },
        probability: (answers) => answers.status?.probabilities?.happened ?? NaN,
        threshold: 0.55,
    },
    // The backup: 100/100 on the blind cases at 0.7, its closest calls 0.73 and 0.33.
    {
        name: 'jev-1.14',
        id: 'typesafe/jev-1.14',
        questions: {
            met: {
                type: 'noul',
                instructions: "Has this Scene's move-on condition happened in the story by the end of the latest exchange?",
                criteria: { true: 'It has happened.', false: 'It has not happened.' },
            },
        },
        probability: (answers) => answers.met?.noul ?? NaN,
        threshold: 0.7,
    },
];
