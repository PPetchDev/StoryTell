import { expect, test } from '@playwright/test';

import { linePicture, PictureSource } from '../lib/expressions';

// .scratch/expressions/spec.md, "In the Chat": the one helper every line's picture comes from.
// The web has no unit-test runner, so this runs in Playwright with no page.

const PORTRAIT_CROP = { x: 0.3, y: 0.05, size: 0.4 };
const OWN_CROP = { x: 0.1, y: 0.2, size: 0.5 };

const MIRA: PictureSource = {
    referenceImagePath: 'reference-images/story-1/character-1-a.png',
    portraitCrop: PORTRAIT_CROP,
    expressions: [
        { emotion: 'joy', imagePath: 'expressions/story-1/character-1-joy-b.png', crop: OWN_CROP, outdated: false },
        { emotion: 'sadness', imagePath: 'expressions/story-1/character-1-sadness-c.png', crop: null, outdated: true },
    ],
};

/** No Reference image, one uploaded Expression. */
const KAI: PictureSource = {
    referenceImagePath: null,
    portraitCrop: null,
    expressions: [{ emotion: 'fear', imagePath: 'expressions/story-1/character-2-fear-d.png', crop: null, outdated: false }],
};

/** No picture at all. */
const TAM: PictureSource = { referenceImagePath: null, portraitCrop: null, expressions: [] };

test('a tagged line shows the Expression, with its own square or else the Portrait\'s, and its whole picture', () => {
    expect(linePicture(MIRA, 'joy')).toEqual({
        round: { kind: 'expression', src: '/api/images/expressions/story-1/character-1-joy-b.png', crop: OWN_CROP },
        whole: '/api/images/expressions/story-1/character-1-joy-b.png',
    });
    expect(linePicture(MIRA, 'sadness')).toEqual({
        round: { kind: 'expression', src: '/api/images/expressions/story-1/character-1-sadness-c.png', crop: PORTRAIT_CROP },
        whole: '/api/images/expressions/story-1/character-1-sadness-c.png',
    });
    // Without a Reference image an uploaded Expression still shows, with no square of its own.
    expect(linePicture(KAI, 'fear')).toEqual({
        round: { kind: 'expression', src: '/api/images/expressions/story-1/character-2-fear-d.png', crop: null },
        whole: '/api/images/expressions/story-1/character-2-fear-d.png',
    });
});

test('a neutral, untagged, or Expression-less line shows the Portrait, and the whole Reference image', () => {
    const portrait = {
        round: { kind: 'portrait', src: '/api/images/reference-images/story-1/character-1-a.png', crop: PORTRAIT_CROP },
        whole: '/api/images/reference-images/story-1/character-1-a.png',
    };
    expect(linePicture(MIRA, 'neutral')).toEqual(portrait);
    expect(linePicture(MIRA, null)).toEqual(portrait);
    expect(linePicture(MIRA, undefined)).toEqual(portrait);
    expect(linePicture(MIRA, 'anger')).toEqual(portrait);
});

test('a Character with no picture for the line shows their initial, and no whole picture', () => {
    for (const emotion of ['joy', 'neutral', null] as const) {
        expect(linePicture(TAM, emotion)).toEqual({ round: { kind: 'initial' }, whole: null });
    }
    expect(linePicture(KAI, 'joy')).toEqual({ round: { kind: 'initial' }, whole: null });
    expect(linePicture(KAI, null)).toEqual({ round: { kind: 'initial' }, whole: null });
    // A speaker who is not in the cast.
    expect(linePicture(undefined, 'joy')).toEqual({ round: { kind: 'initial' }, whole: null });
});
