'use client';

import { FormEvent, KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

import { TEXT_BOX } from '@/components/chat/chat-classes';
import { Sheet } from '@/components/sheet/sheet';
import { ChatItem, ITEM_HOLDER_MAX, ITEM_HOW_MAX, ITEM_NAME_MAX, ItemChange, ItemEnd, ITEMS_MAX, USER_HOLDER } from '@/lib/chat';

interface ItemsSheetProps {
    /** The Chat's Items, held and gone, in the order first recorded. */
    items: readonly ChatItem[];
    /** The Story's Characters by name, who can hold an Item. */
    characters: readonly string[];
    /** Sets, ends or deletes the user's own Item. Answers an error to show, or null once saved. */
    onSave(change: ItemChange): Promise<string | null>;
    onClose(): void;
}

/** A select in a Chat sheet: 44px or more, the field's edge. */
const SELECT = 'min-h-11 w-full min-w-0 rounded-md border border-field-line bg-bg px-2.5 py-2 font-[inherit] text-base text-text focus-ring';
/** The holder select's choice for anyone or anywhere not the user or a Character. */
const ELSEWHERE = '__elsewhere';
const STILL_HELD = 'held';

const END_WORDS: Record<ItemEnd, string> = { used: 'Used up', lost: 'Lost', destroyed: 'Destroyed' };

/** "You have it", "Nara has it", or "Held by the innkeeper". */
function holderLine(item: ChatItem, characters: readonly string[]): string {
    if (item.holder === USER_HOLDER) return 'You have it';
    if (characters.includes(item.holder)) return `${item.holder} has it`;
    return item.holder ? `Held by ${item.holder}` : 'No one has it';
}

/**
 * The Items sheet (.scratch/story-items/spec.md): the things that matter in this Chat, who has
 * each and how it came to them, and the ones gone. The Narrator keeps to them. The Judge records
 * them as the story shows them change hands; here the user changes who has one, marks one gone,
 * adds one or deletes one, and no Again or edit of a reply takes that away.
 */
export function ItemsSheet({ items, characters, onSave, onClose }: ItemsSheetProps) {
    // One Item open for editing at a time, by its name.
    const [editing, setEditing] = useState<string | null>(null);
    const held = items.filter((item) => item.end === null);
    const gone = items.filter((item) => item.end !== null);
    const row = (item: ChatItem) => (
        <ItemRow
            key={item.name}
            item={item}
            characters={characters}
            editing={editing === item.name}
            onEdit={(on) => setEditing(on ? item.name : null)}
            onSave={onSave}
        />
    );
    return (
        <Sheet label="Items" onClose={onClose}>
            <div className="grid gap-3 px-1 pb-1" data-items-sheet>
                <h2 className="m-0 text-lg">Items</h2>
                <p className="-mt-1 mb-0 text-md text-muted">
                    The things that matter in this Chat, who has each and how it came to them. The Narrator keeps to them. They change as the story shows them
                    change hands; you can fix them here.
                </p>
                {held.length === 0 ? (
                    <p className="m-0 text-md text-muted">No one holds anything yet. Items are added as the story shows them, or you can add one below.</p>
                ) : (
                    <ul className="m-0 grid list-none gap-2 p-0" aria-label="Held items">
                        {held.map(row)}
                    </ul>
                )}
                {gone.length > 0 && (
                    <>
                        <h3 className="m-0 text-md font-semibold">Gone</h3>
                        <ul className="m-0 grid list-none gap-2 p-0" aria-label="Gone items">
                            {gone.map(row)}
                        </ul>
                    </>
                )}
                {held.length < ITEMS_MAX ? (
                    <AddItem characters={characters} onSave={onSave} />
                ) : (
                    <p className="m-0 text-md text-muted">A Chat keeps at most {ITEMS_MAX} items held. Delete one or mark it gone to add another.</p>
                )}
            </div>
        </Sheet>
    );
}

/** Escape leaves a form, not the sheet: React listens on the document, as the sheet does, and was added first. */
function leaveOnEscape(event: KeyboardEvent, leave: () => void) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    leave();
}

/** Who has it: You, a Character, or someone or somewhere else in a few words. */
function HolderField({
    id,
    characters,
    choice,
    other,
    onChoice,
    onOther,
}: {
    id: string;
    characters: readonly string[];
    choice: string;
    other: string;
    onChoice(value: string): void;
    onOther(value: string): void;
}) {
    return (
        <>
            <label htmlFor={`${id}-who`} className="grid gap-1 text-sm text-muted">
                Who has it
            </label>
            <select id={`${id}-who`} className={`${SELECT} -mt-1`} value={choice} onChange={(event) => onChoice(event.target.value)}>
                <option value={USER_HOLDER}>You</option>
                {characters.map((name) => (
                    <option key={name} value={name}>
                        {name}
                    </option>
                ))}
                <option value={ELSEWHERE}>Someone or somewhere else</option>
            </select>
            {choice === ELSEWHERE && (
                <label className="grid gap-1 text-sm text-muted">
                    Who or where
                    <input
                        type="text"
                        className={TEXT_BOX}
                        placeholder="the innkeeper"
                        value={other}
                        maxLength={ITEM_HOLDER_MAX}
                        onChange={(event) => onOther(event.target.value)}
                    />
                </label>
            )}
        </>
    );
}

/** The holder select's starting choice and its other text, for a holder as stored. */
function holderChoice(holder: string, characters: readonly string[]): { choice: string; other: string } {
    if (holder === USER_HOLDER || holder === '') return { choice: USER_HOLDER, other: '' };
    if (characters.includes(holder)) return { choice: holder, other: '' };
    return { choice: ELSEWHERE, other: holder };
}

function ItemRow({
    item,
    characters,
    editing,
    onEdit,
    onSave,
}: {
    item: ChatItem;
    characters: readonly string[];
    editing: boolean;
    onEdit(on: boolean): void;
    onSave(change: ItemChange): Promise<string | null>;
}) {
    const id = useId();
    const [choice, setChoice] = useState(USER_HOLDER);
    const [other, setOther] = useState('');
    const [how, setHow] = useState(item.how);
    const [state, setState] = useState<string>(item.end ?? STILL_HELD);
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
        const initial = holderChoice(item.holder, characters);
        setChoice(initial.choice);
        setOther(initial.other);
        setHow(item.how);
        setState(item.end ?? STILL_HELD);
        setError(null);
        onEdit(true);
    };
    const save = async (change: ItemChange) => {
        setSaving(true);
        setError(null);
        const failed = await onSave(change);
        setSaving(false);
        if (failed === null) onEdit(false);
        else setError(failed);
    };
    const holder = choice === ELSEWHERE ? other : choice;
    const ready = state !== STILL_HELD || holder.trim() !== '';

    if (!editing) {
        return (
            <li className="flex items-start gap-2 rounded-lg bg-surface-raised px-3.5 py-2.5" data-item>
                <div className="min-w-0 flex-1">
                    <p className="m-0 font-semibold leading-normal [overflow-wrap:anywhere]">{item.name}</p>
                    <p className="m-0 text-md [overflow-wrap:anywhere]">
                        {item.end === null ? holderLine(item, characters) : END_WORDS[item.end]}
                        {item.how && <span className="text-muted"> · {item.how}</span>}
                    </p>
                    {item.byUser && <p className="m-0 text-xs text-muted">You set this</p>}
                </div>
                <button ref={editButton} type="button" className="button button-quiet button-small shrink-0" aria-label={`Edit ${item.name}`} onClick={start}>
                    Edit
                </button>
            </li>
        );
    }

    return (
        <li className="rounded-lg bg-surface-raised px-3.5 py-3" data-item>
            <form
                className="grid gap-2"
                aria-label={`Edit ${item.name}`}
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!ready) return;
                    void save({ name: item.name, holder, how, end: state === STILL_HELD ? null : (state as ItemEnd) });
                }}
                onKeyDown={(event) => leaveOnEscape(event, () => onEdit(false))}
            >
                <p className="m-0 font-semibold [overflow-wrap:anywhere]">{item.name}</p>
                <label htmlFor={`${id}-state`} className="text-sm text-muted">
                    State
                </label>
                <select id={`${id}-state`} className={`${SELECT} -mt-1`} value={state} onChange={(event) => setState(event.target.value)} autoFocus>
                    <option value={STILL_HELD}>Still here</option>
                    <option value="used">Used up</option>
                    <option value="lost">Lost</option>
                    <option value="destroyed">Destroyed</option>
                </select>
                <HolderField id={id} characters={characters} choice={choice} other={other} onChoice={setChoice} onOther={setOther} />
                <label className="grid gap-1 text-sm text-muted">
                    {state === STILL_HELD ? 'How they came by it' : 'How it ended'}
                    <input type="text" className={TEXT_BOX} value={how} maxLength={ITEM_HOW_MAX} enterKeyHint="done" onChange={(event) => setHow(event.target.value)} />
                </label>
                {error && (
                    <p className="turn-error m-0 text-md" role="alert">
                        {error}
                    </p>
                )}
                <button type="submit" className="button w-full" disabled={saving || !ready}>
                    Save
                </button>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        className="button button-quiet"
                        disabled={saving}
                        aria-label={`Delete ${item.name}`}
                        onClick={() => void save({ name: item.name, remove: true })}
                    >
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

function AddItem({ characters, onSave }: { characters: readonly string[]; onSave(change: ItemChange): Promise<string | null> }) {
    const id = useId();
    const [name, setName] = useState('');
    const [choice, setChoice] = useState(USER_HOLDER);
    const [other, setOther] = useState('');
    const [how, setHow] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const nameBox = useRef<HTMLInputElement>(null);
    const holder = choice === ELSEWHERE ? other : choice;
    const ready = name.trim() !== '' && holder.trim() !== '';

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!ready) return;
        setSaving(true);
        setError(null);
        const failed = await onSave({ name, holder, how, end: null });
        setSaving(false);
        if (failed !== null) return setError(failed);
        setName('');
        setHow('');
        setOther('');
        setChoice(USER_HOLDER);
        nameBox.current?.focus();
    };

    return (
        <form className="grid gap-2 border-t border-line pt-3" aria-label="Add an item" onSubmit={(event) => void submit(event)}>
            <h3 className="m-0 text-md font-semibold">Add an item</h3>
            <label className="grid gap-1 text-sm text-muted">
                Item
                <input
                    ref={nameBox}
                    type="text"
                    className={TEXT_BOX}
                    placeholder="the brass key"
                    value={name}
                    maxLength={ITEM_NAME_MAX}
                    enterKeyHint="next"
                    onChange={(event) => setName(event.target.value)}
                />
            </label>
            <HolderField id={id} characters={characters} choice={choice} other={other} onChoice={setChoice} onOther={setOther} />
            <label className="grid gap-1 text-sm text-muted">
                How they came by it
                <input
                    type="text"
                    className={TEXT_BOX}
                    placeholder="found in the well"
                    value={how}
                    maxLength={ITEM_HOW_MAX}
                    enterKeyHint="done"
                    onChange={(event) => setHow(event.target.value)}
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
