/**
 * Character colours (spec: "Character colour"). A fixed palette per theme, each at least 4.5:1 against
 * the page background and the surface in its theme, picked by the Character's position among
 * the Story's Characters, so a Character keeps its colour in every Chat of the Story.
 * Presentation only: nothing is stored.
 */

import { PortraitCrop, referenceImageUrl } from './story';

/** The Story's Character ids in their authored order, which pick each Character's colour. */
export type Cast = readonly number[];
/**
 * The palette as tokens (globals.css: --character-1 … --character-8), so CSS and SVG both follow the
 * theme. Something that needs the colour's value (a canvas) reads it with resolvedColour.
 */
export const CHARACTER_COLOURS = [
    'var(--character-1)', // amber
    'var(--character-2)', // teal
    'var(--character-3)', // rose
    'var(--character-4)', // sky
    'var(--character-5)', // lime
    'var(--character-6)', // lilac
    'var(--character-7)', // salmon
    'var(--character-8)', // mint
] as const;

/** For a speaker with no Character link: an unknown speaker, or a Character since removed. */
export const NEUTRAL_SPEAKER_COLOUR = 'var(--character-neutral)';

/** The colour of an initial drawn on a Character colour. */
export const ON_CHARACTER_COLOUR = 'var(--on-character)';

/** A colour such as 'var(--character-2)' as the browser computes it now, for a canvas. */
export function resolvedColour(colour: string): string {
    const probe = document.createElement('span');
    probe.style.color = colour;
    probe.style.display = 'none';
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
}

/** What shows beside a Character's lines: their Reference image and the square of it they chose. */
export interface Portrait {
    src: string;
    crop: PortraitCrop | null;
}

/** Each Character's Portrait by Character id. */
export type Portraits = Readonly<Record<number, Portrait>>;

/** The Portraits of a Story's Characters; one without a Reference image is left out. */
export function portraitsOf(
    characters: readonly { id: number; referenceImagePath: string | null; portraitCrop: PortraitCrop | null }[],
): Portraits {
    const portraits: Record<number, Portrait> = {};
    for (const character of characters) {
        if (character.referenceImagePath) {
            portraits[character.id] = { src: referenceImageUrl(character.referenceImagePath), crop: character.portraitCrop };
        }
    }
    return portraits;
}

/** The colour of a speaker in a Story with this cast. */
export function characterColour(characterId: number | null, cast: Cast): string {
    const position = characterId === null ? -1 : cast.indexOf(characterId);
    return position < 0 ? NEUTRAL_SPEAKER_COLOUR : CHARACTER_COLOURS[position % CHARACTER_COLOURS.length];
}
