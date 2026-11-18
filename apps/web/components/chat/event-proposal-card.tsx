'use client';

import { COLUMN, SHORT_HIDDEN, SHORTEST_HIDDEN } from '@/components/chat/chat-classes';
import { BoltIcon } from '@/components/icons';
import { ChatEventProposal } from '@/lib/chat';

/** "Bring Suspicion down to 20 or lower in 3 replies": what starting it asks of the user. */
export function proposalGoal(proposal: ChatEventProposal): string {
    const way = proposal.direction === 'lower' ? `down to ${proposal.goal} or lower` : `up to ${proposal.goal} or higher`;
    return `Bring ${proposal.gauge} ${way} in ${proposal.turns} ${proposal.turns === 1 ? 'reply' : 'replies'}`;
}

/** What a screen reader hears when a proposal shows, or null when the same one is still showing or none is. */
export function eventProposalAnnouncement(before: ChatEventProposal | null, now: ChatEventProposal | null): string | null {
    if (!now || before?.id === now.id) return null;
    const reason = now.reason ? ` ${now.reason}` : '';
    return `The story proposes a Sudden event: ${now.name}.${reason} ${proposalGoal(now)}. Start it, or not now.`;
}

interface EventProposalCardProps {
    proposal: ChatEventProposal;
    /** A write or turn is in flight: the buttons wait. */
    busy: boolean;
    onStart(): void;
    onDecline(): void;
}

/**
 * A Sudden event the story made up (.scratch/ai-events/spec.md), where the event banner goes: what
 * it is, why now, and what it asks (the Gauge, its goal, the replies), with "Not now" and "Start
 * it". Nothing starts until the user taps Start it; it then shows as the event banner. Playing on
 * without an answer lets it lapse. On a short screen (the keyboard up) it is one row: the name and
 * the buttons.
 */
export function EventProposalCard({ proposal, busy, onStart, onDecline }: EventProposalCardProps) {
    return (
        <section
            className={`-mx-2 shrink-0 border-b border-line bg-surface px-2 py-2 [@media(max-height:560px)]:py-1 ${COLUMN} ${SHORTEST_HIDDEN}`}
            aria-label="Proposed event"
            data-event-proposal={proposal.id}
        >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="m-0 min-w-0 flex-[1_1_9rem] text-base font-normal">
                    <span className={`block text-xs font-semibold text-muted ${SHORT_HIDDEN}`}>The story proposes an event</span>
                    <span className="block text-sm font-semibold text-text [overflow-wrap:anywhere]">
                        <BoltIcon size={14} className="mr-1 inline-block shrink-0 align-[-0.15em] text-accent" />
                        {proposal.name}
                    </span>
                </h2>
                {/* 44px tall, so the small buttons' touch areas fill it, on the row or under it. */}
                <div className="ml-auto flex h-11 shrink-0 items-center gap-2">
                    <button type="button" className="button button-quiet button-small" disabled={busy} onClick={onDecline} aria-label={`Not now: don't start ${proposal.name}`}>
                        Not now
                    </button>
                    <button type="button" className="button button-small" disabled={busy} onClick={onStart} aria-label={`Start it: ${proposal.name}`}>
                        Start it
                    </button>
                </div>
            </div>
            <p className={`m-0 mt-1 text-sm font-semibold text-text ${SHORT_HIDDEN}`} data-proposal-goal>
                {proposalGoal(proposal)}
            </p>
            {(proposal.reason || proposal.trigger) && (
                <p className={`m-0 mt-0.5 text-sm text-muted [overflow-wrap:anywhere] ${SHORT_HIDDEN}`}>{proposal.reason || proposal.trigger}</p>
            )}
        </section>
    );
}
