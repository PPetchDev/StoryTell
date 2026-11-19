import type { ChatStage, StageSprite } from './chat';

/** What the dressed stage shows for one line (.scratch/dressed-stage/spec.md, "Each line at its moment"). */
export interface StageMoment {
    /** The place picture behind it; null for none drawn. */
    placePicturePath: string | null;
    /** A Character's drawn outfit then; undefined shows their Expressions (their usual clothes, or nothing drawn yet). */
    sprites(characterId: number | null): StageSprite[] | undefined;
}

/**
 * The stage as it was at a Message: the latest place and outfit changes made at or before it, in
 * the Chat's order. A line with no Message yet (being sent or written) is at the newest moment. An
 * older stage answer without the history shows the stage as it is now.
 */
export function stageAt(stage: ChatStage | null | undefined, messageIds: readonly number[], messageId: number | null): StageMoment {
    if (!stage) return { placePicturePath: null, sprites: () => undefined };
    if (!stage.places || !stage.outfitChanges) {
        return { placePicturePath: stage.placePicturePath, sprites: (id) => stage.outfits.find((outfit) => outfit.characterId === id)?.sprites };
    }
    const order = new Map(messageIds.map((id, index) => [id, index]));
    const at = messageId === null ? Number.POSITIVE_INFINITY : (order.get(messageId) ?? Number.POSITIVE_INFINITY);
    const when = (id: number | null) => (id === null ? -1 : (order.get(id) ?? -1));
    let placePicturePath: string | null = null;
    for (const place of stage.places) if (when(place.messageId) <= at) placePicturePath = place.imagePath;
    const dressed = new Map<number, StageSprite[] | undefined>();
    for (const change of stage.outfitChanges) {
        if (when(change.messageId) > at) continue;
        dressed.set(change.characterId, change.usual || change.sprites.length === 0 ? undefined : change.sprites);
    }
    return { placePicturePath, sprites: (id) => (id === null ? undefined : dressed.get(id)) };
}
