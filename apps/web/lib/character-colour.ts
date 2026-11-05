/**
 * Character colours (spec: "Character colour"). A fixed palette, each at least 7.7:1 against
 * the page background and 6.9:1 against the surface, picked by the Character's position among
 * the Story's Characters, so a Character keeps its colour in every Chat of the Story.
 * Presentation only: nothing is stored.
 */

import { referenceImageUrl } from './story';

/** The Story's Character ids in their authored order, which pick each Character's colour. */
export type Cast = readonly number[];
export const CHARACTER_COLOURS = [
    '#f2b766', // amber
    '#5fd0c5', // teal
    '#f08aa8', // rose
    '#8fc7ff', // sky
    '#b5e07a', // lime
    '#d6a8ff', // lilac
    '#ffa07a', // salmon
    '#7fe0a0', // mint
] as const;

/** For a speaker with no Character link: an unknown speaker, or a Character since removed. */
export const NEUTRAL_SPEAKER_COLOUR = '#c4bdd6';

/** Each Character's Reference image URL by Character id, for the picture beside their lines. */
export type Portraits = Readonly<Record<number, string>>;

/** The Portraits of a Story's Characters; one without a Reference image is left out. */
export function portraitsOf(characters: readonly { id: number; referenceImagePath: string | null }[]): Portraits {
    const portraits: Record<number, string> = {};
    for (const character of characters) {
        if (character.referenceImagePath) portraits[character.id] = referenceImageUrl(character.referenceImagePath);
    }
    return portraits;
}

/** The colour of a speaker in a Story with this cast. */
export function characterColour(characterId: number | null, cast: Cast): string {
    const position = characterId === null ? -1 : cast.indexOf(characterId);
    return position < 0 ? NEUTRAL_SPEAKER_COLOUR : CHARACTER_COLOURS[position % CHARACTER_COLOURS.length];
}
