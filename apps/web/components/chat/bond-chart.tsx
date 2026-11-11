'use client';

import Link from 'next/link';
import { useState } from 'react';

import { bondChartLayout } from '@/lib/bond-chart';
import { BOND_AXIS_COLOURS } from '@/lib/bonds';
import { ChatDashboard, DashboardBond, messageHref } from '@/lib/chat';

/**
 * A Bond's four axes over the Chat (.scratch/bond-axes/spec.md, "The Dashboard"), drawn in plain
 * SVG from the pure layout: a band per axis with the words at the ends of its scale, and a pin
 * where the label changed. A tap on a pin shows the event behind it, with a link to its Message.
 * No number shows anywhere. A Bond with no levels yet reads "Not measured yet" instead.
 */
export function BondChart({ dashboard, bond, from }: { dashboard: ChatDashboard; bond: DashboardBond; from: string }) {
    const [openPin, setOpenPin] = useState<number | null>(null);
    if (bond.levels === null) return <p className="muted bond-unmeasured">Not measured yet</p>;

    const layout = bondChartLayout(bond.trend, dashboard.lastPosition);
    const opened = openPin === null ? undefined : bond.history.find((change) => change.id === openPin);
    const percent = (x: number) => `${(100 * x) / layout.width}%`;

    return (
        <div className="bond-chart">
            <figure className="bond-chart-figure" role="group" aria-label={`How ${from} feels toward ${bond.toward.name} over the Chat`}>
                {layout.pins.length > 0 && (
                    <div className="bond-chart-pins">
                        {layout.pins.map((pin) => {
                            const label = bond.history.find((change) => change.id === pin.changeId)?.label ?? '';
                            return (
                                <button
                                    key={pin.changeId}
                                    type="button"
                                    className="bond-chart-pin"
                                    style={{ left: percent(pin.x) }}
                                    aria-label={`Turning point: ${label}`}
                                    aria-pressed={openPin === pin.changeId}
                                    onClick={() => setOpenPin(openPin === pin.changeId ? null : pin.changeId)}
                                >
                                    ◆
                                </button>
                            );
                        })}
                    </div>
                )}
                <svg
                    className="bond-chart-svg"
                    viewBox={`0 0 ${layout.width} ${layout.height}`}
                    role="img"
                    aria-label="Trust, Affection, Desire and Tension over the Chat"
                >
                    {layout.pins.map((pin) => (
                        <line key={pin.changeId} className="bond-chart-pin-line" x1={pin.x} x2={pin.x} y1={0} y2={layout.height} />
                    ))}
                    {layout.bands.map((band) => (
                        <g key={band.axis}>
                            <text className="bond-chart-name" x={0} y={band.captionY} fill={BOND_AXIS_COLOURS[band.axis]}>
                                {band.name}
                            </text>
                            <text className="bond-chart-ends" x={layout.width} y={band.captionY} textAnchor="end">
                                {`${band.low} … ${band.high}`}
                            </text>
                            <rect className="bond-chart-plot" x={0} y={band.plotTop} width={layout.width} height={band.plotBottom - band.plotTop} rx={3} />
                            {band.path && <path d={band.path} fill="none" stroke={BOND_AXIS_COLOURS[band.axis]} strokeWidth={2} strokeLinejoin="round" />}
                        </g>
                    ))}
                </svg>
            </figure>
            {opened && (
                <div className="bond-chart-event" role="region" aria-label="Turning point">
                    <p className="bond-label">{opened.before ? `${opened.before.label} → ${opened.label}` : opened.label}</p>
                    {opened.event && <p className="event">Because: {opened.event}</p>}
                    {opened.messageId !== null && (
                        <p className="small">
                            <Link href={messageHref(dashboard.storyId, dashboard.chatId, opened.messageId)}>Go to the Message</Link>
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
