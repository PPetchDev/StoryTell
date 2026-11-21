import { type PortraitCrop, referenceImageUrl } from './story';

// Mirrors apps/api's model/story/emotion.ts and ExpressionDTO (.scratch/expressions/spec.md, "The emotions").

/** The feeling a Character's line carries, as the Judge tags it. `neutral` has no picture: the Portrait is the neutral face. */
export type Emotion = 'neutral' | ExpressionEmotion;

/** The emotions an Expression can be made for, a Character's or yours. */
export type ExpressionEmotion = EverydayEmotion | IntimateEmotion;

/** The last eight are from .scratch/more-faces/spec.md. */
export type EverydayEmotion =
    | 'joy'
    | 'love'
    | 'embarrassment'
    | 'sadness'
    | 'anger'
    | 'fear'
    | 'surprise'
    | 'annoyed'
    | 'thinking'
    | 'smug'
    | 'determined'
    | 'worried'
    | 'hurt'
    | 'tired'
    | 'proud';

/** The emotions of an intimate scene between adults, in the order such a scene goes (.scratch/stage-pictures/spec.md). */
export type IntimateEmotion = 'teasing' | 'desire' | 'flustered' | 'longing' | 'passion' | 'afterglow';

export const EVERYDAY_EMOTIONS: readonly EverydayEmotion[] = [
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
];
export const INTIMATE_EMOTIONS: readonly IntimateEmotion[] = ['teasing', 'desire', 'flustered', 'longing', 'passion', 'afterglow'];

/** Your faces (.scratch/your-faces/spec.md): the same emotions as a Character's. */
export type FaceEmotion = ExpressionEmotion;

/** How a Character's Draw all run on the server is going (.scratch/expression-drawing/spec.md). */
export interface ExpressionDrawing {
    running: boolean;
    /** What it draws, in order; empty when idle. */
    emotions: FaceEmotion[];
    drawn: FaceEmotion[];
    current: FaceEmotion | null;
    /** Why it stopped early. */
    failed: { code: string; message: string } | null;
}

/** In the order the editor and the Character profile list them. */
export const EXPRESSION_EMOTIONS: readonly ExpressionEmotion[] = [...EVERYDAY_EMOTIONS, ...INTIMATE_EMOTIONS];

/**
 * The picture a line shows when the Character has no picture for its emotion, so a Story drawn
 * before these emotions still changes faces: an intimate one shows the nearest everyday one
 * (.scratch/stage-pictures/spec.md), a newer everyday one the nearest older one
 * (.scratch/more-faces/spec.md). Thinking, Determined and Tired have none: the Portrait shows.
 */
export const EVERYDAY_FALLBACK: Partial<Record<ExpressionEmotion, EverydayEmotion>> = {
    annoyed: 'anger',
    smug: 'joy',
    worried: 'fear',
    hurt: 'sadness',
    proud: 'joy',
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
    annoyed: 'Annoyed',
    thinking: 'Thinking',
    smug: 'Smug',
    determined: 'Determined',
    worried: 'Worried',
    hurt: 'Hurt',
    tired: 'Tired',
    proud: 'Proud',
    teasing: 'Teasing',
    desire: 'Desire',
    flustered: 'Flustered',
    longing: 'Longing',
    passion: 'Passion',
    afterglow: 'Afterglow',
};

/** A Character's picture for one emotion (CONTEXT.md: "Expression"). */
export interface Expression {
    emotion: FaceEmotion;
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

/**
 * The URL the stage shows a picture at (.scratch/dressed-stage/spec.md, "Known limits" fixed): a
 * cut-out or a place as the API's 640px WebP, about a tenth of the full PNG, which on a phone is
 * all the stage can show; a whole picture without a cut-out as it is.
 */
export function stageSrc(src: string, small: boolean): string {
    return small ? `${src}${src.includes('?') ? '&' : '?'}w=640` : src;
}

/** The Expression for an emotion; for one without its own picture, the nearest everyday one's where there is one. */
function expressionFor(character: PictureSource, emotion: FaceEmotion): Expression | undefined {
    const own = character.expressions.find((one) => one.emotion === emotion);
    const everyday = EVERYDAY_FALLBACK[emotion];
    if (own || !everyday) return own;
    return character.expressions.find((one) => one.emotion === everyday);
}

/**
 * The dressed stage's picture of a line (.scratch/dressed-stage/spec.md): the sprite of the outfit
 * the Chat has the Character in, for the line's emotion; for an intimate one without it, its nearest
 * everyday one; else the outfit's plain drawing. Null when the Character has no outfit drawn.
 */
export function outfitPicture(
    sprites: readonly { emotion: string; imagePath: string; cutOut: boolean }[] | undefined,
    emotion: Emotion | null | undefined,
): { whole: string; cutout: boolean } | null {
    if (!sprites || sprites.length === 0) return null;
    const find = (wanted: string) => sprites.find((sprite) => sprite.emotion === wanted);
    const wanted = emotion && emotion !== 'neutral' ? emotion : null;
    const sprite =
        (wanted && find(wanted)) || (wanted && EVERYDAY_FALLBACK[wanted] ? find(EVERYDAY_FALLBACK[wanted]!) : undefined) || find('neutral');
    return sprite ? { whole: referenceImageUrl(sprite.imagePath), cutout: sprite.cutOut } : null;
}
