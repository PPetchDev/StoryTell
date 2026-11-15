'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

import { TEXT_BOX } from '@/components/chat/chat-classes';
import { Sheet } from '@/components/sheet/sheet';
import { CUE_MAX } from '@/lib/chat';

interface CueSheetProps {
    /** The Cue set now; empty for none. */
    cue: string;
    /** The newest reply can be written again now: offers "Again with this Cue". */
    canAgain: boolean;
    /** Keeps the Cue for the next reply (Send, Continue, Retry or Again); empty clears it. */
    onSet(cue: string): void;
    /** ↺ Again at once, with this Cue. */
    onAgain(cue: string): void;
    onClose(): void;
}

/**
 * The Cue (CONTEXT.md): a few words to the Narrator for the next reply only, such as "make her
 * angrier" or "skip to the next morning". It rides on the next turn and is never part of the
 * story. The box stops at the API's cap, so a longer paste is cut there.
 */
export function CueSheet({ cue, canAgain, onSet, onAgain, onClose }: CueSheetProps) {
    const [value, setValue] = useState(cue);
    const input = useRef<HTMLInputElement>(null);
    // In an effect, after the Sheet's own: the Sheet notes what had focus (the Cue button, to give it back) and
    // takes focus for its panel as it opens, so autoFocus would both lose that note and lose the caret.
    useEffect(() => {
        input.current?.focus();
    }, []);
    const text = value.trim();
    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (text === '') return;
        // Enter keeps it for the next reply; "Again with this Cue" is its own button.
        const again = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('name') === 'again';
        if (again) onAgain(text);
        else onSet(text);
    };
    return (
        <Sheet label="Cue the Narrator" onClose={onClose}>
            <form className="grid gap-3 px-1 pb-1" onSubmit={submit}>
                <h2 className="m-0 text-lg">Cue the Narrator</h2>
                <p id="cue-hint" className="-mt-1 mb-0 text-md text-muted">
                    A few words for the next reply only. It goes with your next Send, Continue or Again, and is never part of the story.
                </p>
                <input
                    ref={input}
                    type="text"
                    className={TEXT_BOX}
                    aria-label="Cue"
                    aria-describedby="cue-hint cue-count"
                    placeholder="e.g. make her angrier, or skip to the next morning"
                    value={value}
                    maxLength={CUE_MAX}
                    enterKeyHint="done"
                    onChange={(event) => setValue(event.target.value)}
                />
                <span id="cue-count" className="-mt-2 justify-self-end text-sm text-muted tabular-nums">
                    {value.length} / {CUE_MAX}
                </span>
                <button type="submit" name="set" className="button w-full" disabled={text === ''}>
                    Use for the next reply
                </button>
                {canAgain && (
                    <button type="submit" name="again" className="button button-quiet w-full" disabled={text === ''}>
                        Again with this Cue
                    </button>
                )}
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" className="button button-quiet" disabled={cue === ''} onClick={() => onSet('')}>
                        Clear
                    </button>
                    <button type="button" className="button button-quiet" onClick={onClose}>
                        Cancel
                    </button>
                </div>
            </form>
        </Sheet>
    );
}
