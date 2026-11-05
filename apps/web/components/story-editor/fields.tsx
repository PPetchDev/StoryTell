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
function ChangedMark() {
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
}: TextFieldProps) {
    const ownId = useId();
    const id = domId ?? ownId;
    const hintId = `${id}-hint`;
    const neededId = `${id}-needed`;
    const busy = rewrite?.kind === 'busy';
    const { needed, flashed } = useFieldMarks(domId);
    const grow = useAutoGrow(value);
    const describedBy = [needed && neededId, hint && hintId].filter(Boolean).join(' ');
    // While a rewrite runs, its answer replaces the field: typing then would be lost.
    const shared = {
        id,
        value,
        placeholder,
        readOnly: busy,
        'aria-describedby': describedBy || undefined,
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
}

/**
 * A choice of a few, as tap-to-pick segments (spec: story 64). It is a radio group, so the
 * arrow keys move the choice as in any radio group.
 */
export function SegmentedField<T extends string>({ label, value, options, onChange, hint, highlighted }: SegmentedFieldProps<T>) {
    const id = useId();
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
        <div className={classes(styles.field, highlighted && styles.marked)}>
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
