'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

import { Sheet } from '@/components/sheet/sheet';
import { ConfirmButton } from '@/components/story-editor/fields';
import { RewriteRequest } from '@/lib/story';
import { AppliedChange } from '@/lib/story-assistant';
import styles from './story-assistant.module.css';
import { AssistantEntry, fieldOf, StoryAssistant, TrackedChange } from './use-story-assistant';

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

/** One change, as a link to its field while the field is there: a removal has none, nor an undone addition. */
function ChangeLink({ item, onShow }: { item: TrackedChange; onShow(field: RewriteRequest): void }) {
    const label = changeLabel(item.change);
    const field = fieldOf(item.change);
    const gone = item.change.kind === 'add' && item.undo.kind === 'undone';
    if (!field || gone) return <span className={styles.changeLabel}>{label}</span>;
    return (
        <button type="button" className={styles.changeLink} onClick={() => onShow(field)}>
            {label}
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
            </svg>
        </button>
    );
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

interface EntryProps {
    entry: AssistantEntry;
    assistant: StoryAssistant;
    onShow(field: RewriteRequest): void;
}

function Entry({ entry, assistant, onShow }: EntryProps) {
    switch (entry.kind) {
        case 'instruction':
            return (
                <li className={`${styles.entry} ${styles.you}`}>
                    <p className={styles.speaker}>You</p>
                    <p className={styles.text}>{entry.text}</p>
                </li>
            );
        case 'busy':
            return (
                <li className={styles.entry} role="status">
                    <p className="muted">{entry.what === 'thinking' ? 'Thinking…' : 'Applying…'}</p>
                </li>
            );
        case 'error':
            return (
                <li className={styles.entry}>
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
                <li className={styles.entry}>
                    <p className={styles.speaker}>Assistant</p>
                    {entry.reply && <p className={styles.text}>{entry.reply}</p>}
                    {entry.cancelled ? (
                        <p className="muted">Not applied.</p>
                    ) : (
                        <div className={styles.confirmRemovals} role="group" aria-label="Confirm removals">
                            <p>
                                This would remove {entry.pending.removals.join(' and ')}. Removing a Character deletes its
                                starting Bonds, and in every Chat its Bonds, Arc steps, Arc directions and Known-by entries,
                                along with its Reference image; past lines keep its name. A Chat on a removed Scene moves to
                                the next one. Apply these changes?
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
                <li className={styles.entry}>
                    <p className={styles.speaker}>Assistant</p>
                    {entry.reply && <p className={styles.text}>{entry.reply}</p>}
                    {entry.changes.length === 0 ? (
                        <p className="muted">No changes.</p>
                    ) : (
                        <ul className={styles.changes} aria-label="Changes">
                            {entry.changes.map((item, index) => (
                                <li key={index}>
                                    <ChangeLink item={item} onShow={onShow} />
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
 * The assistant as a half-height sheet over the Story editor (spec: "Story assistant", and
 * Friendly UI's "Story editor"). It is modeless: the editor stays in use above it. It opens
 * empty every time: the current Story is its only context, and each instruction is one call.
 * Changes land in the editor as soon as the answer does, lit up, each with its Undo here and
 * a link back to its field (`onShow`).
 */
export function StoryAssistantSheet({ assistant, onShow }: { assistant: StoryAssistant; onShow(field: RewriteRequest): void }) {
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
        <Sheet label="Assistant" title="Assistant" onClose={assistant.closeSheet} modeless>
            <div className={styles.body}>
                {assistant.entries.length === 0 && (
                    <p className={styles.hint}>
                        Say what to change, e.g. &quot;give Mira a sister&quot; or &quot;add Scenes&quot;. Changes land in the
                        editor at once, each with an Undo here. It starts fresh every time you open it.
                    </p>
                )}
                <ol className={styles.transcript} aria-label="Conversation" ref={transcript}>
                    {assistant.entries.map((entry) => (
                        <Entry key={entry.id} entry={entry} assistant={assistant} onShow={onShow} />
                    ))}
                </ol>
                <form className={styles.composer} onSubmit={submit}>
                    <label htmlFor="assistant-instruction" className="visually-hidden">
                        Instruction
                    </label>
                    <textarea
                        id="assistant-instruction"
                        rows={2}
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
            </div>
        </Sheet>
    );
}
