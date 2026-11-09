'use client';

import { useEffect, useId, useRef, useState } from 'react';

import type { Autosave } from '@/components/story-editor/autosave';
import { OrderButtons, TextField } from '@/components/story-editor/fields';
import editorStyles from '@/components/story-editor/story-editor.module.css';
import { regexCompileError, ReplaceRule, ReplaceRuleFields, ReplaceRuleStore } from '@/lib/replace-rules';
import styles from './replace-rules.module.css';
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
    const result = useTryRule(runnable ? { find: fields.find, replace: fields.replace, regex: fields.regex, ignoreCase: fields.ignoreCase } : null, sample);
    return (
        <div className={styles.tryIt}>
            <TextField label="Try it" value={sample} multiline rows={1} placeholder="Type a sample sentence" onChange={setSample} />
            <div className={styles.tryResult} role="status" aria-label="Try it result" id={outputId}>
                {result.status === 'done' && <span className={styles.tryOutput}>{result.output}</span>}
                {result.status === 'slow' && <span className={styles.trySlow}>This pattern is too slow</span>}
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
        if (problem !== null) {
            autosave.cancel(autosaveKey);
            // A new card with nothing in Find yet has nothing to say.
            patch(card.key, { fields, error: fields.find === '' && !ids.current.has(card.key) ? null : problem });
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
    const remove = (key: string) => {
        void autosave.commit<ReplaceRule[] | null>(
            async () => {
                const id = ids.current.get(key);
                return id === undefined ? null : store.remove(id);
            },
            () => {
                ids.current.delete(key);
                setCards((current) => current.filter((card) => card.key !== key));
            },
        );
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
                    <section key={card.key} data-card={card.key} className={styles.rule} aria-label={`Replace rule ${number}`}>
                        <div className={styles.ruleHeader}>
                            <h3 className={styles.ruleTitle}>Rule {number}</h3>
                            <div className="toolbar">
                                <OrderButtons index={index} count={cards.length} what={`rule ${number}`} onMove={(direction) => move(index, direction)} />
                                <button type="button" className="button button-quiet button-small" onClick={() => remove(card.key)}>
                                    Remove
                                </button>
                            </div>
                        </div>
                        <TextField
                            label="Find"
                            value={card.fields.find}
                            multiline
                            rows={1}
                            hint={card.fields.regex ? 'A regular expression; use ( ) to capture and $1 in Replace.' : 'Found exactly as typed, spaces included.'}
                            error={card.error}
                            onChange={(find) => change(card, { find })}
                        />
                        <TextField
                            label="Replace"
                            value={card.fields.replace}
                            multiline
                            rows={1}
                            hint="Leave empty to remove what was found."
                            onChange={(replace) => change(card, { replace })}
                        />
                        <div className={styles.switches} role="group" aria-label="Rule switches">
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
            <button type="button" className={editorStyles.add} onClick={add}>
                + Add replace rule
            </button>
        </div>
    );
}
