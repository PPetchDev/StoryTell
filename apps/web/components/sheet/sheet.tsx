'use client';

import { ReactNode, useEffect, useRef } from 'react';

import styles from './sheet.module.css';

/**
 * A panel that slides up from the bottom of the screen over a dimmed page. Tapping the dimmed
 * page, the Close button or Escape closes it; focus moves into it on open and back on close.
 */
export function Sheet({ label, onClose, children }: { label: string; onClose(): void; children: ReactNode }) {
    const panel = useRef<HTMLDivElement>(null);
    const close = useRef(onClose);

    useEffect(() => {
        close.current = onClose;
    }, [onClose]);

    useEffect(() => {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        panel.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close.current();
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            opener?.focus();
        };
    }, []);

    return (
        <div className={styles.backdrop} onClick={onClose}>
            <div
                ref={panel}
                className={styles.panel}
                role="dialog"
                aria-modal="true"
                aria-label={label}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
            >
                <div className={styles.top}>
                    <span className={styles.grip} aria-hidden="true" />
                    <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
                        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}
