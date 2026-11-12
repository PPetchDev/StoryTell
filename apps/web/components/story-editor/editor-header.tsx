'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ChevronLeftIcon } from '@/components/icons';
import { SaveState } from './autosave';
import { SaveStatus } from './save-status';
import { SparkleIcon } from './sparkle-icon';

interface EditorHeaderProps {
    title: string;
    save: SaveState;
    playable: boolean;
    missingCount: number;
    onAssistant(): void;
    onPlay(): void;
}

/**
 * How long the reason a disabled Play gives stays up after a tap or long-press, at the least: it
 * stays while Play keeps focus, and goes when focus leaves it (audit L31).
 */
const REASON_MS = 6000;

/** A round 44px icon button in the header. */
const ICON_BUTTON = 'bare-button grid size-11 flex-none place-items-center rounded-full text-text press focus-ring hover:bg-surface-raised active:bg-surface-raised';

function plural(count: number, one: string): string {
    return `${count} ${one}${count === 1 ? '' : 's'}`;
}

/**
 * The editor's header (spec: "Story editor", Header): back, the Story title with the save
 * status under it, the Assistant, and Play. Play is disabled until the Story is playable; then
 * a tap, a long-press or hovering says why.
 */
export function EditorHeader({ title, save, playable, missingCount, onAssistant, onPlay }: EditorHeaderProps) {
    const [reasonShown, setReasonShown] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const play = useRef<HTMLButtonElement>(null);
    useEffect(() => () => clearTimeout(timer.current), []);
    const reason = `Fill in ${plural(missingCount, 'missing field')} to play.`;

    const showReason = () => {
        clearTimeout(timer.current);
        setReasonShown(true);
        timer.current = setTimeout(() => {
            if (document.activeElement !== play.current) setReasonShown(false);
        }, REASON_MS);
    };

    return (
        <header className="flex items-center gap-1 py-1">
            <Link href="/" className={ICON_BUTTON} aria-label="Back to Stories">
                <ChevronLeftIcon size={22} />
            </Link>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
                {/* Two lines before it is cut, and the whole title on hover (audit L8). */}
                <h1 className="m-0 line-clamp-2 text-base [overflow-wrap:anywhere]" title={title}>
                    {title}
                </h1>
                <SaveStatus state={save} className="text-sm" />
            </div>
            <button type="button" className={ICON_BUTTON} aria-label="Assistant" title="Story assistant" onClick={onAssistant}>
                <SparkleIcon size={22} />
            </button>
            <div className="relative flex-none">
                {/* aria-disabled, not disabled, so a tap or long-press can still say why. 44px tall (H26). */}
                <button
                    ref={play}
                    type="button"
                    className="button"
                    aria-disabled={!playable}
                    aria-describedby={playable ? undefined : 'play-reason'}
                    title={playable ? 'Start a Chat' : reason}
                    onClick={playable ? onPlay : showReason}
                    onBlur={() => {
                        if (!reasonShown) return;
                        clearTimeout(timer.current);
                        setReasonShown(false);
                    }}
                    onContextMenu={(event) => {
                        if (playable) return;
                        event.preventDefault();
                        showReason();
                    }}
                >
                    Play
                </button>
                {!playable && (
                    <p
                        id="play-reason"
                        className={
                            reasonShown
                                ? 'absolute top-full right-0 z-popover m-0 mt-1.5 w-max max-w-56 rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-text shadow-[0_8px_24px_var(--shadow)]'
                                : 'sr-only'
                        }
                    >
                        {reason}
                    </p>
                )}
            </div>
        </header>
    );
}
