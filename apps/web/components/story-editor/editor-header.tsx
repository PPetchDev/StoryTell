'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { SAVE_LABELS, SaveState } from './autosave';
import styles from './editor-header.module.css';
import { SparkleIcon } from './sparkle-icon';

interface EditorHeaderProps {
    title: string;
    save: SaveState;
    playable: boolean;
    missingCount: number;
    onAssistant(): void;
    onPlay(): void;
}

/** How long the reason a disabled Play gives stays up after a tap or long-press. */
const REASON_MS = 3000;

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
    useEffect(() => () => clearTimeout(timer.current), []);
    const reason = `Fill in ${plural(missingCount, 'missing field')} to play.`;

    const showReason = () => {
        clearTimeout(timer.current);
        setReasonShown(true);
        timer.current = setTimeout(() => setReasonShown(false), REASON_MS);
    };

    return (
        <header className={styles.header}>
            <Link href="/" className={styles.icon} aria-label="Back to Stories">
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 5l-7 7 7 7" />
                </svg>
            </Link>
            <div className={styles.title}>
                <h1>{title}</h1>
                {/* Ticket 11 turns this into its shared <SaveStatus state={save} /> at merge. */}
                <p className={`save-state ${styles.save}`} role="status" aria-live="polite" data-state={save.kind}>
                    {SAVE_LABELS[save.kind]}
                    {save.kind === 'error' && `: ${save.message}`}
                </p>
            </div>
            <button type="button" className={styles.icon} aria-label="Assistant" title="Story assistant" onClick={onAssistant}>
                <SparkleIcon size={22} />
            </button>
            <div className={styles.playWrap}>
                {/* aria-disabled, not disabled, so a tap or long-press can still say why. */}
                <button
                    type="button"
                    className={`button ${styles.play}`}
                    aria-disabled={!playable}
                    aria-describedby={playable ? undefined : 'play-reason'}
                    title={playable ? 'Start a Chat' : reason}
                    onClick={playable ? onPlay : showReason}
                    onContextMenu={(event) => {
                        if (playable) return;
                        event.preventDefault();
                        showReason();
                    }}
                >
                    Play
                </button>
                {!playable && (
                    <p id="play-reason" className={reasonShown ? styles.reason : 'visually-hidden'}>
                        {reason}
                    </p>
                )}
            </div>
        </header>
    );
}
