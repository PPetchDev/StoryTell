'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

import { ConfirmButton } from '@/components/story-editor/fields';
import { AppliedChange } from '@/lib/story-assistant';
import { AssistantEntry, StoryAssistant, TrackedChange } from './use-story-assistant';

function changeLabel(change: AppliedChange): string {
    switch (change.kind) {
        case 'set':
            return change.label;
        case 'add':
            return `Added ${change.label}`;
        case 'remove':
            return `Removed ${change.label}`;
    }
}

/** The Undo control of one change, or why there is none. */
function UndoControl({ item, onUndo }: { item: TrackedChange; onUndo(): void }) {
    const { change, undo } = item;
    if (change.kind === 'remove') return <span className="muted">Can&apos;t be undone</span>;
    if (undo.kind === 'undone') return <span className="muted">Undone</span>;
    if (undo.kind === 'undoing') return <span className="muted">Undoing…</span>;
    const needsConfirm = change.kind === 'add' && change.target !== 'startingBond';
    return (
        <>
            {needsConfirm ? (
                // Removing a Character or Scene asks first, as the Remove button on its card does.
                <ConfirmButton label="Undo" question={`Remove ${change.label} again?`} confirmLabel="Remove" onConfirm={onUndo} />
            ) : (
                <button type="button" className="button button-quiet button-small" onClick={onUndo}>
                    Undo
                </button>
            )}
            {undo.kind === 'error' && (
                <span role="alert" className="field-error">
                    Couldn&apos;t undo: {undo.message}
                </span>
            )}
        </>
    );
}

function Entry({ entry, assistant }: { entry: AssistantEntry; assistant: StoryAssistant }) {
    switch (entry.kind) {
        case 'instruction':
            return (
                <li className="assistant-entry assistant-you">
                    <p className="speaker">You</p>
                    <p className="assistant-text">{entry.text}</p>
                </li>
            );
        case 'busy':
            return (
                <li className="assistant-entry" role="status">
                    <p className="muted">{entry.what === 'thinking' ? 'Thinking…' : 'Applying…'}</p>
                </li>
            );
        case 'error':
            return (
                <li className="assistant-entry">
                    <p role="alert" className="field-error">
                        <span>Couldn&apos;t apply: {entry.message}</span>{' '}
                        <button type="button" className="button button-quiet button-small" onClick={entry.retry}>
                            Retry
                        </button>
                    </p>
                </li>
            );
        case 'pending':
            return (
                <li className="assistant-entry">
                    <p className="speaker">Assistant</p>
                    {entry.reply && <p className="assistant-text">{entry.reply}</p>}
                    {entry.cancelled ? (
                        <p className="muted">Not applied.</p>
                    ) : (
                        <div className="confirm-removals" role="group" aria-label="Confirm removals">
                            <p>
                                This would remove {entry.pending.removals.join(' and ')}. Removing a Character also removes their
                                starting Bonds. Apply these changes?
                            </p>
                            <div className="toolbar">
                                <button type="button" className="button button-danger" onClick={() => assistant.confirmPending(entry.id, entry.pending)}>
                                    Apply
                                </button>
                                <button type="button" className="button button-quiet" onClick={() => assistant.cancelPending(entry.id)}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </li>
            );
        case 'answer':
            return (
                <li className="assistant-entry">
                    <p className="speaker">Assistant</p>
                    {entry.reply && <p className="assistant-text">{entry.reply}</p>}
                    {entry.changes.length === 0 ? (
                        <p className="muted">No changes.</p>
                    ) : (
                        <ul className="assistant-changes" aria-label="Changes">
                            {entry.changes.map((item, index) => (
                                <li key={index}>
                                    <span className="assistant-change-label">{changeLabel(item.change)}</span>
                                    <UndoControl item={item} onUndo={() => assistant.undo(entry.id, index, item.change)} />
                                </li>
                            ))}
                        </ul>
                    )}
                </li>
            );
    }
}

/**
 * The assistant beside the Story form (spec: "Story assistant"). It opens empty every time:
 * the current Story is its only context, and each instruction is one call. Changes land in
 * the form as soon as the answer does, lit up, each with its Undo here.
 */
export function StoryAssistantPanel({ assistant }: { assistant: StoryAssistant }) {
    const [instruction, setInstruction] = useState('');
    const transcript = useRef<HTMLOListElement>(null);

    useEffect(() => {
        transcript.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
    }, [assistant.entries]);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (assistant.busy || instruction.trim() === '') return;
        assistant.send(instruction);
        setInstruction('');
    };

    return (
        <aside className="assistant card" aria-label="Assistant">
            <div className="card-header">
                <h2>Assistant</h2>
                <button type="button" className="button button-quiet button-small" onClick={assistant.closePanel}>
                    Close
                </button>
            </div>
            <p className="hint">
                Say what to change, e.g. &quot;give Mira a sister&quot; or &quot;add Scenes&quot;. Changes land in the form at once;
                each has an Undo here while this page is open. It starts fresh every time you open it.
            </p>
            <ol className="assistant-transcript" aria-label="Conversation" ref={transcript}>
                {assistant.entries.map((entry) => (
                    <Entry key={entry.id} entry={entry} assistant={assistant} />
                ))}
            </ol>
            <form className="assistant-composer" onSubmit={submit}>
                <label htmlFor="assistant-instruction" className="visually-hidden">
                    Instruction
                </label>
                <textarea
                    id="assistant-instruction"
                    rows={3}
                    value={instruction}
                    placeholder="What should change?"
                    disabled={assistant.busy}
                    onChange={(event) => setInstruction(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) submit(event);
                    }}
                />
                <button type="submit" className="button" disabled={assistant.busy || instruction.trim() === ''}>
                    {assistant.busy ? 'Working…' : 'Send'}
                </button>
            </form>
        </aside>
    );
}
