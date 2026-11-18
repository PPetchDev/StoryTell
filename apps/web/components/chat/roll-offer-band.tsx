'use client';

import { DiceIcon } from '@/components/icons';
import { RollOffer, signedStat } from '@/lib/chat';

interface RollOfferBandProps {
    offer: RollOffer;
    /** The number a Roll sent now must reach. */
    target: number;
    /** A turn or a write is in flight: neither button may act. */
    busy: boolean;
    /** Arms the Roll, with the offer's Stat, for the next Message. */
    onTake(): void;
    /** "Not now": the offer goes. */
    onDismiss(): void;
}

/**
 * The Roll the Judge offers for the next Message (CONTEXT.md, "Roll offer"; .scratch/judge-rolls/spec.md),
 * as a band above the composer's box: what is at stake, then "Not now" and "Roll" with the Stat
 * it adds. One row where it fits; on a phone the buttons go under the stakes, on the right, so the
 * stakes are never cut off. Taking it is a send, not a request: the Roll is armed like the 🎲 toggle.
 */
export function RollOfferBand({ offer, target, busy, onTake, onDismiss }: RollOfferBandProps) {
    const stat = offer.stat ? `${signedStat(offer.stat.bonus)} ${offer.stat.name}` : null;
    return (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 rounded-md bg-accent-soft pl-3 text-sm" role="group" aria-label="Roll offer" data-band="roll-offer">
            <p className="m-0 flex min-w-0 flex-[1_1_9rem] items-center gap-1.5 py-1.5">
                <DiceIcon size={16} className="shrink-0 text-rewrite-text" />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                    <span className="sr-only">The dice are offered: </span>
                    {offer.stakes}
                </span>
            </p>
            {/* 44px tall, so the small buttons' touch areas fill it, on the row or under it. */}
            <div className="ml-auto flex h-11 shrink-0 items-center gap-2 pr-1">
                <button type="button" className="button button-quiet button-small" disabled={busy} onClick={onDismiss} aria-label="Not now: no Roll for this">
                    Not now
                </button>
                <button
                    type="button"
                    className="button button-small"
                    disabled={busy}
                    onClick={onTake}
                    aria-label={`Roll the dice for your next message: ${target} or more succeeds${stat ? `, ${stat}` : ''}`}
                >
                    Roll{stat ? ` ${stat}` : ''}
                </button>
            </div>
        </div>
    );
}
