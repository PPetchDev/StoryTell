import { type PortraitCrop, referenceImageUrl } from './story';

// Mirrors apps/api's model/story/emotion.ts and ExpressionDTO (.scratch/expressions/spec.md, "The emotions").

/** The feeling a Character's line carries, as the Judge tags it. `neutral` has no picture: the Portrait is the neutral face. */
export type Emotion = 'neutral' | ExpressionEmotion;

/** The thirteen emotions an Expression can be made for. */
export type ExpressionEmotion = EverydayEmotion | IntimateEmotion;

export type EverydayEmotion = 'joy' | 'love' | 'embarrassment' | 'sadness' | 'anger' | 'fear' | 'surprise';

/** The emotions of an intimate scene between adults, in the order such a scene goes (.scratch/stage-pictures/spec.md). */
export type IntimateEmotion = 'teasing' | 'desire' | 'flustered' | 'longing' | 'passion' | 'afterglow';

export const EVERYDAY_EMOTIONS: readonly EverydayEmotion[] = ['joy', 'love', 'embarrassment', 'sadness', 'anger', 'fear', 'surprise'];
export const INTIMATE_EMOTIONS: readonly IntimateEmotion[] = ['teasing', 'desire', 'flustered', 'longing', 'passion', 'afterglow'];

/** In the order the editor and the Character profile list them. */
export const EXPRESSION_EMOTIONS: readonly ExpressionEmotion[] = [...EVERYDAY_EMOTIONS, ...INTIMATE_EMOTIONS];

/**
 * The everyday picture an intimate line shows when the Character has no picture for its emotion,
 * so a Story drawn before these emotions still changes faces in such a scene.
 */
export const EVERYDAY_FALLBACK: Record<IntimateEmotion, EverydayEmotion> = {
    teasing: 'joy',
    desire: 'love',
    flustered: 'embarrassment',
    longing: 'love',
    passion: 'love',
    afterglow: 'joy',
};

export const EMOTION_LABEL: Record<Emotion, string> = {
    neutral: 'Neutral',
    joy: 'Happy',
    love: 'Loving',
    embarrassment: 'Embarrassed',
    sadness: 'Sad',
    anger: 'Angry',
    fear: 'Scared',
    surprise: 'Surprised',
    teasing: 'Teasing',
    desire: 'Desire',
    flustered: 'Flustered',
    longing: 'Longing',
    passion: 'Passion',
    afterglow: 'Afterglow',
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
    /** The picture with its background taken away, for the Visual novel stage; null until cut out. */
    cutoutPath: string | null;
}

/** What a Character's line pictures are made from: a Character as the Story answers it, or anything shaped like one. */
export interface PictureSource {
    referenceImagePath: string | null;
    /** The Reference image with its background taken away; null (or left out) when there is none. */
    referenceCutoutPath?: string | null;
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
    /** True when `whole` is a cut-out: the figure alone, to stand on the stage's Backdrop. */
    cutout: boolean;
}

/**
 * The picture of one speech line (.scratch/expressions/spec.md, "In the Chat"), used by every place
 * that draws one, so they all agree. Round: the Expression for the line's emotion when the
 * Character has one, in its own square or else the Portrait's; else the Portrait; else the
 * initial. Whole: that Expression's full image, else the whole Reference image, else none. A
 * `neutral` or untagged line has the Portrait: the Portrait is the neutral face.
 */
export function linePicture(character: PictureSource | null | undefined, emotion: Emotion | null | undefined): LinePicture {
    if (!character) return { round: { kind: 'initial' }, whole: null, cutout: false };
    const expression = emotion && emotion !== 'neutral' ? expressionFor(character, emotion) : undefined;
    if (expression) {
        const src = referenceImageUrl(expression.imagePath);
        const round: RoundPicture = { kind: 'expression', src, crop: expression.crop ?? character.portraitCrop };
        return expression.cutoutPath ? { round, whole: referenceImageUrl(expression.cutoutPath), cutout: true } : { round, whole: src, cutout: false };
    }
    if (character.referenceImagePath) {
        const src = referenceImageUrl(character.referenceImagePath);
        const round: RoundPicture = { kind: 'portrait', src, crop: character.portraitCrop };
        return character.referenceCutoutPath ? { round, whole: referenceImageUrl(character.referenceCutoutPath), cutout: true } : { round, whole: src, cutout: false };
    }
    return { round: { kind: 'initial' }, whole: null, cutout: false };
}

/** The Expression for an emotion; for an intimate one without its own picture, the nearest everyday one's. */
function expressionFor(character: PictureSource, emotion: ExpressionEmotion): Expression | undefined {
    const own = character.expressions.find((one) => one.emotion === emotion);
    if (own || !(emotion in EVERYDAY_FALLBACK)) return own;
    const everyday = EVERYDAY_FALLBACK[emotion as IntimateEmotion];
    return character.expressions.find((one) => one.emotion === everyday);
}
