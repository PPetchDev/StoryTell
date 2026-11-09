'use client';

import { useState } from 'react';

import { useConnection } from '@/components/connection';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { appSavedReplies, SavedReply, storySavedReplies, TraySavedReply } from '@/lib/saved-replies';

import styles from './chat-composer.module.css';

/** Whose lines the tray shows: this Story's, then the app-wide ones (.scratch/saved-replies-and-replace-rules/spec.md). */
const GROUPS = [
    { scope: 'story', heading: 'This Story' },
    { scope: 'app', heading: 'All Stories' },
] as const;

interface SavedRepliesTrayProps {
    storyId: number;
    lines: TraySavedReply[];
    /** The box's text, which "Save this draft" keeps as it is. */
    draft: string;
    /** Nothing may change the box now (a turn is written, or ✍️ waits). */
    locked: boolean;
    onPick(text: string): void;
    /** A scope's new list, after "Save this draft". */
    onSaved(scope: TraySavedReply['scope'], lines: SavedReply[]): void;
}

/**
 * The composer's Saved replies tray, a panel (spec: "Composer"). A tap on a line only fills the
 * box; nothing here sends. "Save this draft" keeps the box's text for this Story or for all.
 */
export function SavedRepliesTray({ storyId, lines, draft, locked, onPick, onSaved }: SavedRepliesTrayProps) {
    const { reportUnreachable } = useConnection();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const empty = draft.trim() === '';

    const save = async (scope: TraySavedReply['scope']) => {
        setSaving(true);
        setError(null);
        try {
            const saved = scope === 'story' ? await storySavedReplies(storyId).add(draft) : await appSavedReplies.add(draft);
            onSaved(scope, saved);
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className={styles.tray} aria-label="Saved replies">
            {lines.length === 0 && (
                <p className={styles.trayEmpty}>
                    No saved replies yet. Save a draft here, or add them in Settings or the Story editor&apos;s Style tab.
                </p>
            )}
            {GROUPS.map(({ scope, heading }) => {
                const group = lines.filter((line) => line.scope === scope);
                if (group.length === 0) return null;
                return (
                    <div key={scope} role="group" aria-label={heading}>
                        <h3 className={styles.trayHeading}>{heading}</h3>
                        <ul className={styles.trayLines}>
                            {group.map((line) => (
                                <li key={line.id}>
                                    <button
                                        type="button"
                                        className={styles.trayLine}
                                        disabled={locked}
                                        // Keep the box's focus and caret: a tap on a button would otherwise take them.
                                        onPointerDown={(event) => event.preventDefault()}
                                        onClick={() => onPick(line.text)}
                                    >
                                        {line.text}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            })}
            <div className={styles.traySave} role="group" aria-label="Save this draft">
                <span>Save this draft</span>
                <button
                    type="button"
                    className="button button-quiet button-small"
                    disabled={empty || saving || locked}
                    onClick={() => void save('story')}
                >
                    For this Story
                </button>
                <button
                    type="button"
                    className="button button-quiet button-small"
                    disabled={empty || saving || locked}
                    onClick={() => void save('app')}
                >
                    For all Stories
                </button>
            </div>
            {error && (
                <p role="alert" className="turn-error">
                    {error}
                </p>
            )}
        </section>
    );
}
