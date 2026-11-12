'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { ADD_BUTTON } from '@/components/saved-replies/list-parts';
import type { Autosave } from '@/components/story-editor/autosave';
import { ConfirmButton, OrderButtons, TextField } from '@/components/story-editor/fields';
import { regexCompileError, ReplaceRule, ReplaceRuleFields, ReplaceRuleStore } from '@/lib/replace-rules';
import { useSettled } from '@/lib/use-settled';
import { useTryRule } from './use-try-rule';

interface Card {
    /** Stable for the card's life, so a draft keeps its fields when it gets its id. */
    key: string;
    fields: ReplaceRuleFields;
    /** Why what is typed isn't saved: the web's compile error, or the API's refusal. */
    error: string | null;
}

const NEW_RULE: ReplaceRuleFields = { find: '', replace: '', regex: false, ignoreCase: false, onAi: true, onMine: false };
const EMPTY_FIND = 'Find needs some text.';
/** A Find's own problem waits this long after the last keystroke, so it is not read out per letter (audit M22). */
const LOCAL_ERROR_DELAY_MS = 500;

const SWITCHES = [
    { field: 'regex', label: 'Regex' },
    { field: 'ignoreCase', label: 'Ignore case' },
    { field: 'onAi', label: 'On AI Messages' },
    { field: 'onMine', label: 'On my Messages' },
] as const;

let nextDraft = 0;

const fieldsOf = ({ id: _id, ...fields }: ReplaceRule): ReplaceRuleFields => fields;

/** The typed Find's own problem, if any: blank, or a regex that doesn't compile. Compiling never runs it. */
function localError(fields: ReplaceRuleFields): string | null {
    if (fields.find === '') return EMPTY_FIND;
    return fields.regex ? regexCompileError(fields.find, fields.ignoreCase) : null;
}

/** "Try it": a sample and what the rule as typed makes of it, worked out in a Web Worker. */
function TryIt({ fields, runnable }: { fields: ReplaceRuleFields; runnable: boolean }) {
    const [sample, setSample] = useState('');
    const outputId = useId();
    // Runs once the typing settles, so the result region speaks once, not per keystroke (audit L12).
    const rule = runnable ? JSON.stringify([fields.find, fields.replace, fields.regex, fields.ignoreCase]) : null;
    const settled = useSettled(JSON.stringify([rule, sample]), 250);
    const [settledRule, settledSample] = JSON.parse(settled) as [string | null, string];
    const typing = settledRule !== rule || settledSample !== sample;
    const logic = settledRule === null ? null : (JSON.parse(settledRule) as [string, string, boolean, boolean]);
    const result = useTryRule(logic && { find: logic[0], replace: logic[1], regex: logic[2], ignoreCase: logic[3] }, settledSample);
    return (
        <div className="border-t border-dashed border-line pt-2">
            <TextField
                label="Try it"
                value={sample}
                multiline
                rows={1}
                placeholder="Type a sample sentence"
                spellCheck={false}
                onChange={setSample}
            />
            <div
                className="max-h-40 min-h-[1.4em] overflow-y-auto text-note whitespace-pre-wrap [overflow-wrap:anywhere]"
                role="status"
                aria-label="Try it result"
                aria-busy={typing || result.status === 'running' || undefined}
                id={outputId}
            >
                {result.status === 'done' && <span className="text-text">{result.output}</span>}
                {result.status === 'slow' && <span className="font-semibold text-warning">This pattern is too slow</span>}
                {result.status === 'running' && <span className="muted">Trying…</span>}
            </div>
        </div>
    );
}

/**
 * A list of Replace rules, app-wide or a Story's (.scratch/saved-replies-and-replace-rules/spec.md:
 * "Management UI"). Each card autosaves; a Find that doesn't compile is shown at once and not sent,
 * and a save the API refuses shows its reason under Find, keeping what is typed while the last
 * saved version stays in force.
 */
export function ReplaceRuleList({ initial, store, autosave, saveKey }: {
    initial: ReplaceRule[];
    store: ReplaceRuleStore;
    autosave: Autosave;
    /** Prefixes this list's autosave keys, so two lists on a page never replace each other's edits. */
    saveKey: string;
}) {
    const [cards, setCards] = useState<Card[]>(() => initial.map((rule) => ({ key: `rule-${rule.id}`, fields: fieldsOf(rule), error: null })));
    /** Each card's id once saved, read when its next save runs, so a draft is added once and then edited. */
    const ids = useRef(new Map(initial.map((rule) => [`rule-${rule.id}`, rule.id])));
    const [focusKey, setFocusKey] = useState<string | null>(null);
    const list = useRef<HTMLDivElement>(null);
    const addButton = useRef<HTMLButtonElement>(null);
    /** A Find's own problem, waiting to be shown until the typing stops. */
    const errorTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    useEffect(() => {
        const timers = errorTimers.current;
        return () => timers.forEach(clearTimeout);
    }, []);

    useEffect(() => {
        if (focusKey === null) return;
        list.current?.querySelector<HTMLElement>(`[data-card="${focusKey}"] textarea`)?.focus();
        setFocusKey(null);
    }, [focusKey]);

    const patch = (key: string, next: Partial<Card>) =>
        setCards((current) => current.map((card) => (card.key === key ? { ...card, ...next } : card)));

    const change = (card: Card, changed: Partial<ReplaceRuleFields>) => {
        const fields = { ...card.fields, ...changed };
        const autosaveKey = `${saveKey}.${card.key}`;
        const problem = localError(fields);
        clearTimeout(errorTimers.current.get(card.key));
        if (problem !== null) {
            autosave.cancel(autosaveKey);
            patch(card.key, { fields });
            // A new card with nothing in Find yet has nothing to say.
            const shown = fields.find === '' && !ids.current.has(card.key) ? null : problem;
            errorTimers.current.set(card.key, setTimeout(() => patch(card.key, { error: shown }), LOCAL_ERROR_DELAY_MS));
            return;
        }
        patch(card.key, { fields, error: null });
        autosave.queue<ReplaceRule[]>(
            autosaveKey,
            () => {
                const id = ids.current.get(card.key);
                return id === undefined ? store.add(fields) : store.update(id, fields);
            },
            (rules) => {
                if (!ids.current.has(card.key)) {
                    // A new rule goes last in its scope.
                    ids.current.set(card.key, rules[rules.length - 1].id);
                }
            },
            (message) => patch(card.key, { error: message }),
        );
    };

    // After pending edits, so a draft whose first save is still on its way is removed once it has its id.
    const remove = (key: string) =>
        autosave.commit<ReplaceRule[] | null>(
            async () => {
                const id = ids.current.get(key);
                return id === undefined ? null : store.remove(id);
            },
            () => {
                ids.current.delete(key);
                setCards((current) => current.filter((card) => card.key !== key));
            },
        );

    /** Where focus goes once a rule is removed: the next rule's Find, the one before it, or Add (audit H2). */
    const focusAfterRemove = (index: number) => () => {
        // Still there: the remove failed, and focus goes back to its button.
        if (list.current?.querySelector(`[data-card="${cards[index].key}"]`)) return null;
        const next = cards[index + 1] ?? cards[index - 1];
        return (next && list.current?.querySelector<HTMLElement>(`[data-card="${next.key}"] textarea`)) || addButton.current;
    };

    const move = (index: number, direction: -1 | 1) => {
        const next = [...cards];
        [next[index], next[index + direction]] = [next[index + direction], next[index]];
        setCards(next);
        void autosave.commit<ReplaceRule[] | null>(async () => {
            const order = next.map((card) => ids.current.get(card.key)).filter((id): id is number => id !== undefined);
            return order.length < 2 ? null : store.reorder(order);
        }, () => {});
    };

    const add = () => {
        const key = `draft-${nextDraft++}`;
        setCards((current) => [...current, { key, fields: NEW_RULE, error: null }]);
        setFocusKey(key);
    };

    return (
        <div ref={list}>
            {cards.map((card, index) => {
                const number = index + 1;
                return (
                    <section
                        key={card.key}
                        data-card={card.key}
                        className="mb-3 rounded-lg border border-line px-3 pt-2.5 pb-3"
                        aria-label={`Replace rule ${number}`}
                    >
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                            <h3 className="m-0 text-note">Rule {number}</h3>
                            <div className="toolbar">
                                <OrderButtons index={index} count={cards.length} what={`rule ${number}`} onMove={(direction) => move(index, direction)} />
                                {/* Asks first, as every other delete does (audit H3), and says which rule (M11). */}
                                <ConfirmButton
                                    label="Remove"
                                    ariaLabel={`Remove rule ${number}`}
                                    question={`Remove rule ${number}?`}
                                    confirmLabel="Remove"
                                    danger
                                    onConfirm={() => remove(card.key)}
                                    focusAfter={focusAfterRemove(index)}
                                />
                            </div>
                        </div>
                        <TextField
                            label="Find"
                            value={card.fields.find}
                            multiline
                            rows={1}
                            hint={card.fields.regex ? 'A regular expression; use ( ) to capture and $1 in Replace.' : 'Found exactly as typed, spaces included.'}
                            error={card.error}
                            spellCheck={false}
                            autoCapitalize="off"
                            autoComplete="off"
                            onChange={(find) => change(card, { find })}
                        />
                        <TextField
                            label="Replace"
                            value={card.fields.replace}
                            multiline
                            rows={1}
                            hint="Leave empty to remove what was found."
                            spellCheck={false}
                            autoCapitalize="off"
                            autoComplete="off"
                            onChange={(replace) => change(card, { replace })}
                        />
                        <div className="mt-1 mb-2 flex flex-wrap gap-2" role="group" aria-label="Rule switches">
                            {SWITCHES.map(({ field, label }) => (
                                <label key={field} className="chip chip-pick">
                                    <input
                                        type="checkbox"
                                        checked={card.fields[field]}
                                        onChange={(event) => change(card, { [field]: event.target.checked })}
                                    />{' '}
                                    {label}
                                </label>
                            ))}
                        </div>
                        <TryIt fields={card.fields} runnable={localError(card.fields) === null} />
                    </section>
                );
            })}
            <button ref={addButton} type="button" className={ADD_BUTTON} onClick={add}>
                + Add replace rule
            </button>
        </div>
    );
}
