import { expect, test } from '@playwright/test';

import { BOND_CHART, bondChartLayout } from '../lib/bond-chart';
import type { BondTrendPoint } from '../lib/chat';

// .scratch/bond-axes/issues/03-bond-chart-on-the-dashboard.md: the pure layout the Bond chart is
// drawn from. The web has no unit-test runner, so this runs in Playwright with no page.

const SEED: BondTrendPoint = { id: 1, messageId: null, position: null, levels: { trust: -1, affection: 0, desire: 0, tension: 0 }, labelChanged: false };
const TREND: BondTrendPoint[] = [
    SEED,
    { id: 4, messageId: 10, position: 2, levels: { trust: 0, affection: 1, desire: 0, tension: 2 }, labelChanged: false },
    { id: 7, messageId: 12, position: 4, levels: { trust: 1, affection: 1, desire: 0, tension: 1 }, labelChanged: true },
    { id: 9, messageId: 16, position: 8, levels: { trust: 1, affection: 2, desire: 1, tension: 1 }, labelChanged: false },
];

test('gives a point per change, at its Message along the Chat, and a pin only where the label changed', () => {
    const layout = bondChartLayout(TREND, 8);

    expect(layout.points.map((point) => point.changeId)).toEqual([1, 4, 7, 9]);
    const xs = layout.points.map((point) => point.x);
    // The seed stands at the start, the newest Message at the end, the rest in between by place.
    expect(xs[0]).toBe(BOND_CHART.left);
    expect(xs[3]).toBe(BOND_CHART.right);
    expect(xs[1]).toBeCloseTo(BOND_CHART.left + (BOND_CHART.right - BOND_CHART.left) * (2 / 8));
    expect(xs[2]).toBeCloseTo(BOND_CHART.left + (BOND_CHART.right - BOND_CHART.left) * (4 / 8));

    expect(layout.pins).toEqual([{ changeId: 7, messageId: 12, x: xs[2] }]);
});

test('draws one line per axis, higher levels higher up its band, holding each level until the next change', () => {
    const layout = bondChartLayout(TREND, 10);

    expect(layout.bands.map((band) => band.axis)).toEqual(['trust', 'affection', 'desire', 'tension']);
    for (const band of layout.bands) {
        expect(band.path).not.toBeNull();
        expect(band.plotTop).toBeLessThan(band.plotBottom);
    }
    const trust = layout.bands[0];
    const at = (changeId: number) => layout.points.find((point) => point.changeId === changeId)!.ys!;
    // Trust climbs: each later level sits higher (a smaller y).
    expect(at(4).trust).toBeLessThan(at(1).trust);
    expect(at(7).trust).toBeLessThan(at(4).trust);
    // The whole range fills the band: −3 at the bottom, +3 at the top; Tension's 0 to 3 likewise.
    expect(layout.levelY('trust', -3)).toBe(trust.plotBottom);
    expect(layout.levelY('trust', 3)).toBe(trust.plotTop);
    expect(layout.levelY('tension', 0)).toBe(layout.bands[3].plotBottom);
    expect(layout.levelY('tension', 3)).toBe(layout.bands[3].plotTop);
    // The newest Message is at position 8 but the Chat runs on to 10: the line holds to the end.
    expect(trust.path!.endsWith(`H ${BOND_CHART.right}`)).toBe(true);
});

test('a change before the first measure has a point with no levels, and the lines start at the first measure', () => {
    const layout = bondChartLayout(
        [
            { id: 2, messageId: 5, position: 2, levels: null, labelChanged: true },
            { id: 3, messageId: 7, position: 4, levels: { trust: 1, affection: 0, desire: 0, tension: 0 }, labelChanged: false },
        ],
        4,
    );
    expect(layout.points.map((point) => [point.changeId, point.ys === null])).toEqual([
        [2, true],
        [3, false],
    ]);
    expect(layout.pins.map((pin) => pin.changeId)).toEqual([2]);
    const x3 = layout.points[1].x;
    expect(layout.bands[0].path!.startsWith(`M ${x3} `)).toBe(true);
});

test('a Bond that never moved still draws flat lines across the Chat', () => {
    const layout = bondChartLayout([SEED], 0);
    expect(layout.points).toHaveLength(1);
    expect(layout.pins).toEqual([]);
    expect(layout.bands[0].path).toBe(`M ${BOND_CHART.left} ${layout.levelY('trust', -1)} H ${BOND_CHART.right}`);
});

test('its words are the axis names and the words at the ends of each scale, and hold no digits', () => {
    const layout = bondChartLayout(TREND, 8);
    expect(layout.bands.map((band) => [band.name, band.low, band.high])).toEqual([
        ['Trust', 'betrayed', 'trusts completely'],
        ['Affection', 'hates', 'devoted'],
        ['Desire', 'repelled', 'aches for'],
        ['Tension', 'at ease', 'at breaking point'],
    ]);
    expect(layout.labels.length).toBeGreaterThan(0);
    for (const label of layout.labels) expect(label).not.toMatch(/\d/);
    expect(layout.labels).toEqual(expect.arrayContaining(['Trust', 'betrayed … trusts completely']));
});
