/** How many candidates one round makes (spec: "One request returns 3 candidates"; 4 until the user cut image cost, 2026-11-12). */
export const CANDIDATE_COUNT = 3;

/** Used when the Story's Image style is empty, so the candidates still share one look. */
export const DEFAULT_IMAGE_STYLE = 'realistic, natural lighting';

/**
 * The prompt of every candidate in a round (spec: "Reference image"): one adult Character,
 * full-body, neutral pose, plain background, in the Story's Image style. The Appearance is
 * restated in full, as ticket 18 found that traits left out of the prompt drift.
 */
export function referenceImagePrompt(character: { name: string; appearance: string }, imageStyle: string): string {
    const name = character.name.trim();
    const who = name === '' ? 'a single adult character' : `a single adult character, ${name}`;
    const style = imageStyle.trim() === '' ? DEFAULT_IMAGE_STYLE : imageStyle.trim();
    return [
        `Full-body reference portrait of ${who}: standing in a neutral, relaxed pose, facing the viewer, ` +
            'the whole body visible from head to feet, arms at the sides, on a plain, flat, single-colour ' +
            'background with nothing else in frame. No text, no watermark, no other people.',
        `Art style: ${style}.`,
        `Appearance, every trait of which must be shown exactly as written: ${character.appearance.trim()}`,
    ].join('\n');
}
