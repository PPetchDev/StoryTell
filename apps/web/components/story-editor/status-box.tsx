'use client';

import { useState } from 'react';

import { MissingField } from '@/lib/story';
import styles from './status-box.module.css';

interface StatusBoxProps {
    playable: boolean;
    missing: MissingField[];
    /** Takes the author to a missing item's field: its tab, scrolled to, focused, lit. */
    onGo(item: MissingField): void;
}

function Chevron() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5l7 7-7 7" />
        </svg>
    );
}

/** The playable status (spec: "Story editor", Status box): Playable, or what is still missing. */
export function StatusBox({ playable, missing, onGo }: StatusBoxProps) {
    const [open, setOpen] = useState(true);
    if (playable) {
        return (
            <section className={`${styles.box} ${styles.ok}`} aria-label="Playable status">
                <p>Playable. Tap Play to start a Chat.</p>
            </section>
        );
    }
    return (
        <section className={styles.box} aria-label="Playable status">
            <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen((shown) => !shown)}>
                <span>
                    <strong>{missing.length} to fill in</strong> before you can play
                </span>
                <span className={open ? styles.turned : undefined}>
                    <Chevron />
                </span>
            </button>
            {open && (
                <ul className={styles.list}>
                    {missing.map((item) => (
                        <li key={item.field}>
                            <button type="button" onClick={() => onGo(item)}>
                                <span>{item.label}</span>
                                <Chevron />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
