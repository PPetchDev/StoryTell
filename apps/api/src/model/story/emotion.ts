/**
 * The everyday emotions (.scratch/expressions/spec.md, "The emotions"; the last eight from
 * .scratch/more-faces/spec.md), in the order the editor lists them.
 */
export const EVERYDAY_EMOTIONS = [
    'joy',
    'love',
    'embarrassment',
    'sadness',
    'anger',
    'fear',
    'surprise',
    'annoyed',
    'thinking',
    'smug',
    'determined',
    'worried',
    'hurt',
    'tired',
    'proud',
] as const;

/**
 * The emotions of an intimate scene between adults (.scratch/stage-pictures/spec.md), in the order
 * such a scene goes. The Judge gives them only there; in the Chat, a Character without that
 * picture shows the nearest everyday one (apps/web lib/expressions.ts).
 */
export const INTIMATE_EMOTIONS = ['teasing', 'desire', 'flustered', 'longing', 'passion', 'afterglow'] as const;

/** The emotions an Expression can be made for, a Character's or yours, in the order the editor lists them. */
export const EXPRESSION_EMOTIONS = [...EVERYDAY_EMOTIONS, ...INTIMATE_EMOTIONS] as const;
export type ExpressionEmotion = (typeof EXPRESSION_EMOTIONS)[number];

/**
 * The fixed emotions of a line, as stored and as the Judge writes them. `neutral` has no picture:
 * the Portrait is the neutral face.
 */
export const EMOTIONS = ['neutral', ...EXPRESSION_EMOTIONS] as const;
export type Emotion = (typeof EMOTIONS)[number];

/** Your faces (.scratch/your-faces/spec.md): the Role's and a Persona's Expressions, and a Message's face. The same list as a Character's. */
export const FACE_EMOTIONS = EXPRESSION_EMOTIONS;
export type FaceEmotion = ExpressionEmotion;

export function isEmotion(value: unknown): value is Emotion {
    return typeof value === 'string' && (EMOTIONS as readonly string[]).includes(value);
}

export function isExpressionEmotion(value: unknown): value is ExpressionEmotion {
    return typeof value === 'string' && (EXPRESSION_EMOTIONS as readonly string[]).includes(value);
}

export const isFaceEmotion = isExpressionEmotion;
