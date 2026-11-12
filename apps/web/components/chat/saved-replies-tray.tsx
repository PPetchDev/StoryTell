'use client';

import { useState } from 'react';

import { useConnection } from '@/components/connection';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { appSavedReplies, SavedReply, storySavedReplies, TraySavedReply } from '@/lib/saved-replies';

import { LABEL_CAPS } from '@/components/chat/chat-classes';

/** A Saved reply: two lines of its text at most, 44px or more to tap (audit M34). */
const LINE = [
    'bare-button line-clamp-2 min-h-11 w-full overflow-hidden',
    'rounded-md border border-field-line bg-bg px-3 py-2.5',
    'text-left text-note leading-snug text-text [overflow-wrap:anywhere]',
    'cursor-pointer press focus-ring active:bg-surface-raised',
    'disabled:cursor-not-allowed disabled:text-muted',
].join(' ');

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
        <section className="mb-1 max-h-[40dvh] overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface px-2.5 py-2" aria-label="Saved replies">
            {lines.length === 0 && (
                <p className="mt-0 mb-2 text-md text-muted">
                    No saved replies yet. Save a draft here, or add them in Settings or the Story editor&apos;s Style tab.
                </p>
            )}
            {GROUPS.map(({ scope, heading }) => {
                const group = lines.filter((line) => line.scope === scope);
                if (group.length === 0) return null;
                return (
                    <div key={scope} role="group" aria-label={heading}>
                        {/* h2 under the page's h1, the Chat's title (audit M12). */}
                        <h2 className={`mt-0 mb-1 ${LABEL_CAPS}`}>{heading}</h2>
                        <ul className="m-0 mb-2 flex list-none flex-col gap-2 p-0">
                            {group.map((line) => (
                                <li key={line.id}>
                                    <button
                                        type="button"
                                        className={LINE}
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
            <div className="flex flex-wrap items-center gap-2 text-md text-muted" role="group" aria-label="Save this draft">
                <span className="mr-auto">Save this draft</span>
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
