import { expect, test } from '@playwright/test';

import type { ChatStage } from '../lib/chat';
import { stageAt } from '../lib/stage';

// .scratch/dressed-stage/spec.md, "Each line at its moment": a line shows the place and the clothes
// of its own moment. The web has no unit-test runner, so this runs in Playwright with no page.

const ROBE = [{ emotion: 'neutral', imagePath: 'stage/robe.png', cutOut: true }];
const STAGE: ChatStage = {
    placePicturePath: 'stage/river.jpg',
    outfits: [],
    places: [
        { messageId: 10, imagePath: 'stage/tent.jpg' },
        { messageId: 30, imagePath: 'stage/river.jpg' },
    ],
    outfitChanges: [
        { messageId: 10, characterId: 1, usual: true, sprites: [] },
        { messageId: 20, characterId: 1, usual: false, sprites: ROBE },
        { messageId: 40, characterId: 1, usual: true, sprites: [] },
        { messageId: 20, characterId: 2, usual: false, sprites: [] },
    ],
    drawing: 0,
};
const MESSAGES = [5, 10, 15, 20, 25, 30, 35, 40, 45];

test('a line shows the place and the outfit of its moment, its own clothes as their Expressions', () => {
    expect(stageAt(STAGE, MESSAGES, 5)).toMatchObject({ placePicturePath: null });
    expect(stageAt(STAGE, MESSAGES, 5).sprites(1)).toBeUndefined();
    expect(stageAt(STAGE, MESSAGES, 15).placePicturePath).toBe('stage/tent.jpg');
    expect(stageAt(STAGE, MESSAGES, 15).sprites(1)).toBeUndefined();
    // The robe from the Message that put it on, until she is back in her own clothes.
    expect(stageAt(STAGE, MESSAGES, 20).sprites(1)).toEqual(ROBE);
    expect(stageAt(STAGE, MESSAGES, 35).sprites(1)).toEqual(ROBE);
    expect(stageAt(STAGE, MESSAGES, 35).placePicturePath).toBe('stage/river.jpg');
    expect(stageAt(STAGE, MESSAGES, 45).sprites(1)).toBeUndefined();
    // An outfit with nothing drawn yet shows the Expressions.
    expect(stageAt(STAGE, MESSAGES, 25).sprites(2)).toBeUndefined();
    // A line not stored yet is at the newest moment.
    expect(stageAt(STAGE, MESSAGES, null).placePicturePath).toBe('stage/river.jpg');
});

test('without a stage, nothing; an answer without the history shows the stage as it is now', () => {
    expect(stageAt(null, MESSAGES, 10).placePicturePath).toBeNull();
    const now: ChatStage = { placePicturePath: 'stage/now.jpg', outfits: [{ characterId: 1, sprites: ROBE }], drawing: 0 };
    expect(stageAt(now, MESSAGES, 5).placePicturePath).toBe('stage/now.jpg');
    expect(stageAt(now, MESSAGES, 5).sprites(1)).toEqual(ROBE);
});
