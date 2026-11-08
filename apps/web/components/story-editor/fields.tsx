'use client';

import { KeyboardEvent, ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { focusChoice, movedIndex } from './arrow-keys';
import { useFieldMarks } from './field-marks';
import { RewriteState } from './rewrite';
import { SparkleIcon } from './sparkle-icon';
import styles from './fields.module.css';

function classes(...names: Array<string | false | undefined>): string {
    return names.filter(Boolean).join(' ');
}

/**
 * Keeps a textarea as tall as its text (spec: story 62), so nothing is clipped and the page,
 * not the box, scrolls. It refits when the text changes, when the box gets wider or narrower,
 * and when the fonts finish loading.
 */
function useAutoGrow(value: string) {
    const ref = useRef<HTMLTextAreaElement>(null);
    const fit = useCallback(() => {
        const box = ref.current;
        if (!box) return;
        // Collapsing the box for a moment can shorten the page; keep the reader where they are.
        const scrollY = window.scrollY;
        box.style.height = 'auto';
        const borders = box.offsetHeight - box.clientHeight;
        box.style.height = `${box.scrollHeight + borders}px`;
        if (window.scrollY !== scrollY) window.scrollTo({ top: scrollY });
    }, []);

    useLayoutEffect(fit, [fit, value]);

    useEffect(() => {
        const box = ref.current;
        if (!box) return;
        let width = box.clientWidth;
        const observer = new ResizeObserver(() => {
            if (box.clientWidth === width) return;
            width = box.clientWidth;
            fit();
        });
        observer.observe(box);
        void document.fonts?.ready.then(fit);
        return () => observer.disconnect();
    }, [fit]);

    return ref;
}

/** The mark on a field the assistant changed. Text, so it reads without colour. */
export function ChangedMark() {
    return <span className={styles.changed}>changed by the assistant</span>;
}

/** The ✨ in a field's label row: rewrites just this field, and spins while it runs. */
function RewriteButton({ label, busy, onRewrite }: { label: string; busy: boolean; onRewrite(): void }) {
    return (
        // Named by `title`, not aria-label, so the field's own label stays unique.
        <button
            type="button"
            className={classes(styles.rewrite, busy && styles.busy)}
            title={`Rewrite ${label}`}
            aria-busy={busy}
            disabled={busy}
            onClick={onRewrite}
        >
            <SparkleIcon size={18} />
        </button>
    );
}

interface TextFieldProps {
    label: string;
    value: string;
    onChange(value: string): void;
    multiline?: boolean;
    /** The height of an empty multiline box, in lines; it grows with its text. */
    rows?: number;
    /** One plain line on what the field is for (spec: story 61). */
    hint?: string;
    placeholder?: string;
    /** The input's DOM id, so a missing item can jump to it; it also keys the field's marks. */
    domId?: string;
    /** With this, the field gets a ✨ that regenerates just this field (ticket 22). */
    onRewrite?(): void;
    rewrite?: RewriteState;
    /** The assistant changed this field and the change has not been undone (ticket 23). */
    highlighted?: boolean;
    /** Why the API refused what is typed, shown under the field (a Lore pattern that doesn't compile). */
    error?: string | null;
}

export function TextField({
    label,
    value,
    onChange,
    multiline,
    rows,
    hint,
    placeholder,
    domId,
    onRewrite,
    rewrite,
    highlighted,
    error,
}: TextFieldProps) {
    const ownId = useId();
    const id = domId ?? ownId;
    const hintId = `${id}-hint`;
    const neededId = `${id}-needed`;
    const errorId = `${id}-error`;
    const busy = rewrite?.kind === 'busy';
    const { needed, flashed } = useFieldMarks(domId);
    const grow = useAutoGrow(value);
    const describedBy = [needed && neededId, error && errorId, hint && hintId].filter(Boolean).join(' ');
    // While a rewrite runs, its answer replaces the field: typing then would be lost.
    const shared = {
        id,
        value,
        placeholder,
        readOnly: busy,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
    };
    return (
        <div
            className={classes(
                styles.field,
                highlighted && styles.marked,
                needed && styles.needed,
                flashed && styles.flash,
            )}
        >
            <div className={styles.head}>
                {/* The mark is beside the label, not in it, so the field's name stays its label. */}
                <span className={styles.label}>
                    <label htmlFor={id}>{label}</label>
                    {needed && (
                        <span id={neededId} className={styles.neededMark}>
                            Needed to play
                        </span>
                    )}
                </span>
                {highlighted && <ChangedMark />}
                {onRewrite && <RewriteButton label={label} busy={busy} onRewrite={onRewrite} />}
            </div>
            {multiline ? (
                <textarea
                    {...shared}
                    ref={grow}
                    rows={rows ?? 2}
                    className={styles.input}
                    onChange={(event) => onChange(event.target.value)}
                />
            ) : (
                <input {...shared} type="text" className={styles.input} onChange={(event) => onChange(event.target.value)} />
            )}
            {error && (
                <p id={errorId} role="alert" className={styles.error}>
                    {error}
                </p>
            )}
            {hint && (
                <p id={hintId} className={styles.hint}>
                    {hint}
                </p>
            )}
            {rewrite?.kind === 'error' && (
                <p role="alert" className={styles.error}>
                    <span>Couldn&apos;t rewrite {label}: {rewrite.message}</span>{' '}
                    <button type="button" className="button button-quiet button-small" onClick={onRewrite}>
                        Retry
                    </button>
                </p>
            )}
        </div>
    );
}

interface SegmentedFieldProps<T extends string> {
    label: string;
    value: T;
    options: Record<T, string>;
    onChange(value: T): void;
    hint?: string;
    highlighted?: boolean;
    /** The field's id, so a link can land on it and light it. */
    domId?: string;
}

/**
 * A choice of a few, as tap-to-pick segments (spec: story 64). It is a radio group, so the
 * arrow keys move the choice as in any radio group.
 */
export function SegmentedField<T extends string>({
    label,
    value,
    options,
    onChange,
    hint,
    highlighted,
    domId,
}: SegmentedFieldProps<T>) {
    const id = useId();
    const { flashed } = useFieldMarks(domId);
    const keys = Object.keys(options) as T[];
    const chosen = keys.indexOf(value);
    const group = useRef<HTMLDivElement>(null);
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const next = movedIndex(event, chosen, keys.length);
        if (next === null) return;
        event.preventDefault();
        onChange(keys[next]);
        focusChoice(group.current, '[role="radio"]', next);
    };
    return (
        <div id={domId} className={classes(styles.field, highlighted && styles.marked, flashed && styles.flash)}>
            <div className={styles.head}>
                <span id={`${id}-label`} className={styles.label}>
                    {label}
                </span>
                {highlighted && <ChangedMark />}
            </div>
            <div
                ref={group}
                className={styles.segmented}
                role="radiogroup"
                aria-labelledby={`${id}-label`}
                aria-describedby={hint ? `${id}-hint` : undefined}
                onKeyDown={onKeyDown}
            >
                {keys.map((key, index) => (
                    <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={key === value}
                        // One stop in the Tab order: the chosen segment, or the first if none is.
                        tabIndex={index === Math.max(chosen, 0) ? 0 : -1}
                        onClick={() => onChange(key)}
                    >
                        {options[key]}
                    </button>
                ))}
            </div>
            {hint && (
                <p id={`${id}-hint`} className={styles.hint}>
                    {hint}
                </p>
            )}
        </div>
    );
}

interface ConfirmButtonProps {
    label: string;
    question: string;
    confirmLabel: string;
    onConfirm(): void;
    danger?: boolean;
    disabled?: boolean;
    /** What the action deletes beyond the obvious, shown under the question while it asks. */
    warning?: string;
}

/** A destructive action that asks first, in place, without a browser dialog. */
export function ConfirmButton({ label, question, confirmLabel, onConfirm, danger, disabled, warning }: ConfirmButtonProps) {
    const [asking, setAsking] = useState(false);
    if (!asking) {
        return (
            <button
                type="button"
                className={danger ? 'button button-danger' : 'button button-quiet'}
                onClick={() => setAsking(true)}
                disabled={disabled}
            >
                {label}
            </button>
        );
    }
    return (
        <span className="confirm" role="group" aria-label={question}>
            <span>{question}</span>
            {warning && <span className="confirm-warning">{warning}</span>}
            <button
                type="button"
                className="button button-danger"
                onClick={() => {
                    setAsking(false);
                    onConfirm();
                }}
            >
                {confirmLabel}
            </button>
            <button type="button" className="button button-quiet" onClick={() => setAsking(false)}>
                Cancel
            </button>
        </span>
    );
}

interface OrderButtonsProps {
    index: number;
    count: number;
    what: string;
    onMove(direction: -1 | 1): void;
}

export function OrderButtons({ index, count, what, onMove }: OrderButtonsProps) {
    return (
        <>
            <button
                type="button"
                className="button button-quiet"
                aria-label={`Move ${what} up`}
                disabled={index === 0}
                onClick={() => onMove(-1)}
            >
                ↑
            </button>
            <button
                type="button"
                className="button button-quiet"
                aria-label={`Move ${what} down`}
                disabled={index === count - 1}
                onClick={() => onMove(1)}
            >
                ↓
            </button>
        </>
    );
}

export function Toolbar({ children }: { children: ReactNode }) {
    return <div className="toolbar">{children}</div>;
}

interface NumberFieldProps {
    label: string;
    value: number;
    /** Sent only for a whole number in range; anything else stays as typed, with an error. */
    onChange(value: number): void;
    min: number;
    max: number;
    /** The unit after the box, e.g. "Messages" or "%". */
    unit: string;
    hint?: string;
    domId?: string;
    highlighted?: boolean;
}

/** A whole number in a range, with its unit beside the box (a Lore entry's Stays for, Chance). */
export function NumberField({ label, value, onChange, min, max, unit, hint, domId, highlighted }: NumberFieldProps) {
    const ownId = useId();
    const id = domId ?? ownId;
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;
    const { flashed } = useFieldMarks(domId);
    const [text, setText] = useState(String(value));
    const [error, setError] = useState<string | null>(null);
    // Follows the stored number when it changes from elsewhere; what is typed stays while it means the same.
    useEffect(() => {
        setText((typed) => (Number(typed) === value && typed.trim() !== '' ? typed : String(value)));
        setError(null);
    }, [value]);
    const change = (typed: string) => {
        setText(typed);
        const number = Number(typed);
        if (typed.trim() === '' || !Number.isInteger(number) || number < min || number > max) {
            setError(`A whole number from ${min} to ${max}.`);
            return;
        }
        setError(null);
        if (number !== value) onChange(number);
    };
    const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ');
    return (
        <div className={classes(styles.field, highlighted && styles.marked, flashed && styles.flash)}>
            <div className={styles.head}>
                <span className={styles.label}>
                    <label htmlFor={id}>{label}</label>
                </span>
                {highlighted && <ChangedMark />}
            </div>
            <div className={styles.numberRow}>
                <input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={min}
                    max={max}
                    step={1}
                    value={text}
                    className={classes(styles.input, styles.number)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy || undefined}
                    onChange={(event) => change(event.target.value)}
                />
                <span className={styles.unit}>{unit}</span>
            </div>
            {error && (
                <p id={errorId} role="alert" className={styles.error}>
                    {error}
                </p>
            )}
            {hint && (
                <p id={hintId} className={styles.hint}>
                    {hint}
                </p>
            )}
        </div>
    );
}
