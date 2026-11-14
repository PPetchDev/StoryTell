'use client';

import { useEffect, useRef, useState } from 'react';

import type { Autosave } from '@/components/story-editor/autosave';
import { ConfirmButton, TextField } from '@/components/story-editor/fields';
import { SavedReply, SavedReplyStore } from '@/lib/saved-replies';
import { ADD_BUTTON } from './list-parts';

/** The focus key that sends focus to Add, once the last card is removed. */
const ADD_FOCUS = '__add';

interface Card {
    /** Stable for the card's life, so a draft keeps its box when it gets its id. */
    key: string;
    /** Null until a draft's first save answers. */
    id: number | null;
    text: string;
    error: string | null;
}

const BLANK = 'A Saved reply needs some text.';

let nextDraft = 0;

/**
 * A list of Saved replies, app-wide or a Story's (.scratch/saved-replies-and-replace-rules/spec.md:
 * "Management UI"): one text box each, autosaved, with Remove, and "Add saved reply" at the end.
 * A new card is saved once it holds some text; a blank box isn't sent and says why.
 */
export function SavedReplyList({ initial, store, autosave, saveKey }: {
    initial: SavedReply[];
    store: SavedReplyStore;
    autosave: Autosave;
    /** Prefixes this list's autosave keys, so two lists on a page never replace each other's edits. */
    saveKey: string;
}) {
    const [cards, setCards] = useState<Card[]>(() => initial.map((line) => ({ key: `line-${line.id}`, id: line.id, text: line.text, error: null })));
    /** Each card's id once saved, read when its next save runs, so a draft is added once and then edited. */
    const ids = useRef(new Map(initial.map((line) => [`line-${line.id}`, line.id])));
    const [focusKey, setFocusKey] = useState<string | null>(null);
    const list = useRef<HTMLDivElement>(null);
    const addButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (focusKey === null) return;
        if (focusKey === ADD_FOCUS) addButton.current?.focus();
        else list.current?.querySelector<HTMLElement>(`[data-card="${focusKey}"] textarea`)?.focus();
        setFocusKey(null);
    }, [focusKey]);

    const patch = (key: string, fields: Partial<Card>) =>
        setCards((current) => current.map((card) => (card.key === key ? { ...card, ...fields } : card)));

    const change = (key: string, text: string) => {
        const field = `${saveKey}.${key}`;
        if (text.trim() === '') {
            autosave.cancel(field);
            patch(key, { text, error: ids.current.has(key) ? BLANK : null });
            return;
        }
        patch(key, { text, error: null });
        autosave.queue<SavedReply[]>(
            field,
            () => {
                const id = ids.current.get(key);
                return id === undefined ? store.add(text) : store.update(id, text);
            },
            (lines) => {
                if (ids.current.has(key)) return;
                // A new line goes last in its scope.
                const added = lines[lines.length - 1];
                ids.current.set(key, added.id);
                patch(key, { id: added.id });
            },
            (message) => patch(key, { error: message }),
        );
    };

    // After pending edits, so a draft whose first save is still on its way is removed once it has its id.
    const remove = (key: string) => {
        // Where focus lands once it is gone, chosen now and moved once the card has left the page:
        // a frame after the remove may still find it there (a flaky focus, 2026-11-14).
        const index = cards.findIndex((card) => card.key === key);
        const after = cards[index + 1] ?? cards[index - 1];
        return autosave.commit<SavedReply[] | null>(
            async () => {
                const id = ids.current.get(key);
                return id === undefined ? null : store.remove(id);
            },
            () => {
                ids.current.delete(key);
                setCards((current) => current.filter((card) => card.key !== key));
                setFocusKey(after ? after.key : ADD_FOCUS);
            },
        );
    };

    /** Where focus goes once a line is removed: the next line's box, the one before it, or Add (audit M50). */
    const focusAfterRemove = (index: number) => () => {
        // Still there: the remove failed, and focus goes back to its button.
        if (list.current?.querySelector(`[data-card="${cards[index].key}"]`)) return null;
        // Gone already: the list moves focus itself once it has re-rendered (remove), so this lands the same.
        const next = cards[index + 1] ?? cards[index - 1];
        return (next && list.current?.querySelector<HTMLElement>(`[data-card="${next.key}"] textarea`)) || addButton.current;
    };

    const add = () => {
        const key = `draft-${nextDraft++}`;
        setCards((current) => [...current, { key, id: null, text: '', error: null }]);
        setFocusKey(key);
    };

    return (
        <div ref={list}>
            {cards.map((card, index) => (
                <div key={card.key} data-card={card.key} className="mb-2 grid gap-1">
                    <TextField
                        label={`Saved reply ${index + 1}`}
                        value={card.text}
                        multiline
                        rows={1}
                        error={card.error}
                        onChange={(text) => change(card.key, text)}
                    />
                    <div className="flex justify-end">
                        {/* Asks first, as every other delete does (audit H3). */}
                        <ConfirmButton
                            label="Remove"
                            ariaLabel={`Remove saved reply ${index + 1}`}
                            question={`Remove saved reply ${index + 1}?`}
                            confirmLabel="Remove"
                            danger
                            onConfirm={() => remove(card.key)}
                            focusAfter={focusAfterRemove(index)}
                        />
                    </div>
                </div>
            ))}
            <button ref={addButton} type="button" className={ADD_BUTTON} onClick={add}>
                + Add saved reply
            </button>
        </div>
    );
}
