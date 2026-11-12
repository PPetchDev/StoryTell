'use client';

import { useId, useRef } from 'react';

import { useModalFocus } from './sheet';

interface ConfirmDialogProps {
    /** The question, which is also the dialog's name. */
    question: string;
    /** The danger button's label, e.g. "Reset". */
    confirmLabel: string;
    onCancel(): void;
    onConfirm(): void;
}

/**
 * Asks before a destructive action (spec: story 74): a small card in the middle of a dimmed
 * screen with Cancel and the danger button. Focus starts on Cancel, the safe choice; tapping
 * the dimmed page or Escape cancels.
 */
export function ConfirmDialog({ question, confirmLabel, onCancel, onConfirm }: ConfirmDialogProps) {
    const panel = useRef<HTMLDivElement>(null);
    const cancel = useRef<HTMLButtonElement>(null);
    const titleId = useId();
    useModalFocus(panel, onCancel, cancel);

    return (
        <div className="fixed inset-0 z-dialog flex items-center justify-center bg-scrim p-6 motion-safe:animate-fade-in" onClick={onCancel}>
            <div
                ref={panel}
                className="w-full max-w-[24rem] rounded-xl border border-line bg-surface p-5 focus:outline-none"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
            >
                <h2 id={titleId} className="m-0 mb-4 text-lg leading-[1.4] font-semibold">
                    {question}
                </h2>
                <div className="flex justify-end gap-2">
                    <button ref={cancel} type="button" className="bare-button press min-h-11 rounded-full border border-field-line px-[1.1rem] font-semibold text-text" onClick={onCancel}>
                        Cancel
                    </button>
                    <button type="button" className="bare-button press min-h-11 rounded-full border border-danger bg-danger-soft px-[1.1rem] font-semibold text-danger-text" onClick={onConfirm}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
