// Mirrors apps/api's model/ledger/bond-axes.ts (.scratch/bond-axes/spec.md, "The axes and their words").
// The user only ever sees a level as its word, never as a number.

export type BondAxis = 'trust' | 'affection' | 'desire' | 'tension';

/** One level per axis. A Bond with no levels yet has `null` in their place. */
export type BondLevels = Record<BondAxis, number>;

export const BOND_AXES: readonly BondAxis[] = ['trust', 'affection', 'desire', 'tension'];

export const BOND_AXIS_NAMES: Record<BondAxis, string> = {
    trust: 'Trust',
    affection: 'Affection',
    desire: 'Desire',
    tension: 'Tension',
};

/** The lowest and highest level of each axis. */
export const BOND_AXIS_RANGE: Record<BondAxis, { min: number; max: number }> = {
    trust: { min: -3, max: 3 },
    affection: { min: -3, max: 3 },
    desire: { min: -3, max: 3 },
    tension: { min: 0, max: 3 },
};

/** Each axis's words, lowest level first. */
export const BOND_LEVEL_WORDS: Record<BondAxis, readonly string[]> = {
    trust: ['betrayed', 'suspicious', 'wary', 'unsure', 'inclined to trust', 'trusts', 'trusts completely'],
    affection: ['hates', 'dislikes', 'cool', 'indifferent', 'fond', 'close', 'devoted'],
    desire: ['repelled', 'put off', 'uninterested', 'no pull', 'drawn', 'wants', 'aches for'],
    tension: ['at ease', 'uneasy', 'strained', 'at breaking point'],
};

/** The word for one level, e.g. `wary` for Trust −1. */
export function bondLevelWord(axis: BondAxis, level: number): string {
    const { min, max } = BOND_AXIS_RANGE[axis];
    return BOND_LEVEL_WORDS[axis][Math.min(max, Math.max(min, level)) - min];
}

/** Every level of an axis, lowest first: what a picker offers, each shown only as its word. */
export function bondAxisLevels(axis: BondAxis): number[] {
    const { min, max } = BOND_AXIS_RANGE[axis];
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

/** Each axis's colour, as a theme token (globals.css), on the Bond chart and the Memory graph. */
export const BOND_AXIS_COLOURS: Record<BondAxis, string> = {
    trust: 'var(--bond-trust)',
    affection: 'var(--bond-affection)',
    desire: 'var(--bond-desire)',
    tension: 'var(--bond-tension)',
};

/** A Bond with no axis standing out, or with no levels yet. */
export const BOND_NEUTRAL_COLOUR = 'var(--bond-neutral)';

/** "Nara toward you, Trust at least trusts": a Bond gate in words (mirrors the API's bondGateInWords). */
export function bondGateInWords(fromName: string, towardName: string, axis: BondAxis, atLeast: number): string {
    return `${fromName} toward ${towardName}, ${BOND_AXIS_NAMES[axis]} at least ${bondLevelWord(axis, atLeast)}`;
}

/** "Trust: wary · Affection: fond · Desire: drawn · Tension: uneasy" (mirrors the API's bondLevelsInWords). */
export function bondLevelsInWords(levels: BondLevels): string {
    return BOND_AXES.map((axis) => `${BOND_AXIS_NAMES[axis]}: ${bondLevelWord(axis, levels[axis])}`).join(' · ');
}

/** How a Bond's line in the Memory graph looks: the colour of its strongest axis, or grey. */
export interface BondLineLook {
    /** Its strongest axis; null when none stands out, or it has no levels. */
    axis: BondAxis | null;
    colour: string;
    /** Dashed while the Bond has no levels yet. */
    dashed: boolean;
}

/**
 * The strongest axis (.scratch/bond-axes/spec.md, "The Memory graph"): the one furthest from 0.
 * Tension counts only at strained (2) or more, and wins a tie; among the other three, a tie goes
 * to the first of Trust, Affection, Desire. An all-middle Bond is grey; one with no levels, dashed grey.
 */
export function bondLine(levels: BondLevels | null): BondLineLook {
    if (levels === null) return { axis: null, colour: BOND_NEUTRAL_COLOUR, dashed: true };
    const distance = (axis: BondAxis) => (axis === 'tension' ? (levels.tension >= 2 ? levels.tension : 0) : Math.abs(levels[axis]));
    let strongest: BondAxis | null = null;
    for (const axis of ['tension', 'trust', 'affection', 'desire'] as const) {
        if (distance(axis) > (strongest === null ? 0 : distance(strongest))) strongest = axis;
    }
    return { axis: strongest, colour: strongest === null ? BOND_NEUTRAL_COLOUR : BOND_AXIS_COLOURS[strongest], dashed: false };
}
