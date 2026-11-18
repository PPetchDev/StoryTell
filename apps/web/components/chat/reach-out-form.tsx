'use client';

import { useId, useState } from 'react';

import { ApiError } from '@/lib/api';
import { REACH_OUT_CHOICES, reachOutApi, ReachOutHours } from '@/lib/reach-out';

/**
 * "Characters message first" in place of the Chat menu's rows (.scratch/reach-outs/spec.md): Off,
 * or after 6, 12 or 24 hours away, as radio buttons. Each choice saves at once; the sheet stays
 * open, and its Done goes back to the menu.
 */
export function ReachOutForm({
    storyId,
    chatId,
    hours,
    onSaved,
    onDone,
}: {
    storyId: number;
    chatId: number;
    /** The setting as last read; undefined while it is still being read. */
    hours: ReachOutHours | undefined;
    onSaved(hours: ReachOutHours): void;
    onDone(): void;
}) {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hintId = useId();
    const name = useId();

    const choose = async (next: ReachOutHours) => {
        if (next === hours || saving) return;
        setSaving(true);
        setError(null);
        try {
            const saved = await reachOutApi.set(storyId, chatId, next);
            onSaved(saved.afterHours);
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : "Couldn't save that. Try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="grid gap-3 px-1 pb-1">
            <h2 className="m-0 text-lg">Characters message first</h2>
            <p id={hintId} className="-mt-1 mb-0 text-md text-muted">
                When you have been away from this Chat that long, the Character closest to you sends you a short message of their own, once, and your phone shows it if
                alerts are on. Never from 22:00 to 08:00.
            </p>
            <div role="radiogroup" aria-label="Characters message first" aria-describedby={hintId} aria-busy={saving || hours === undefined} className="grid gap-1">
                {REACH_OUT_CHOICES.map((choice) => {
                    const checked = hours === choice.hours;
                    return (
                        <label
                            key={choice.label}
                            className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 font-semibold press has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                                checked ? 'border-accent-fill bg-accent-soft text-text' : 'border-field-line text-text'
                            }`}
                        >
                            <input
                                type="radio"
                                name={name}
                                className="size-5 shrink-0 accent-[var(--color-accent-fill)]"
                                checked={checked}
                                disabled={saving || hours === undefined}
                                onChange={() => void choose(choice.hours)}
                            />
                            <span className="min-w-0 flex-1">{choice.label}</span>
                        </label>
                    );
                })}
            </div>
            {error && (
                <p role="alert" className="turn-error">
                    {error}
                </p>
            )}
            <button type="button" className="button button-quiet w-full" onClick={onDone}>
                Done
            </button>
        </div>
    );
}
