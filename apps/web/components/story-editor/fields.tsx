'use client';

import { ReactNode, useId, useState } from 'react';

interface TextFieldProps {
    label: string;
    value: string;
    onChange(value: string): void;
    multiline?: boolean;
    rows?: number;
    hint?: string;
    placeholder?: string;
}

export function TextField({ label, value, onChange, multiline, rows, hint, placeholder }: TextFieldProps) {
    const id = useId();
    const hintId = `${id}-hint`;
    return (
        <div className="field">
            <label htmlFor={id}>{label}</label>
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
        </div>
    );
}

interface SelectFieldProps<T extends string> {
    label: string;
    value: T;
    options: Record<T, string>;
    onChange(value: T): void;
}

export function SelectField<T extends string>({ label, value, options, onChange }: SelectFieldProps<T>) {
    const id = useId();
    return (
        <div className="field">
            <label htmlFor={id}>{label}</label>
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
