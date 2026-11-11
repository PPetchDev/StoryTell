/**
 * The four Bond axes (.scratch/bond-axes/spec.md, "The axes and their words"; CONTEXT.md: "Bond").
 * Stored as small integers on each Bond change; the user, the Judge and the Narrator see only the
 * words. Mirrored in the web's lib/bonds.ts.
 */
export const BOND_AXES = ['trust', 'affection', 'desire', 'tension'] as const;
export type BondAxis = (typeof BOND_AXES)[number];

/** One level per axis. A Bond with no levels yet has `null` in their place. */
export type BondLevels = Record<BondAxis, number>;

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

/** True for a whole number within the axis's range. */
export function isBondLevel(axis: BondAxis, value: unknown): value is number {
    const range = BOND_AXIS_RANGE[axis];
    return typeof value === 'number' && Number.isInteger(value) && value >= range.min && value <= range.max;
}

/** A level moved into the axis's range. */
export function clampToRange(axis: BondAxis, level: number): number {
    const range = BOND_AXIS_RANGE[axis];
    return Math.min(range.max, Math.max(range.min, level));
}

/** The word for one level, e.g. `wary` for Trust −1. */
export function bondLevelWord(axis: BondAxis, level: number): string {
    return BOND_LEVEL_WORDS[axis][clampToRange(axis, level) - BOND_AXIS_RANGE[axis].min];
}

/** "Trust: wary · Affection: fond · Desire: drawn · Tension: uneasy". */
export function bondLevelsInWords(levels: BondLevels): string {
    return BOND_AXES.map((axis) => `${BOND_AXIS_NAMES[axis]}: ${bondLevelWord(axis, levels[axis])}`).join(' · ');
}

/** An axis's whole scale with its numbers, for the Judge: "Trust: -3 betrayed, …, 3 trusts completely". */
export function bondAxisScale(axis: BondAxis): string {
    const min = BOND_AXIS_RANGE[axis].min;
    return `${BOND_AXIS_NAMES[axis]}: ${BOND_LEVEL_WORDS[axis].map((word, index) => `${min + index} ${word}`).join(', ')}`;
}

/** The same levels on every axis; two unmeasured Bonds (null) are the same too. */
export function sameBondLevels(a: BondLevels | null, b: BondLevels | null): boolean {
    if (a === null || b === null) return a === b;
    return BOND_AXES.every((axis) => a[axis] === b[axis]);
}
