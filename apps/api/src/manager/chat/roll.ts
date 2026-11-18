import { Difficulty } from '../../model/story/entities/story.entity.js';

/**
 * Rolls (.scratch/roll/spec.md): the d20 the app throws for one User Message, to decide whether
 * what the user attempts in it works. Pure logic: the number to reach, the outcome, and what the
 * Narrator is told. A Roll made for one of the Role's Stats adds it (.scratch/judge-rolls/spec.md).
 */

export const ROLL_SIDES = 20;

/** The number a Roll must reach, from the Story's Difficulty: 65%, 50% and 35% of Rolls succeed. */
export const ROLL_TARGETS: Record<Difficulty, number> = {
    [Difficulty.Easy]: 8,
    [Difficulty.Normal]: 11,
    [Difficulty.Hard]: 14,
};

export type RollOutcome = 'critical_success' | 'success' | 'failure' | 'critical_failure';

/** The Stat a Roll was made for, as the Role named it then, and the number it adds. */
export interface RollStat {
    name: string;
    bonus: number;
}

export interface Roll {
    /** What the d20 showed, 1 to 20. */
    value: number;
    /** The number it had to reach. */
    target: number;
    /** The Stat added to the throw (.scratch/judge-rolls/spec.md); null or left out without one. */
    stat?: RollStat | null;
}

export interface RollResponse extends Roll {
    outcome: RollOutcome;
}

/**
 * A natural 20 and a natural 1 are critical whatever the number to reach and the Stat; otherwise
 * the throw plus the Stat must reach it.
 */
export function rollOutcome(roll: Roll): RollOutcome {
    if (roll.value >= ROLL_SIDES) return 'critical_success';
    if (roll.value <= 1) return 'critical_failure';
    return roll.value + (roll.stat?.bonus ?? 0) >= roll.target ? 'success' : 'failure';
}

/** "14" without a Stat, "9 + 2 for Strength = 11" with one. */
function thrown(roll: Roll): string {
    if (!roll.stat) return `${roll.value}`;
    const { name, bonus } = roll.stat;
    return `${roll.value} ${bonus < 0 ? '-' : '+'} ${Math.abs(bonus)} for ${name} = ${roll.value + bonus}`;
}

const OUTCOME_LINES: Record<RollOutcome, (roll: Roll) => string> = {
    critical_success: () => 'a critical success (a natural 20). It works, and better than hoped: something extra goes their way.',
    success: (roll) => `a success (${thrown(roll)}, needing ${roll.target} or more). It works.`,
    failure: (roll) =>
        `a failure (${thrown(roll)}, needing ${roll.target} or more). It does not work, or works only at a cost or with a complication; the story still moves.`,
    critical_failure: () => 'a critical failure (a natural 1). It goes wrong, and in a way that makes things worse.',
};

/**
 * The Roll block of a turn's trailing message, or null without a Roll. It sits after "Where things
 * stand" and any Sudden event. The dice are final for the reply, never named in the story, and
 * never lift the rule about the worn identity.
 */
export function rollBlock(roll: Roll | null | undefined, identity: string): string | null {
    if (!roll) return null;
    return `The dice were thrown for what ${identity} attempts in their latest message: ${OUTCOME_LINES[rollOutcome(roll)](roll)} Write the attempt turning out that way; the result is final, so don't soften or reverse it. If the message attempts nothing that could fail, ignore this. Never mention dice, a roll or numbers in the story, and never write what ${identity} says, thinks, feels, decides or does beyond how the attempt turns out.`;
}

/** What the Story so far trigger reserves for a Roll block, which it can't know in advance: a Stat makes it a little longer. */
export const ROLL_RESERVE_TOKENS = 120;
