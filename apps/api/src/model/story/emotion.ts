/**
 * The fixed emotions of Expressions (.scratch/expressions/spec.md, "The emotions"), as stored and
 * as the Judge writes them. `neutral` has no picture: the Portrait is the neutral face.
 */
export const EMOTIONS = [
    'neutral',
    'joy',
    'love',
    'embarrassment',
    'sadness',
    'anger',
    'fear',
    'surprise',
    'teasing',
    'desire',
    'flustered',
    'longing',
    'passion',
    'afterglow',
] as const;
export type Emotion = (typeof EMOTIONS)[number];

/** The thirteen emotions an Expression can be made for, in the order the editor lists them. */
export const EXPRESSION_EMOTIONS = ['joy', 'love', 'embarrassment', 'sadness', 'anger', 'fear', 'surprise', 'teasing', 'desire', 'flustered', 'longing', 'passion', 'afterglow'] as const;
export type ExpressionEmotion = (typeof EXPRESSION_EMOTIONS)[number];

/**
 * The emotions of an intimate scene between adults (.scratch/stage-pictures/spec.md), in the order
 * such a scene goes. The Judge gives them only there; in the Chat, a Character without that
 * picture shows the nearest everyday one (apps/web lib/expressions.ts).
 */
export const INTIMATE_EMOTIONS = ['teasing', 'desire', 'flustered', 'longing', 'passion', 'afterglow'] as const;

export function isEmotion(value: unknown): value is Emotion {
    return typeof value === 'string' && (EMOTIONS as readonly string[]).includes(value);
}

export function isExpressionEmotion(value: unknown): value is ExpressionEmotion {
    return typeof value === 'string' && (EXPRESSION_EMOTIONS as readonly string[]).includes(value);
}
