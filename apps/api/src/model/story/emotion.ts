/**
 * The fixed emotions of Expressions (.scratch/expressions/spec.md, "The emotions"), as stored and
 * as the Judge writes them. `neutral` has no picture: the Portrait is the neutral face.
 */
export const EMOTIONS = ['neutral', 'joy', 'love', 'embarrassment', 'sadness', 'anger', 'fear', 'surprise'] as const;
export type Emotion = (typeof EMOTIONS)[number];

/** The seven emotions an Expression can be made for, in the order the editor lists them. */
export const EXPRESSION_EMOTIONS = ['joy', 'love', 'embarrassment', 'sadness', 'anger', 'fear', 'surprise'] as const;
export type ExpressionEmotion = (typeof EXPRESSION_EMOTIONS)[number];

export function isEmotion(value: unknown): value is Emotion {
    return typeof value === 'string' && (EMOTIONS as readonly string[]).includes(value);
}

export function isExpressionEmotion(value: unknown): value is ExpressionEmotion {
    return typeof value === 'string' && (EXPRESSION_EMOTIONS as readonly string[]).includes(value);
}
