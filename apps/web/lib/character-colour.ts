/**
 * Character colours (spec: "Character colour"). A fixed palette, each at least 7:1 against
 * the page background and the surface, picked by the Character's position among the Story's
 * Characters, so a Character keeps its colour in every Chat of the Story. Presentation only:
 * nothing is stored.
 */
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

/** The colour of a speaker, given the Story's Character ids in their authored order. */
export function characterColour(characterId: number | null, castIds: readonly number[]): string {
    const position = characterId === null ? -1 : castIds.indexOf(characterId);
    return position < 0 ? NEUTRAL_SPEAKER_COLOUR : CHARACTER_COLOURS[position % CHARACTER_COLOURS.length];
}
