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
