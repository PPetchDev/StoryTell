'use client';

import Link from 'next/link';
import { useId, useState } from 'react';

import { PinIcon } from '@/components/icons';
import { BOND_CHART, bondChartLayout, bondChartSummary, pinRows } from '@/lib/bond-chart';
import { BondAxis } from '@/lib/bonds';
import { ChatDashboard, DashboardBond, messageHref } from '@/lib/chat';

/** Each axis's name in its colour (each reads 4.5:1 on the card: they are the Character colours). */
const AXIS_TEXT: Record<BondAxis, string> = {
    trust: 'text-bond-trust',
    affection: 'text-bond-affection',
    desire: 'text-bond-desire',
    tension: 'text-bond-tension',
};

const AXIS_STROKE: Record<BondAxis, string> = {
    trust: 'stroke-bond-trust',
    affection: 'stroke-bond-affection',
    desire: 'stroke-bond-desire',
    tension: 'stroke-bond-tension',
};

/** "second", "third": which of the pins with the same label this is, in words (no number shows on the chart). */
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

/** One row of pins is 44px: a pin's target (audit M56). */
const PIN_ROW_REM = 2.75;

/**
 * A Bond's four axes over the Chat (.scratch/bond-axes/spec.md, "The Dashboard"), from the pure
 * layout: a band per axis with the words at the ends of its scale, Start and Now along the bottom,
 * and a pin where the label changed. A tap on a pin shows the event behind it, with a link to its
 * Message. No number shows anywhere. A Bond with no levels yet reads "Not measured yet" instead.
 *
 * The words are HTML, 12px or more at any width and following the text size (audit H18); only the
 * lines are SVG, each band stretched to the chart's width. The chart is also said in words under
 * it, from its first measure to now (audit H17).
 */
export function BondChart({ dashboard, bond, from }: { dashboard: ChatDashboard; bond: DashboardBond; from: string }) {
    const [openPin, setOpenPin] = useState<number | null>(null);
    const summaryId = useId();
    const eventId = useId();
    if (bond.levels === null) return <p className="mt-3 mb-0 text-muted">Not measured yet</p>;

    const layout = bondChartLayout(bond.trend, dashboard.lastPosition);
    const opened = openPin === null ? undefined : bond.history.find((change) => change.id === openPin);
    const percent = (x: number) => `${(100 * x) / layout.width}%`;
    const rows = pinRows(layout.pins);
    const rowCount = layout.pins.length === 0 ? 0 : Math.max(...rows) + 1;
    const labelOf = (changeId: number) => bond.history.find((change) => change.id === changeId)?.label ?? '';
    const summary = bondChartSummary(bond.trend);

    return (
        <div className="mt-3">
            <figure
                className="relative m-0 max-w-120"
                role="group"
                aria-label={`How ${from} feels toward ${bond.toward.name} over the Chat`}
                aria-describedby={summary ? summaryId : undefined}
            >
                {rowCount > 0 && (
                    <div className="relative" style={{ height: `${rowCount * PIN_ROW_REM}rem` }}>
                        {layout.pins.map((pin, index) => {
                            const label = labelOf(pin.changeId);
                            const same = layout.pins.filter((each) => labelOf(each.changeId) === label);
                            const nth = same.indexOf(pin);
                            const which = same.length > 1 ? `, the ${ORDINALS[nth] ?? 'next'} time` : '';
                            return (
                                <button
                                    key={pin.changeId}
                                    type="button"
                                    className="group bare-button absolute grid size-11 -translate-x-1/2 place-items-center rounded-full text-event"
                                    style={{ left: percent(pin.x), top: `${rows[index] * PIN_ROW_REM}rem` }}
                                    aria-label={`Turning point: ${label}${which}`}
                                    aria-pressed={openPin === pin.changeId}
                                    aria-controls={eventId}
                                    onClick={() => setOpenPin(openPin === pin.changeId ? null : pin.changeId)}
                                >
                                    <span className="grid size-8 place-items-center rounded-full group-aria-pressed:bg-accent-soft">
                                        <PinIcon size={18} />
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
                <div className="grid gap-2">
                    {layout.bands.map((band) => (
                        <div key={band.axis}>
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                                <span className={`font-bold ${AXIS_TEXT[band.axis]}`}>{band.name}</span>
                                <span className="text-muted">{`${band.low} … ${band.high}`}</span>
                            </div>
                            {/* The band's slice of the layout, stretched to the width; the line keeps its 2px. */}
                            <svg
                                className="block h-6 w-full overflow-visible"
                                viewBox={`0 ${band.plotTop} ${layout.width} ${band.plotBottom - band.plotTop}`}
                                preserveAspectRatio="none"
                                aria-hidden="true"
                                focusable="false"
                            >
                                <rect
                                    className="fill-status-item-tint stroke-line"
                                    x={0}
                                    y={band.plotTop}
                                    width={layout.width}
                                    height={band.plotBottom - band.plotTop}
                                    rx={3}
                                    strokeWidth={1}
                                    vectorEffect="non-scaling-stroke"
                                />
                                {/* Where the label changed: a dashed mark through the plot, under the pin, clear of the words. */}
                                {layout.pins.map((pin) => (
                                    <line
                                        key={pin.changeId}
                                        className="stroke-event"
                                        x1={pin.x}
                                        x2={pin.x}
                                        y1={band.plotTop}
                                        y2={band.plotBottom}
                                        strokeWidth={1}
                                        strokeDasharray="2 3"
                                        vectorEffect="non-scaling-stroke"
                                    />
                                ))}
                                {band.path && (
                                    <path
                                        d={band.path}
                                        fill="none"
                                        className={AXIS_STROKE[band.axis]}
                                        strokeWidth={2}
                                        strokeLinejoin="round"
                                        vectorEffect="non-scaling-stroke"
                                    />
                                )}
                            </svg>
                        </div>
                    ))}
                </div>
                {/* The time axis (audit M55): the Chat runs from its start to now. */}
                <div className="mt-1 flex justify-between text-xs text-muted" style={{ paddingInline: percent(BOND_CHART.left) }}>
                    <span>Start</span>
                    <span>Now</span>
                </div>
                {summary && (
                    <figcaption id={summaryId} className="mt-2 text-sm text-muted">
                        {summary}
                    </figcaption>
                )}
            </figure>
            <div id={eventId} aria-live="polite">
                {opened && (
                    <div className="mt-2 rounded-md border border-line bg-surface-raised px-3 py-2" role="region" aria-label="Turning point">
                        <p className="mt-0 mb-1 font-bold text-accent">{opened.before ? `${opened.before.label} → ${opened.label}` : opened.label}</p>
                        {opened.event && <p className="mt-0 mb-1 text-note text-event">Because: {opened.event}</p>}
                        {opened.messageId !== null && (
                            <p className="m-0 text-sm">
                                <Link href={messageHref(dashboard.storyId, dashboard.chatId, opened.messageId)}>Go to the Message</Link>
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
