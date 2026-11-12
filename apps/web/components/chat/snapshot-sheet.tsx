'use client';

import { FormEvent, useState } from 'react';

import { TEXT_BOX } from '@/components/chat/chat-classes';
import { ChevronDownIcon } from '@/components/icons';
import { Sheet } from '@/components/sheet/sheet';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { SnapshotPrompt, withEditedText } from '@/lib/snapshot';


/** A labelled field: the words above, the box below. */
const FIELD = 'grid gap-1.5 text-sm text-muted';
const NOTE = 'm-0 text-md text-muted';

/** The API's out of image credit code. */
const OUT_OF_IMAGE_CREDIT = '402.001.004';

type Step =
    | { kind: 'hint' }
    | { kind: 'writing' }
    | { kind: 'failed'; message: string }
    | { kind: 'reading'; prompt: SnapshotPrompt; text: string };

interface SnapshotSheetProps {
    /** Image credit is used up: the sheet says so and takes nothing. */
    imageCreditOut: boolean;
    /** A retake's hint, to start from. */
    initialHint?: string;
    /** A retake's Message; the latest AI Message when left out. */
    messageId?: number;
    /** Writes the Snapshot prompt; it throws what went wrong. */
    write(hint: string, messageId?: number): Promise<SnapshotPrompt>;
    /** Draws the Snapshot prompt as the user left it. */
    onDraw(prompt: SnapshotPrompt, text: string): void;
    onClose(): void;
}

/** A failed write in plain words: never a provider's name or a code. */
function failureMessage(error: unknown): string {
    if (error instanceof ApiError && error.code === OUT_OF_IMAGE_CREDIT) return 'Snapshots are off: image credit is used up. Play goes on.';
    if (error instanceof ApiUnreachableError) return "Couldn't reach the app to write the Snapshot prompt.";
    return "Couldn't write the Snapshot prompt.";
}

/**
 * 📷 in the action row opens this (spec: "Snapshot sheet"): an optional hint, then the
 * Snapshot prompt, written for the user to read and edit before anything is drawn
 * (.scratch/snapshot-prompt-review/spec.md). Draw Snapshot closes it at once; the placeholder
 * in the thread shows the Snapshot being made. Closing it any other way throws the prompt away.
 */
export function SnapshotSheet({ imageCreditOut, initialHint = '', messageId, write, onDraw, onClose }: SnapshotSheetProps) {
    const [hint, setHint] = useState(initialHint);
    const [step, setStep] = useState<Step>({ kind: 'hint' });

    const writePrompt = async () => {
        if (imageCreditOut || step.kind === 'writing') return;
        setStep({ kind: 'writing' });
        try {
            const prompt = await write(hint, messageId);
            setStep({ kind: 'reading', prompt, text: prompt.text });
        } catch (caught) {
            setStep({ kind: 'failed', message: failureMessage(caught) });
        }
    };

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        // Only Draw Snapshot pays for a picture: Enter in the hint writes the prompt (again).
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        if (step.kind !== 'reading' || submitter?.getAttribute('name') !== 'draw') {
            void writePrompt();
            return;
        }
        if (step.text.trim() === '') return;
        onDraw(step.prompt, step.text);
        onClose();
    };

    const reading = step.kind === 'reading' ? step : null;
    return (
        <Sheet label="Take a Snapshot" onClose={onClose}>
            <form className="grid gap-3 px-1 pb-1" onSubmit={submit}>
                <h2 className="m-0 text-lg">Take a Snapshot</h2>
                <p className="-mt-1 mb-0 text-md text-muted">
                    {reading
                        ? 'Read what will be drawn, and change it if you like. Nothing is drawn until you press Draw Snapshot.'
                        : 'A Snapshot of this moment, seen through your eyes. You read its prompt before it is drawn.'}
                </p>
                <label className={FIELD}>
                    <span>Hint (optional)</span>
                    <input
                        type="text"
                        // Holds the words on show (audit L10).
                        aria-label="Snapshot hint (optional)"
                        className={TEXT_BOX}
                        placeholder="e.g. close-up on her face"
                        maxLength={300}
                        value={hint}
                        disabled={imageCreditOut || step.kind === 'writing'}
                        onChange={(event) => setHint(event.target.value)}
                    />
                </label>
                {imageCreditOut && (
                    <p className={NOTE} role="status">
                        Snapshots are off: image credit is used up. Play goes on.
                    </p>
                )}

                {step.kind === 'writing' && (
                    <p className={NOTE} role="status">
                        Writing the prompt…
                    </p>
                )}

                {step.kind === 'failed' && (
                    <div className="m-0 flex flex-wrap items-center gap-2 text-md" role="alert">
                        <span>{step.message}</span>
                        <button type="button" className="button button-quiet button-small" onClick={() => void writePrompt()}>
                            Try again
                        </button>
                    </div>
                )}

                {reading && (
                    <>
                        <label className={FIELD}>
                            <span>What will be drawn</span>
                            <textarea
                                // Holds the words on show (audit L10).
                                aria-label="What will be drawn: the Snapshot prompt"
                                className={`${TEXT_BOX} resize-y leading-[1.45]`}
                                rows={6}
                                maxLength={2000}
                                value={reading.text}
                                onChange={(event) => setStep({ ...reading, text: event.target.value })}
                            />
                        </label>
                        <p className={NOTE}>
                            {reading.prompt.inFrame.length > 0
                                ? `In frame: ${reading.prompt.inFrame.map((character) => character.name).join(', ')}`
                                : 'Nobody in frame'}
                        </p>
                        <details className="group text-sm text-muted">
                            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
                                {/* Its own chevron: a flex summary loses the browser's marker. */}
                                <ChevronDownIcon size={16} className="shrink-0 -rotate-90 group-open:rotate-0 motion-safe:transition-transform motion-safe:duration-fast" />
                                Everything the image model gets
                            </summary>
                            <p className="mt-0 mb-2">
                                Your view, each Character&apos;s Appearance and the art style are always added around what you read above.
                            </p>
                            <pre
                                // A box that scrolls: named, and reachable from the keyboard.
                                role="region"
                                tabIndex={0}
                                aria-label="Whole image prompt"
                                className="m-0 max-h-56 overflow-auto rounded-md border border-line bg-bg px-3 py-2.5 font-[inherit] whitespace-pre-wrap text-text [overflow-wrap:anywhere]"
                            >{withEditedText(reading.prompt, reading.text)}</pre>
                        </details>
                        <button type="submit" name="draw" className="button w-full" disabled={imageCreditOut || reading.text.trim() === ''}>
                            Draw Snapshot
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" className="button button-quiet" onClick={() => void writePrompt()}>
                                Write again
                            </button>
                            <button type="button" className="button button-quiet" onClick={onClose}>
                                Cancel
                            </button>
                        </div>
                    </>
                )}

                {!reading && step.kind !== 'failed' && (
                    <button type="submit" className="button w-full" disabled={imageCreditOut || step.kind === 'writing'}>
                        Write the prompt
                    </button>
                )}
            </form>
        </Sheet>
    );
}
