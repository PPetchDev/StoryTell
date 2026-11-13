'use client';

import { HTMLAttributes, KeyboardEvent, ReactNode, TextareaHTMLAttributes, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { announce } from '@/components/announcer';
import { ArrowDownIcon, ArrowUpIcon } from '@/components/icons';

import { focusChoice, movedIndex } from './arrow-keys';
import { useFieldMarks } from './field-marks';
import { RewriteState } from './rewrite';
import { SparkleIcon } from './sparkle-icon';

function classes(...names: Array<string | false | null | undefined>): string {
    return names.filter(Boolean).join(' ');
}

/*
 * The editor's field look (Friendly UI ticket 09), shared with the other fields in this folder:
 * a label row (label, marks, ✨), the box, then a one-line hint. Exported for the selects and
 * pickers beside TextField (VoiceField, BondLevelField, the gate pickers), so they all line up.
 */
/** A field: its label row, its box and its hint. A flash lights it for a moment and fades. */
export const FIELD = 'mb-4 grid min-w-0 gap-1 rounded-md last:mb-0 motion-safe:transition-[box-shadow,background-color] motion-safe:duration-base';
/** Lit for a moment after a jump to it or a rewrite of it. */
export const FIELD_FLASH = 'bg-accent-soft ring-6 ring-accent-line';
export const FIELD_HEAD = 'flex min-h-8 items-center gap-2';
export const FIELD_LABEL = 'flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-md font-bold text-muted';
export const FIELD_HINT = 'm-0 text-sm text-muted';
export const FIELD_ERROR = 'm-0 text-md text-warning';
/** An input, textarea or select without its width or edge colour: 44px tall (M40), the base focus ring (M2). */
export const INPUT_BOX = 'min-h-11 min-w-0 rounded-sm border bg-bg px-3 py-2 font-[inherit] text-base text-text';

/**
 * The box's edge: a 3:1 field line (H14); an accent edge and a soft ring once the assistant changed
 * it; dashed in the warning colour while it is empty and needed to play. One colour at a time, since
 * two colour utilities on one element are settled by the stylesheet's order, not the class list's.
 */
export function inputEdge({ needed, highlighted }: { needed?: boolean; highlighted?: boolean } = {}): string {
    if (highlighted) return 'border-accent ring-2 ring-accent-line';
    if (needed) return 'border-dashed border-warning-line';
    return 'border-field-line';
}

/** A full-width input, textarea or select, with its edge. */
export const FIELD_INPUT = `${INPUT_BOX} w-full ${inputEdge()}`;

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

/**
 * A one-line value in a box that wraps its long text onto more lines instead of running off the
 * edge (docs/ui-audit-2026-11-13.md, M9, M10): one line tall, it grows with its text, and Enter
 * adds no line break, nor does a paste (one becomes a space).
 */
const oneLine = {
    onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault();
    },
    text: (value: string) => value.replace(/\r?\n/g, ' '),
};

type WrappingLineProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'rows'> & {
    value: string;
    onChange(value: string): void;
};

/** A list item's one line (an example line) that wraps and grows: see oneLine. */
export function WrappingLine({ value, onChange, className, ...rest }: WrappingLineProps) {
    const grow = useAutoGrow(value);
    return (
        <textarea
            {...rest}
            ref={grow}
            rows={1}
            value={value}
            className={classes(className, 'resize-none overflow-hidden')}
            onKeyDown={oneLine.onKeyDown}
            onChange={(event) => onChange(oneLine.text(event.target.value))}
        />
    );
}

/** The mark on a field the assistant changed. Text, so it reads without colour. */
export function ChangedMark() {
    return <span className="text-xs font-semibold tracking-wide text-accent uppercase">changed by the assistant</span>;
}

/**
 * The marks beside a label: "Needed to play" while a required field is empty and the Story can't
 * be played without it; "Required" on a required field otherwise, so it shows before the first
 * save too (audit M20).
 */
function RequiredMark({ id, needed, required }: { id: string; needed: boolean; required?: boolean }) {
    if (needed) {
        return (
            <span id={id} className="rounded-full bg-warning-soft px-2 text-xs font-semibold text-warning">
                Needed to play
            </span>
        );
    }
    if (!required) return null;
    return <span className="text-xs font-medium text-muted">Required</span>;
}

/**
 * The ✨ Rewrite in a field's label row: rewrites just this field, and spins while it runs. The
 * word shows beside the icon, so a touch screen without tooltips says what it does (audit L40);
 * it is hidden from assistive tech, which reads the title, "Rewrite Setting", so the field's own
 * label stays the only one with its name. 44px to tap (H26). aria-disabled while it runs, so focus
 * stays on it (H12).
 */
function RewriteButton({ label, busy, onRewrite }: { label: string; busy: boolean; onRewrite(): void }) {
    return (
        <button
            type="button"
            className={classes(
                'bare-button -mr-2 flex min-h-11 min-w-11 flex-none items-center justify-center gap-1 rounded-full px-2',
                'text-sm font-semibold text-rewrite-text',
                'press focus-ring hover:bg-accent-soft active:bg-accent-soft aria-disabled:cursor-progress',
            )}
            title={`Rewrite ${label}`}
            aria-busy={busy}
            aria-disabled={busy || undefined}
            onClick={busy ? undefined : onRewrite}
        >
            <SparkleIcon size={18} className={busy ? 'motion-safe:animate-spin' : undefined} />
            <span aria-hidden="true">{busy ? 'Rewriting…' : 'Rewrite'}</span>
        </button>
    );
}

/** Says a rewrite landed (audit H12): the field was lit, which a screen reader can't see. */
function useRewriteDone(label: string, rewrite: RewriteState | undefined) {
    const wasBusy = useRef(false);
    useEffect(() => {
        const busy = rewrite?.kind === 'busy';
        if (wasBusy.current && !busy && rewrite === undefined) announce(`Rewrote ${label}.`);
        wasBusy.current = busy;
    }, [label, rewrite]);
}

interface TextFieldProps {
    label: string;
    value: string;
    onChange(value: string): void;
    multiline?: boolean;
    /**
     * A one-line value that may run long (an Image style, Keywords): its box wraps it onto more
     * lines rather than cutting it off (M10), and Enter adds no line. See oneLine.
     */
    wrap?: boolean;
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
    /** Needed before the Story can be played (audit M20): aria-required, and a mark beside the label. */
    required?: boolean;
    /**
     * What a one-line box holds, for the phone's keyboard (audit M39): 'url' for a link, 'search',
     * 'email'… Plain text when left out. A multiline box is always text.
     */
    type?: 'text' | 'url' | 'email' | 'search' | 'tel';
    inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
    /** false for what is not prose (a regex, a find-and-replace pattern, a URL): no red squiggles. */
    spellCheck?: boolean;
    /** 'off' for code-like text, so a phone doesn't capitalise its first letter. */
    autoCapitalize?: 'off' | 'none' | 'on' | 'sentences' | 'words' | 'characters';
    /** The browser's autofill hint; 'off' where its suggestions would only get in the way. */
    autoComplete?: string;
}

export function TextField({
    label,
    value,
    onChange,
    multiline,
    wrap,
    rows,
    hint,
    placeholder,
    domId,
    onRewrite,
    rewrite,
    highlighted,
    error,
    required,
    type = 'text',
    inputMode,
    spellCheck,
    autoCapitalize,
    autoComplete,
}: TextFieldProps) {
    const ownId = useId();
    const id = domId ?? ownId;
    const hintId = `${id}-hint`;
    const neededId = `${id}-needed`;
    const errorId = `${id}-error`;
    const rewriteErrorId = `${id}-rewrite-error`;
    const busy = rewrite?.kind === 'busy';
    const rewriteFailed = rewrite?.kind === 'error';
    const { needed, flashed } = useFieldMarks(domId);
    const grow = useAutoGrow(value);
    useRewriteDone(label, rewrite);
    const describedBy = [needed && neededId, error && errorId, rewriteFailed && rewriteErrorId, hint && hintId].filter(Boolean).join(' ');
    // While a rewrite runs, its answer replaces the field: typing then would be lost.
    const shared = {
        id,
        value,
        placeholder,
        readOnly: busy,
        'aria-required': required || undefined,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
        inputMode,
        spellCheck,
        autoCapitalize,
        autoComplete,
        className: classes(INPUT_BOX, 'w-full', inputEdge({ needed, highlighted }), (multiline || wrap) && 'resize-none overflow-hidden', busy && 'opacity-60'),
    };
    return (
        <div className={classes(FIELD, flashed && FIELD_FLASH)}>
            <div className={FIELD_HEAD}>
                {/* The marks are beside the label, not in it, so the field's name stays its label. */}
                <span className={FIELD_LABEL}>
                    <label htmlFor={id}>{label}</label>
                    <RequiredMark id={neededId} needed={needed} required={required} />
                </span>
                {highlighted && <ChangedMark />}
                {onRewrite && <RewriteButton label={label} busy={busy} onRewrite={onRewrite} />}
            </div>
            {multiline ? (
                <textarea {...shared} ref={grow} rows={rows ?? 2} onChange={(event) => onChange(event.target.value)} />
            ) : wrap ? (
                <textarea
                    {...shared}
                    ref={grow}
                    rows={1}
                    onKeyDown={oneLine.onKeyDown}
                    onChange={(event) => onChange(oneLine.text(event.target.value))}
                />
            ) : (
                <input {...shared} type={type} onChange={(event) => onChange(event.target.value)} />
            )}
            {error && (
                <p id={errorId} role="alert" className={FIELD_ERROR}>
                    {error}
                </p>
            )}
            {hint && (
                <p id={hintId} className={FIELD_HINT}>
                    {hint}
                </p>
            )}
            {rewriteFailed && (
                // Tied to the box (M43), with a full-size Retry, and what the author can do about it.
                <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p id={rewriteErrorId} className={classes(FIELD_ERROR, 'min-w-0 flex-1 basis-48')}>
                        Couldn&apos;t rewrite {label}: {rewrite.message} What you wrote is unchanged; try again, or edit it yourself.
                    </p>
                    <button type="button" className="button button-quiet" onClick={onRewrite}>
                        Retry
                    </button>
                </div>
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

const SEGMENT = [
    'bare-button min-h-11 flex-1 rounded-sm px-1 py-1.5',
    'text-center text-md text-muted',
    'press focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-text',
    'aria-checked:bg-accent-fill aria-checked:font-semibold aria-checked:text-accent-text',
].join(' ');

/**
 * A choice of a few, as tap-to-pick segments (spec: story 64). It is a radio group, so the
 * arrow keys move the choice as in any radio group. Each segment is 44px tall (H26).
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
        <div id={domId} className={classes(FIELD, flashed && FIELD_FLASH)}>
            <div className={FIELD_HEAD}>
                <span id={`${id}-label`} className={FIELD_LABEL}>
                    {label}
                </span>
                {highlighted && <ChangedMark />}
            </div>
            <div
                ref={group}
                className={classes('flex gap-1 rounded-md border bg-bg p-1', inputEdge({ highlighted }))}
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
                        className={SEGMENT}
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
                <p id={`${id}-hint`} className={FIELD_HINT}>
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
    /** The action. A promise it returns is waited for before focus moves on (see `focusAfter`). */
    onConfirm(): void | Promise<unknown>;
    danger?: boolean;
    disabled?: boolean;
    /** What the action deletes beyond the obvious, shown under the question while it asks. */
    warning?: string;
    /**
     * The button's name when its label repeats down a list (audit M11): "Delete Chat 3" for a
     * "Delete" beside each Chat. Start it with the label, so voice control finds it by what it shows.
     */
    ariaLabel?: string;
    /**
     * Where focus goes once the action is done (audit H2), when this button is gone with what it
     * removed: return the next item, or the list's heading (give it tabIndex={-1}). Without it,
     * focus comes back to this button if it is still on the page.
     */
    focusAfter?(): HTMLElement | null | undefined;
    /**
     * What the button says while the promise `onConfirm` returns is running, e.g. "Deleting…"
     * (audit M49): it stays focused but can't be pressed again. Without it, the button comes back
     * as it was at once.
     */
    busyLabel?: string;
    /** Utilities for the button that asks, e.g. a quieter look at the foot of a page. */
    className?: string;
}

/**
 * A destructive action that asks first, in place, without a browser dialog. Asking moves focus
 * to Cancel, the safe choice, inside a group named by the question, so a screen reader reads the
 * question out; Escape or Cancel puts focus back on the button (audit H2).
 */
export function ConfirmButton({
    label,
    question,
    confirmLabel,
    onConfirm,
    danger,
    disabled,
    warning,
    ariaLabel,
    focusAfter,
    busyLabel,
    className,
}: ConfirmButtonProps) {
    const [asking, setAsking] = useState(false);
    const [working, setWorking] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const cancel = useRef<HTMLButtonElement>(null);
    const backToTrigger = useRef(false);
    const questionId = useId();
    const warningId = useId();

    useEffect(() => {
        if (asking) cancel.current?.focus();
        else if (backToTrigger.current) {
            backToTrigger.current = false;
            trigger.current?.focus();
        }
    }, [asking]);

    const stop = () => {
        backToTrigger.current = true;
        setAsking(false);
    };
    const confirm = () => {
        // While it runs, focus waits on the button, which says what is happening.
        if (busyLabel) {
            backToTrigger.current = true;
            setWorking(true);
        }
        setAsking(false);
        const land = () => {
            setWorking(false);
            requestAnimationFrame(() => {
                const next = focusAfter?.() ?? (trigger.current?.isConnected ? trigger.current : null);
                next?.focus();
            });
        };
        Promise.resolve(onConfirm()).then(land, land);
    };

    if (!asking) {
        return (
            <button
                ref={trigger}
                type="button"
                // Asking is quiet even for a destructive action, in the danger colour; the danger fill waits for
                // the step that does it (docs/ui-audit-2026-11-13.md, M13: Remove outshone everything but Play).
                className={classes('button button-quiet', danger && 'text-danger', className)}
                onClick={working ? undefined : () => setAsking(true)}
                disabled={disabled}
                aria-disabled={working || undefined}
                aria-busy={working || undefined}
                aria-label={working ? undefined : ariaLabel}
            >
                {working ? busyLabel : label}
            </button>
        );
    }
    return (
        <span
            className="confirm"
            role="group"
            aria-labelledby={questionId}
            aria-describedby={warning ? warningId : undefined}
            onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.stopPropagation();
                stop();
            }}
        >
            <span id={questionId}>{question}</span>
            {warning && (
                <span id={warningId} className="confirm-warning">
                    {warning}
                </span>
            )}
            <button ref={cancel} type="button" className="button button-quiet" onClick={stop}>
                Cancel
            </button>
            <button type="button" className="button button-danger" onClick={confirm}>
                {confirmLabel}
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

const moveLabel = (what: string, direction: -1 | 1) => `Move ${what} ${direction === -1 ? 'up' : 'down'}`;

/**
 * Move up and Move down for an item in a list (audit M36). At either end its button stays
 * focusable but does nothing (aria-disabled), so focus is never dropped; after a move, focus
 * follows the item to its new place, onto the button that can still move it, and the new
 * position is said: "Moved Mira to position 1 of 3".
 */
export function OrderButtons({ index, count, what, onMove }: OrderButtonsProps) {
    const move = (direction: -1 | 1) => {
        const to = index + direction;
        if (to < 0 || to >= count) return;
        onMove(direction);
        announce(`Moved ${what} to position ${to + 1} of ${count}`);
        // The item re-renders in its new place, so find its buttons again by name.
        const keep = to === 0 || to === count - 1 ? (-direction as -1 | 1) : direction;
        requestAnimationFrame(() => {
            const buttons = [...document.querySelectorAll<HTMLButtonElement>('button[data-order-move]')];
            const named = (dir: -1 | 1) => buttons.find((button) => button.getAttribute('aria-label') === moveLabel(what, dir));
            named(keep)?.focus();
        });
    };
    return (
        <>
            <button
                type="button"
                className="button button-quiet"
                data-order-move=""
                aria-label={moveLabel(what, -1)}
                aria-disabled={index === 0 || undefined}
                onClick={() => move(-1)}
            >
                <ArrowUpIcon size={18} />
            </button>
            <button
                type="button"
                className="button button-quiet"
                data-order-move=""
                aria-label={moveLabel(what, 1)}
                aria-disabled={index === count - 1 || undefined}
                onClick={() => move(1)}
            >
                <ArrowDownIcon size={18} />
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
    /**
     * What is typed can't be saved (out of range, not a whole number): drop the edit still waiting
     * to be sent, so the one typed before it doesn't land and read as Saved (audit M21).
     */
    onInvalid?(): void;
    min: number;
    max: number;
    /** The unit after the box, e.g. "Messages" or "%". */
    unit: string;
    hint?: string;
    domId?: string;
    highlighted?: boolean;
}

/** A whole number in a range, with its unit beside the box (a Lore entry's Stays for, Chance). */
export function NumberField({ label, value, onChange, onInvalid, min, max, unit, hint, domId, highlighted }: NumberFieldProps) {
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
            onInvalid?.();
            return;
        }
        setError(null);
        if (number !== value) onChange(number);
    };
    const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ');
    return (
        <div className={classes(FIELD, flashed && FIELD_FLASH)}>
            <div className={FIELD_HEAD}>
                <span className={FIELD_LABEL}>
                    <label htmlFor={id}>{label}</label>
                </span>
                {highlighted && <ChangedMark />}
            </div>
            <div className="flex items-center gap-2">
                <input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={min}
                    max={max}
                    step={1}
                    value={text}
                    className={classes(INPUT_BOX, 'w-22', inputEdge({ highlighted }))}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy || undefined}
                    onChange={(event) => change(event.target.value)}
                />
                <span className="text-note text-muted">{unit}</span>
            </div>
            {error && (
                <p id={errorId} role="alert" className={FIELD_ERROR}>
                    {error}
                </p>
            )}
            {/* Said beside the reason, so the header's "Saved" isn't taken to mean this number (M21). */}
            {error && <p className={FIELD_HINT}>Not saved until it is one.</p>}
            {hint && (
                <p id={hintId} className={FIELD_HINT}>
                    {hint}
                </p>
            )}
        </div>
    );
}
