import { BOND_AXES, BOND_AXIS_NAMES, BOND_AXIS_RANGE, BondAxis, bondLevelWord } from './bonds';
import type { BondTrendPoint } from './chat';

/**
 * The Bond chart's layout (.scratch/bond-axes/spec.md, "The Dashboard"): a pure function from a
 * Bond's trend to what plain SVG draws, with no chart library. Each axis gets a band of its own,
 * captioned with its name and the words at the ends of its scale, and a line that holds each
 * level until the next change. Along the bottom runs the Chat, from the start to its newest
 * Message. No number is ever a label: the user sees levels only as the line's height and words.
 */

/** The chart's frame, in SVG units. The SVG scales to the width it is given. */
export const BOND_CHART = {
    width: 320,
    /** Where the Chat starts and ends along a band. */
    left: 6,
    right: 314,
    /** A band: its caption, then its plot. */
    captionHeight: 14,
    plotHeight: 22,
    bandGap: 8,
} as const;

export interface BondChartBand {
    axis: BondAxis;
    name: string;
    /** The words at the ends of its scale, lowest first. */
    low: string;
    high: string;
    /** The caption's baseline. */
    captionY: number;
    plotTop: number;
    plotBottom: number;
    /** Its line as an SVG path, or null when the Bond was never measured. */
    path: string | null;
}

export interface BondChartPoint {
    changeId: number;
    x: number;
    /** Each axis's height at this change; null while the Bond had no levels. */
    ys: Record<BondAxis, number> | null;
}

export interface BondChartPin {
    changeId: number;
    messageId: number;
    x: number;
}

export interface BondChartLayout {
    width: number;
    height: number;
    bands: BondChartBand[];
    /** One per change, oldest first. */
    points: BondChartPoint[];
    /** Where the label changed. */
    pins: BondChartPin[];
    /** Every text the chart shows. */
    labels: string[];
    /** The height of one axis's level. */
    levelY(axis: BondAxis, level: number): number;
}

/** Lays out one Bond's trend over a Chat whose newest Message is at `lastPosition`. */
export function bondChartLayout(trend: readonly BondTrendPoint[], lastPosition: number): BondChartLayout {
    const { width, left, right, captionHeight, plotHeight, bandGap } = BOND_CHART;
    const end = Math.max(1, lastPosition, ...trend.map((point) => point.position ?? 0));
    const xOf = (position: number | null): number => left + ((right - left) * (position ?? 0)) / end;

    const bandTop = (index: number) => index * (captionHeight + plotHeight + bandGap);
    const levelY = (axis: BondAxis, level: number): number => {
        const { min, max } = BOND_AXIS_RANGE[axis];
        const plotTop = bandTop(BOND_AXES.indexOf(axis)) + captionHeight;
        return plotTop + (plotHeight * (max - Math.min(max, Math.max(min, level)))) / (max - min);
    };

    const points: BondChartPoint[] = trend.map((point) => ({
        changeId: point.id,
        x: xOf(point.position),
        ys: point.levels
            ? (Object.fromEntries(BOND_AXES.map((axis) => [axis, levelY(axis, point.levels![axis])])) as Record<BondAxis, number>)
            : null,
    }));
    const measured = points.filter((point): point is BondChartPoint & { ys: Record<BondAxis, number> } => point.ys !== null);

    const bands: BondChartBand[] = BOND_AXES.map((axis, index) => {
        const { min, max } = BOND_AXIS_RANGE[axis];
        const top = bandTop(index);
        let path: string | null = null;
        if (measured.length > 0) {
            const [first, ...rest] = measured;
            // A step line: each level holds until the next change, and the last until now.
            path = `M ${first.x} ${first.ys[axis]}`;
            for (const point of rest) path += ` H ${point.x} V ${point.ys[axis]}`;
            path += ` H ${right}`;
        }
        return {
            axis,
            name: BOND_AXIS_NAMES[axis],
            low: bondLevelWord(axis, min),
            high: bondLevelWord(axis, max),
            captionY: top + captionHeight - 4,
            plotTop: top + captionHeight,
            plotBottom: top + captionHeight + plotHeight,
            path,
        };
    });

    const pins: BondChartPin[] = trend.flatMap((point) =>
        point.labelChanged && point.messageId !== null ? [{ changeId: point.id, messageId: point.messageId, x: xOf(point.position) }] : [],
    );

    return {
        width,
        height: bandTop(BOND_AXES.length) - bandGap,
        bands,
        points,
        pins,
        labels: bands.flatMap((band) => [band.name, `${band.low} … ${band.high}`]),
        levelY,
    };
}
