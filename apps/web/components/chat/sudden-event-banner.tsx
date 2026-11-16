'use client';

import { COLUMN, SHORT_HIDDEN, SHORT_ONLY, SHORTEST_HIDDEN } from '@/components/chat/chat-classes';
import { BoltIcon } from '@/components/icons';
import { ChatSuddenEvent } from '@/lib/chat';

/** "20 or lower" / "80 or higher": the goal in words. */
function goalInWords(event: ChatSuddenEvent): string {
    return event.direction === 'lower' ? `${event.goal} or lower` : `${event.goal} or higher`;
}

/** How many replies are left, in words. */
function repliesLeft(count: number): string {
    return count === 1 ? 'Last reply' : `${count} replies left`;
}

/**
 * What a screen reader hears when the Chat's Sudden event changes (start, a move, the end), or null
 * when nothing did. The banner shows the same; this says it once, when it happens.
 */
export function suddenEventAnnouncement(before: ChatSuddenEvent | null, now: ChatSuddenEvent | null): string | null {
    if (!now) return null;
    const same = before && before.id === now.id && before.status === now.status && before.value === now.value && before.turnsLeft === now.turnsLeft;
    if (same) return null;
    const reason = now.reason ? ` ${now.reason}` : '';
    if (now.status === 'success') return `${now.name}: you came through it. ${now.gauge} ${now.value}.${reason}`;
    if (now.status === 'failure') return `${now.name}: it went against you. ${now.gauge} ${now.value}.${reason}`;
    const started = !before || before.id !== now.id;
    return `${started ? `Sudden event: ${now.name}. ` : ''}${now.gauge} ${now.value}, goal ${goalInWords(now)}. ${repliesLeft(now.turnsLeft)}.${reason}`;
}

/**
 * The Chat's Sudden event, under the Scene strip (.scratch/sudden-events/spec.md): its name, the
 * Gauge as a bar with the goal marked, the number, how many replies are left, and why the Gauge
 * last moved. Once it has ended it shows how, until the next reply. The Chat re-reads until each
 * turn's background calls settle, so a start or a move shows a moment after the reply.
 *
 * On a short screen (the keyboard up) it is one line: the name, the Gauge's number and the replies
 * left; the bar and the reason are back when there is room (docs/ui-audit-2026-11-16.md H1).
 */
export function SuddenEventBanner({ event }: { event: ChatSuddenEvent }) {
    const lower = event.direction === 'lower';
    const ended = event.status !== 'active';
    const status = event.status === 'success' ? 'You came through it' : event.status === 'failure' ? 'It went against you' : repliesLeft(event.turnsLeft);
    // The stretch of the bar that counts as the goal: from the goal to its end of the scale.
    const zone = lower ? { left: '0%', width: `${event.goal}%` } : { left: `${event.goal}%`, width: `${100 - event.goal}%` };
    return (
        <section
            className={`-mx-2 shrink-0 border-b border-line bg-surface px-2 py-2 [@media(max-height:560px)]:py-1 ${COLUMN} ${SHORTEST_HIDDEN}`}
            aria-label="Sudden event"
            data-status={event.status}
        >
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="m-0 min-w-0 truncate text-sm font-semibold text-text">
                    <BoltIcon size={14} className="mr-1 inline-block shrink-0 align-[-0.15em] text-accent" />
                    {event.name}
                </h2>
                <p className={`m-0 shrink-0 text-xs font-semibold ${ended ? 'text-text' : 'text-muted'}`}>
                    <span className={SHORT_ONLY}>
                        {event.gauge} {event.value} ·{' '}
                    </span>
                    {status}
                </p>
            </div>
            <div
                className={`relative mt-1.5 h-2.5 overflow-hidden rounded-full border border-field-line bg-bg ${SHORT_HIDDEN}`}
                role="meter"
                aria-label={event.gauge}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={event.value}
                aria-valuetext={`${event.value} of 100. Goal: ${goalInWords(event)}.`}
            >
                {/* The goal's stretch, tinted; the fill is drawn over it. */}
                <span className="absolute inset-y-0 bg-accent-soft" style={zone} aria-hidden="true" />
                <span className="absolute inset-y-0 left-0 bg-accent-fill" style={{ width: `${event.value}%` }} aria-hidden="true" />
                {/* The goal itself: a line in the text colour, seen on the track and on the fill. */}
                <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-text" style={{ left: `${event.goal}%` }} aria-hidden="true" />
            </div>
            <p className={`m-0 mt-1 flex flex-wrap gap-x-3 text-xs text-muted ${SHORT_HIDDEN}`}>
                <span>
                    <strong className="font-semibold text-text">
                        {event.gauge} {event.value}
                    </strong>
                </span>
                <span>Goal: {goalInWords(event)}</span>
            </p>
            {event.reason !== '' && <p className={`m-0 mt-1 text-sm text-text [overflow-wrap:anywhere] ${SHORT_HIDDEN}`}>{event.reason}</p>}
        </section>
    );
}
