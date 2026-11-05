'use client';

import { useId, useRef } from 'react';

import styles from './confirm-dialog.module.css';
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
        <div className={styles.backdrop} onClick={onCancel}>
            <div
                ref={panel}
                className={styles.dialog}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
            >
                <h2 id={titleId} className={styles.question}>
                    {question}
                </h2>
                <div className={styles.actions}>
                    <button ref={cancel} type="button" className={styles.cancel} onClick={onCancel}>
                        Cancel
                    </button>
                    <button type="button" className={styles.confirm} onClick={onConfirm}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
