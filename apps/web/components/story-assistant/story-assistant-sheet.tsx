'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef } from 'react';

import { ChevronRightIcon } from '@/components/icons';
import { Sheet } from '@/components/sheet/sheet';
import { ConfirmButton, FIELD_INPUT } from '@/components/story-editor/fields';
import { RewriteRequest } from '@/lib/story';
import { AppliedChange } from '@/lib/story-assistant';
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

/** A change that links to its field: a soft chip, a full finger tall. */
const CHANGE_LINK = [
    'bare-button inline-flex min-h-11 min-w-0 items-center gap-1 rounded-full border border-accent-line bg-accent-soft py-1 pr-2 pl-3',
    'text-left font-semibold [overflow-wrap:anywhere] text-text',
    'press focus-ring',
].join(' ');

/** One change, as a link to its field while the field is there: a removal has none, nor an undone addition. */
function ChangeLink({ item, onShow }: { item: TrackedChange; onShow(field: RewriteRequest): void }) {
    const label = changeLabel(item.change);
    const field = fieldOf(item.change);
    const gone = item.change.kind === 'add' && item.undo.kind === 'undone';
    if (!field || gone) return <span className="font-semibold">{label}</span>;
    return (
        <button type="button" className={CHANGE_LINK} onClick={() => onShow(field)}>
            {label}
            <ChevronRightIcon size={16} className="flex-none text-muted" />
        </button>
    );
}

/** The Undo control of one change, or why there is none. */
function UndoControl({ item, place, onUndo }: { item: TrackedChange; place: number; onUndo(): void }) {
    const { change, undo } = item;
    if (change.kind === 'remove') return <span className="muted">Can&apos;t be undone</span>;
    if (undo.kind === 'undone') return <span className="muted">Undone</span>;
    if (undo.kind === 'undoing') return <span className="muted">Undoing…</span>;
    const needsConfirm = change.kind === 'add' && change.target !== 'startingBond';
    return (
        <>
            {needsConfirm ? (
                // Removing a Character or Scene asks first, as the Remove button on its card does.
                <ConfirmButton
                    label="Undo"
                    ariaLabel={`Undo change ${place}`}
                    question={`Remove ${change.label} again?`}
                    confirmLabel="Remove"
                    onConfirm={onUndo}
                />
            ) : (
                <button type="button" className="button button-quiet button-small" aria-label={`Undo change ${place}`} onClick={onUndo}>
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

const ENTRY = 'border-t border-line pt-2 first:border-t-0 first:pt-0 [&_p]:m-0';
const SPEAKER = 'text-sm font-bold tracking-wide uppercase';

/**
 * "This would remove … Apply these changes?": the question takes focus on Cancel, the safe choice,
 * the moment it appears, so it is read out and not missed (audit H11).
 */
function ConfirmRemovals({ entry, assistant }: { entry: Extract<AssistantEntry, { kind: 'pending' }>; assistant: StoryAssistant }) {
    const cancel = useRef<HTMLButtonElement>(null);
    const questionId = `removals-${entry.id}`;
    useEffect(() => {
        cancel.current?.focus();
    }, []);
    return (
        <div
            className="mt-2 rounded-sm border border-warning-line bg-warning-surface px-3 py-2.5 [&_p]:mb-2"
            role="group"
            aria-label="Confirm removals"
            aria-describedby={questionId}
        >
            <p id={questionId}>
                This would remove {entry.pending.removals.join(' and ')}. Removing a Character deletes its starting Bonds, and in every
                Chat its Bonds, Arc steps, Arc directions and Known-by entries, along with its Reference image; past lines keep its name.
                A Chat on a removed Scene moves to the next one. Apply these changes?
            </p>
            <div className="toolbar">
                <button type="button" className="button button-danger" onClick={() => assistant.confirmPending(entry.id, entry.pending)}>
                    Apply
                </button>
                <button ref={cancel} type="button" className="button button-quiet" onClick={() => assistant.cancelPending(entry.id)}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

function Entry({ entry, assistant, onShow }: EntryProps) {
    switch (entry.kind) {
        case 'instruction':
            return (
                <li className={ENTRY}>
                    <p className={`${SPEAKER} text-muted`}>You</p>
                    <p className="whitespace-pre-wrap">{entry.text}</p>
                </li>
            );
        case 'busy':
            return (
                <li className={ENTRY}>
                    <p className="muted">{entry.what === 'thinking' ? 'Thinking…' : 'Applying…'}</p>
                </li>
            );
        case 'error':
            return (
                <li className={ENTRY}>
                    <p role="alert" className="field-error flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="min-w-0 flex-1 basis-48">Couldn&apos;t apply: {entry.message}</span>
                        <button type="button" className="button button-quiet" onClick={entry.retry}>
                            Retry
                        </button>
                    </p>
                </li>
            );
        case 'pending':
            return (
                <li className={ENTRY}>
                    <p className={`${SPEAKER} text-accent`}>Assistant</p>
                    {entry.reply && <p className="whitespace-pre-wrap">{entry.reply}</p>}
                    {entry.cancelled ? <p className="muted">Not applied.</p> : <ConfirmRemovals entry={entry} assistant={assistant} />}
                </li>
            );
        case 'answer':
            return (
                <li className={ENTRY}>
                    <p className={`${SPEAKER} text-accent`}>Assistant</p>
                    {entry.reply && <p className="whitespace-pre-wrap">{entry.reply}</p>}
                    {entry.changes.length === 0 ? (
                        <p className="muted">No changes.</p>
                    ) : (
                        <ul className="m-0 mt-2 grid list-none gap-1.5 p-0" aria-label="Changes">
                            {entry.changes.map((item, index) => (
                                <li key={index} className="flex flex-wrap items-center justify-between gap-2 text-note">
                                    <ChangeLink item={item} onShow={onShow} />
                                    <UndoControl item={item} place={index + 1} onUndo={() => assistant.undo(entry.id, index, item.change)} />
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
 *
 * The transcript is a log, so answers are read out as they land (audit H11); the box stays
 * focused while an instruction runs (read-only, not disabled); Enter sends only once an input
 * method has finished composing (M15); and Escape in a box with an instruction typed doesn't
 * close the sheet, nor does closing it lose that instruction (M19).
 */
export function StoryAssistantSheet({ assistant, onShow }: { assistant: StoryAssistant; onShow(field: RewriteRequest): void }) {
    const { instruction, setInstruction } = assistant;
    const transcript = useRef<HTMLOListElement>(null);

    useEffect(() => {
        transcript.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
    }, [assistant.entries]);

    const submit = (event: FormEvent | KeyboardEvent) => {
        event.preventDefault();
        if (assistant.busy || instruction.trim() === '') return;
        assistant.send(instruction);
        setInstruction('');
    };

    const cannotSend = assistant.busy || instruction.trim() === '';
    return (
        <Sheet label="Assistant" title="Assistant" onClose={assistant.closeSheet} modeless>
            <div className="flex min-h-0 flex-1 flex-col gap-2">
                {assistant.entries.length === 0 && (
                    <p className="m-0 flex-none text-md text-muted">
                        Say what to change, e.g. &quot;give Mira a sister&quot; or &quot;add Scenes&quot;. Changes land in the editor at once,
                        each with an Undo here. It starts fresh every time you open it.
                    </p>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="log" aria-live="polite" aria-label="Assistant answers">
                    <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Conversation" ref={transcript}>
                        {assistant.entries.map((entry) => (
                            <Entry key={entry.id} entry={entry} assistant={assistant} onShow={onShow} />
                        ))}
                    </ol>
                </div>
                <form className="flex flex-none items-end gap-2" onSubmit={submit}>
                    <label htmlFor="assistant-instruction" className="sr-only">
                        Instruction
                    </label>
                    <div className="grid min-w-0 flex-1 gap-1">
                        <textarea
                            id="assistant-instruction"
                            rows={2}
                            className={`${FIELD_INPUT} resize-none`}
                            value={instruction}
                            placeholder="What should change?"
                            readOnly={assistant.busy}
                            aria-describedby="assistant-keys"
                            onChange={(event) => setInstruction(event.target.value)}
                            onKeyDown={(event) => {
                                // Escape with words typed stays: the sheet would close over them (M19).
                                if (event.key === 'Escape' && instruction.trim() !== '') event.stopPropagation();
                                // Enter that ends an input method's composing picks the word; it doesn't send (M15).
                                const composing = event.nativeEvent.isComposing || event.keyCode === 229;
                                if (event.key === 'Enter' && !event.shiftKey && !composing) submit(event);
                            }}
                        />
                        <p id="assistant-keys" className="m-0 text-xs text-muted">
                            Enter sends · Shift+Enter for a new line
                        </p>
                    </div>
                    <button
                        type="submit"
                        className="button mb-5.5"
                        aria-disabled={cannotSend || undefined}
                        aria-busy={assistant.busy || undefined}
                        disabled={!assistant.busy && instruction.trim() === ''}
                    >
                        {assistant.busy ? 'Working…' : 'Send'}
                    </button>
                </form>
            </div>
        </Sheet>
    );
}
