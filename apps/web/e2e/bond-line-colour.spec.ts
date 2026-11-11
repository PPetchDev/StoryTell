import { expect, test } from '@playwright/test';

import { BOND_AXIS_COLOURS, BOND_NEUTRAL_COLOUR, bondLine } from '../lib/bonds';

// .scratch/bond-axes/issues/05-bonds-in-the-memory-graph.md: the colour of a Bond's line in the
// Memory graph is its strongest axis. The web has no unit-test runner, so this runs in Playwright
// with no page.

const at = (trust: number, affection: number, desire: number, tension: number) => ({ trust, affection, desire, tension });

test('a line takes the colour of the axis furthest from the middle, whichever way', () => {
    expect(bondLine(at(-3, 1, 0, 0))).toEqual({ axis: 'trust', colour: BOND_AXIS_COLOURS.trust, dashed: false });
    expect(bondLine(at(1, 2, -1, 0))).toEqual({ axis: 'affection', colour: BOND_AXIS_COLOURS.affection, dashed: false });
    expect(bondLine(at(0, 1, -3, 1))).toEqual({ axis: 'desire', colour: BOND_AXIS_COLOURS.desire, dashed: false });
    expect(bondLine(at(1, 0, 0, 3))).toEqual({ axis: 'tension', colour: BOND_AXIS_COLOURS.tension, dashed: false });
});

test('Tension wins a tie', () => {
    expect(bondLine(at(2, 0, 0, 2)).axis).toBe('tension');
    expect(bondLine(at(-2, 2, 2, 2)).axis).toBe('tension');
    expect(bondLine(at(3, -3, 0, 3)).axis).toBe('tension');
});

test('Tension counts only at strained or more', () => {
    // Uneasy is not enough to colour the line, even against an all-middle Bond.
    expect(bondLine(at(0, 0, 0, 1))).toEqual({ axis: null, colour: BOND_NEUTRAL_COLOUR, dashed: false });
    expect(bondLine(at(1, 0, 0, 1)).axis).toBe('trust');
    // Strained counts as two steps from the middle, and beats a one-step axis.
    expect(bondLine(at(1, -1, 0, 2)).axis).toBe('tension');
    // A three-step axis beats strained Tension.
    expect(bondLine(at(0, 3, 0, 2)).axis).toBe('affection');
});

test('among the other three, a tie goes to the first: Trust, then Affection, then Desire', () => {
    expect(bondLine(at(2, -2, 2, 0)).axis).toBe('trust');
    expect(bondLine(at(0, -1, 1, 0)).axis).toBe('affection');
});

test('an all-middle Bond is grey, and a Bond with no levels is dashed grey', () => {
    expect(bondLine(at(0, 0, 0, 0))).toEqual({ axis: null, colour: BOND_NEUTRAL_COLOUR, dashed: false });
    expect(bondLine(null)).toEqual({ axis: null, colour: BOND_NEUTRAL_COLOUR, dashed: true });
});
