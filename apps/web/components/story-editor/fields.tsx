'use client';

import { ReactNode, useId, useState } from 'react';

import { RewriteState } from './rewrite';

interface TextFieldProps {
    label: string;
    value: string;
    onChange(value: string): void;
    multiline?: boolean;
    rows?: number;
    hint?: string;
    placeholder?: string;
    /** With this, the field gets a Rewrite button that regenerates just this field (ticket 22). */
    onRewrite?(): void;
    rewrite?: RewriteState;
    /** The assistant changed this field and the change has not been undone (ticket 23). */
    highlighted?: boolean;
}

/** The mark on a field the assistant changed. Text, so it reads without colour. */
function ChangedMark() {
    return <span className="changed-mark">changed by the assistant</span>;
}

export function TextField({
    label,
    value,
    onChange,
    multiline,
    rows,
    hint,
    placeholder,
    onRewrite,
    rewrite,
    highlighted,
}: TextFieldProps) {
    const id = useId();
    const hintId = `${id}-hint`;
    const busy = rewrite?.kind === 'busy';
    return (
        <div className={highlighted ? 'field field-changed' : 'field'}>
            <div className="field-head">
                <label htmlFor={id}>{label}</label>
                {highlighted && <ChangedMark />}
                {onRewrite && (
                    // Named by `title`, not aria-label, so the field's own label stays unique.
                    <button
                        type="button"
                        className="button button-quiet button-small"
                        title={`Rewrite ${label}`}
                        disabled={busy}
                        onClick={onRewrite}
                    >
                        {busy ? 'Rewriting…' : 'Rewrite'}
                    </button>
                )}
            </div>
            {multiline ? (
                <textarea
                    id={id}
                    value={value}
                    rows={rows ?? 4}
                    placeholder={placeholder}
                    aria-describedby={hint ? hintId : undefined}
                    onChange={(event) => onChange(event.target.value)}
                />
            ) : (
                <input
                    id={id}
                    type="text"
                    value={value}
                    placeholder={placeholder}
                    aria-describedby={hint ? hintId : undefined}
                    onChange={(event) => onChange(event.target.value)}
                />
            )}
            {hint && (
                <p id={hintId} className="hint">
                    {hint}
                </p>
            )}
            {rewrite?.kind === 'error' && (
                <p role="alert" className="field-error">
                    <span>Couldn&apos;t rewrite {label}: {rewrite.message}</span>{' '}
                    <button type="button" className="button button-quiet button-small" onClick={onRewrite}>
                        Retry
                    </button>
                </p>
            )}
        </div>
    );
}

interface SelectFieldProps<T extends string> {
    label: string;
    value: T;
    options: Record<T, string>;
    onChange(value: T): void;
    highlighted?: boolean;
}

export function SelectField<T extends string>({ label, value, options, onChange, highlighted }: SelectFieldProps<T>) {
    const id = useId();
    return (
        <div className={highlighted ? 'field field-changed' : 'field'}>
            <div className="field-head">
                <label htmlFor={id}>{label}</label>
                {highlighted && <ChangedMark />}
            </div>
            <select id={id} value={value} onChange={(event) => onChange(event.target.value as T)}>
                {(Object.keys(options) as T[]).map((key) => (
                    <option key={key} value={key}>
                        {options[key]}
                    </option>
                ))}
            </select>
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
}

/** A destructive action that asks first, in place, without a browser dialog. */
export function ConfirmButton({ label, question, confirmLabel, onConfirm, danger, disabled }: ConfirmButtonProps) {
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
