'use client';

import { FormEvent, useState } from 'react';

import { Sheet } from '@/components/sheet/sheet';

import styles from './snapshot-sheet.module.css';

interface SnapshotSheetProps {
    /** Image credit is used up: the sheet says so and takes nothing. */
    imageCreditOut: boolean;
    onTake(hint: string): void;
    onClose(): void;
}

/**
 * 📷 in the action row opens this (spec: "Snapshot sheet"): an optional hint, then one
 * Snapshot of the latest AI Message. It closes at once; the placeholder in the thread shows
 * the Snapshot being made, and a failure to start it shows by the composer.
 */
export function SnapshotSheet({ imageCreditOut, onTake, onClose }: SnapshotSheetProps) {
    const [hint, setHint] = useState('');
    const take = (event: FormEvent) => {
        event.preventDefault();
        if (imageCreditOut) return;
        onTake(hint);
        onClose();
    };
    return (
        <Sheet label="Take a Snapshot" onClose={onClose}>
            <form className={styles.form} onSubmit={take}>
                <h2 className={styles.title}>Take a Snapshot</h2>
                <p className={styles.lead}>A Snapshot of this moment, seen through your eyes.</p>
                <label className={styles.field}>
                    <span>Hint (optional)</span>
                    <input
                        type="text"
                        aria-label="Snapshot hint"
                        placeholder="e.g. close-up on her face"
                        maxLength={300}
                        value={hint}
                        disabled={imageCreditOut}
                        onChange={(event) => setHint(event.target.value)}
                    />
                </label>
                {imageCreditOut && (
                    <p className={styles.note} role="status">
                        Snapshots are off: image credit is used up. Play goes on.
                    </p>
                )}
                <button type="submit" className={`button ${styles.take}`} disabled={imageCreditOut}>
                    Take Snapshot
                </button>
            </form>
        </Sheet>
    );
}
