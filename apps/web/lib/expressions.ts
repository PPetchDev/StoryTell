import { type PortraitCrop, referenceImageUrl } from './story';

// Mirrors apps/api's model/story/emotion.ts and ExpressionDTO (.scratch/expressions/spec.md, "The emotions").

/** The feeling a Character's line carries, as the Judge tags it. `neutral` has no picture: the Portrait is the neutral face. */
export type Emotion = 'neutral' | ExpressionEmotion;

/** The seven emotions an Expression can be made for. */
export type ExpressionEmotion = 'joy' | 'love' | 'embarrassment' | 'sadness' | 'anger' | 'fear' | 'surprise';

/** In the order the editor and the Character profile list them. */
export const EXPRESSION_EMOTIONS: readonly ExpressionEmotion[] = ['joy', 'love', 'embarrassment', 'sadness', 'anger', 'fear', 'surprise'];

export const EMOTION_LABEL: Record<Emotion, string> = {
    neutral: 'Neutral',
    joy: 'Happy',
    love: 'Loving',
    embarrassment: 'Flustered',
    sadness: 'Sad',
    anger: 'Angry',
    fear: 'Scared',
    surprise: 'Surprised',
};

/** A Character's picture for one emotion (CONTEXT.md: "Expression"). */
export interface Expression {
    emotion: ExpressionEmotion;
    /** Relative to the image folder. */
    imagePath: string;
    /** Its own square of its picture; null uses the Portrait's. */
    crop: PortraitCrop | null;
    /** Drawn from a Reference image the Character no longer has. */
    outdated: boolean;
}

/** What a Character's line pictures are made from: a Character as the Story answers it, or anything shaped like one. */
export interface PictureSource {
    referenceImagePath: string | null;
    portraitCrop: PortraitCrop | null;
    expressions: readonly Expression[];
}

/** The round picture beside a line. */
export type RoundPicture =
    | { kind: 'expression'; src: string; crop: PortraitCrop | null }
    | { kind: 'portrait'; src: string; crop: PortraitCrop | null }
    /** The Character's initial on their Character colour. */
    | { kind: 'initial' };

export interface LinePicture {
    round: RoundPicture;
    /** The whole picture, for the Visual novel view; null when there is none. */
    whole: string | null;
}

/**
 * The picture of one speech line (.scratch/expressions/spec.md, "In the Chat"), used by every place
 * that draws one, so they all agree. Round: the Expression for the line's emotion when the
 * Character has one, in its own square or else the Portrait's; else the Portrait; else the
 * initial. Whole: that Expression's full image, else the whole Reference image, else none. A
 * `neutral` or untagged line has the Portrait: the Portrait is the neutral face.
 */
export function linePicture(character: PictureSource | null | undefined, emotion: Emotion | null | undefined): LinePicture {
    if (!character) return { round: { kind: 'initial' }, whole: null };
    const expression = emotion && emotion !== 'neutral' ? character.expressions.find((one) => one.emotion === emotion) : undefined;
    if (expression) {
        const src = referenceImageUrl(expression.imagePath);
        return { round: { kind: 'expression', src, crop: expression.crop ?? character.portraitCrop }, whole: src };
    }
    if (character.referenceImagePath) {
        const src = referenceImageUrl(character.referenceImagePath);
        return { round: { kind: 'portrait', src, crop: character.portraitCrop }, whole: src };
    }
    return { round: { kind: 'initial' }, whole: null };
}
