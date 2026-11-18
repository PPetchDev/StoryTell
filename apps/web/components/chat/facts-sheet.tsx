'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

import { TEXT_BOX } from '@/components/chat/chat-classes';
import { Sheet } from '@/components/sheet/sheet';
import { ChatFact, FACT_TEXT_MAX, FACT_TOPIC_MAX, FACTS_MAX } from '@/lib/chat';

interface FactsSheetProps {
    /** The Chat's Established facts, in the order their topics were first set. */
    facts: readonly ChatFact[];
    /** Sets the user's own fact for a topic; an empty fact deletes it. Answers an error to show, or null once saved. */
    onSave(topic: string, fact: string): Promise<string | null>;
    onClose(): void;
}

/**
 * The Facts panel (.scratch/facts-panel/spec.md): the Chat's Established facts, which the Narrator
 * keeps to. Each can be edited in place (its telling; the topic stays) or deleted, and a new one
 * added at the foot. What the user writes is theirs: no Again or edit of a reply takes it away,
 * and a reply that tells it differently does not change it.
 */
export function FactsSheet({ facts, onSave, onClose }: FactsSheetProps) {
    // One fact open for editing at a time, by its topic.
    const [editing, setEditing] = useState<string | null>(null);
    return (
        <Sheet label="Established facts" onClose={onClose}>
            <div className="grid gap-3 px-1 pb-1" data-facts-sheet>
                <h2 className="m-0 text-lg">Established facts</h2>
                <p className="-mt-1 mb-0 text-md text-muted">
                    What is true in this Chat: numbers, ages, how long, dates, names and who is whose. The Narrator keeps to them. A reply never changes one; what
                    you write here or say in a message does.
                </p>
                {facts.length === 0 ? (
                    <p className="m-0 text-md text-muted">None yet. They are added as the story states them, or you can add one below.</p>
                ) : (
                    <ul className="m-0 grid list-none gap-2 p-0" aria-label="Facts">
                        {facts.map((entry) => (
                            <FactRow
                                key={entry.topic}
                                entry={entry}
                                editing={editing === entry.topic}
                                onEdit={(on) => setEditing(on ? entry.topic : null)}
                                onSave={onSave}
                            />
                        ))}
                    </ul>
                )}
                {facts.length < FACTS_MAX ? (
                    <AddFact onSave={onSave} />
                ) : (
                    <p className="m-0 text-md text-muted">A Chat keeps at most {FACTS_MAX} facts. Delete one to add another.</p>
                )}
            </div>
        </Sheet>
    );
}

function FactRow({
    entry,
    editing,
    onEdit,
    onSave,
}: {
    entry: ChatFact;
    editing: boolean;
    onEdit(on: boolean): void;
    onSave(topic: string, fact: string): Promise<string | null>;
}) {
    const [value, setValue] = useState(entry.fact);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const editButton = useRef<HTMLButtonElement>(null);
    const wasEditing = useRef(false);
    // Closing the form gives focus back to its Edit button.
    useEffect(() => {
        if (wasEditing.current && !editing) editButton.current?.focus();
        wasEditing.current = editing;
    }, [editing]);

    const start = () => {
        setValue(entry.fact);
        setError(null);
        onEdit(true);
    };
    const save = async (fact: string) => {
        setSaving(true);
        setError(null);
        const failed = await onSave(entry.topic, fact);
        setSaving(false);
        if (failed === null) onEdit(false);
        else setError(failed);
    };

    if (!editing) {
        return (
            <li className="flex items-start gap-2 rounded-lg bg-surface-raised px-3.5 py-2.5" data-fact>
                <div className="min-w-0 flex-1">
                    <p className="m-0 text-sm font-semibold text-muted [overflow-wrap:anywhere]">{entry.topic}</p>
                    <p className="m-0 leading-normal [overflow-wrap:anywhere]">{entry.fact}</p>
                    {entry.byUser && <p className="m-0 text-xs text-muted">You set this</p>}
                </div>
                <button ref={editButton} type="button" className="button button-quiet button-small shrink-0" aria-label={`Edit ${entry.topic}`} onClick={start}>
                    Edit
                </button>
            </li>
        );
    }

    const id = `fact-${encodeURIComponent(entry.topic)}`;
    return (
        <li className="rounded-lg bg-surface-raised px-3.5 py-3" data-fact>
            <form
                className="grid gap-2"
                aria-label={`Edit ${entry.topic}`}
                onSubmit={(event) => {
                    event.preventDefault();
                    if (value.trim() !== '') void save(value);
                }}
                onKeyDown={(event) => {
                    // Escape leaves the edit, not the sheet. React listens on the document, as the sheet does, and
                    // its listener was added first: stopping the rest there keeps the sheet's from closing it.
                    if (event.key !== 'Escape') return;
                    event.stopPropagation();
                    event.nativeEvent.stopImmediatePropagation();
                    onEdit(false);
                }}
            >
                <label htmlFor={id} className="text-sm font-semibold text-muted [overflow-wrap:anywhere]">
                    {entry.topic}
                </label>
                <input
                    id={id}
                    type="text"
                    className={TEXT_BOX}
                    aria-describedby={`${id}-count`}
                    value={value}
                    autoFocus
                    maxLength={FACT_TEXT_MAX}
                    enterKeyHint="done"
                    onChange={(event) => setValue(event.target.value)}
                />
                <span id={`${id}-count`} className="-mt-1 justify-self-end text-sm text-muted tabular-nums">
                    {value.length} / {FACT_TEXT_MAX}
                </span>
                {error && (
                    <p className="turn-error m-0 text-md" role="alert">
                        {error}
                    </p>
                )}
                <button type="submit" className="button w-full" disabled={saving || value.trim() === ''}>
                    Save
                </button>
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" className="button button-quiet" disabled={saving} aria-label={`Delete ${entry.topic}`} onClick={() => void save('')}>
                        Delete
                    </button>
                    <button type="button" className="button button-quiet" disabled={saving} onClick={() => onEdit(false)}>
                        Cancel
                    </button>
                </div>
            </form>
        </li>
    );
}

function AddFact({ onSave }: { onSave(topic: string, fact: string): Promise<string | null> }) {
    const [topic, setTopic] = useState('');
    const [fact, setFact] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const topicBox = useRef<HTMLInputElement>(null);
    const ready = topic.trim() !== '' && fact.trim() !== '';

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!ready) return;
        setSaving(true);
        setError(null);
        const failed = await onSave(topic, fact);
        setSaving(false);
        if (failed !== null) return setError(failed);
        setTopic('');
        setFact('');
        topicBox.current?.focus();
    };

    return (
        <form className="grid gap-2 border-t border-line pt-3" aria-label="Add a fact" onSubmit={(event) => void submit(event)}>
            <h3 className="m-0 text-md font-semibold">Add a fact</h3>
            <label className="grid gap-1 text-sm text-muted">
                Topic
                <input
                    ref={topicBox}
                    type="text"
                    className={TEXT_BOX}
                    placeholder="Nara's birthday"
                    value={topic}
                    maxLength={FACT_TOPIC_MAX}
                    enterKeyHint="next"
                    onChange={(event) => setTopic(event.target.value)}
                />
            </label>
            <label className="grid gap-1 text-sm text-muted">
                Fact
                <input
                    type="text"
                    className={TEXT_BOX}
                    placeholder="the first frost"
                    value={fact}
                    maxLength={FACT_TEXT_MAX}
                    enterKeyHint="done"
                    onChange={(event) => setFact(event.target.value)}
                />
            </label>
            {error && (
                <p className="turn-error m-0 text-md" role="alert">
                    {error}
                </p>
            )}
            <button type="submit" className="button w-full" disabled={saving || !ready}>
                Add
            </button>
        </form>
    );
}
