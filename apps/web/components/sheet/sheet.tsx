'use client';

import { ReactNode, RefObject, useEffect, useRef } from 'react';

import styles from './sheet.module.css';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])';

/** Tab and Shift+Tab wrap around inside the panel, so focus never reaches the page behind it. */
export function keepFocusIn(panel: HTMLElement, event: KeyboardEvent) {
    const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
    }
}

/**
 * The focus rules of a modal panel: on open, focus moves to `initial` (or the panel itself),
 * Tab stays inside, Escape closes it, and on close focus goes back to what had it before.
 * Focus is moved in an effect rather than by autoFocus, since a sheet closing in the same
 * commit hands focus back to its opener first.
 */
export function useModalFocus(
    panel: RefObject<HTMLElement | null>,
    onClose: () => void,
    initial?: RefObject<HTMLElement | null>,
) {
    const close = useRef(onClose);

    useEffect(() => {
        close.current = onClose;
    }, [onClose]);

    useEffect(() => {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        (initial?.current ?? panel.current)?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close.current();
            if (event.key === 'Tab' && panel.current) keepFocusIn(panel.current, event);
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            opener?.focus();
        };
    }, [panel, initial]);
}

/**
 * The focus rules of a modeless panel, which leaves the page behind it in use: focus moves
 * into it on open, Tab moves freely in and out, and Escape closes it while focus is inside.
 * On close, focus goes back to the opener only if it was still in the panel, since by then
 * the author may be typing in the page.
 */
function useModelessFocus(panel: RefObject<HTMLElement | null>, onClose: () => void) {
    const close = useRef(onClose);

    useEffect(() => {
        close.current = onClose;
    }, [onClose]);

    useEffect(() => {
        const node = panel.current;
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        node?.focus();
        // Where focus last went, the panel or the page. The panel is gone by cleanup, so it is kept here.
        let inPanel = true;
        const onFocusIn = (event: FocusEvent) => {
            inPanel = !!node?.contains(event.target as Node);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && node?.contains(document.activeElement)) close.current();
        };
        document.addEventListener('focusin', onFocusIn);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('focusin', onFocusIn);
            document.removeEventListener('keydown', onKey);
            if (inPanel) opener?.focus();
        };
    }, [panel]);
}

function SheetTop({ title, onClose }: { title?: string; onClose(): void }) {
    return (
        <div className={styles.top}>
            {title && <h2 className={styles.title}>{title}</h2>}
            <span className={styles.grip} aria-hidden="true" />
            <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                </svg>
            </button>
        </div>
    );
}

interface SheetProps {
    label: string;
    /** A heading in the grip row, beside Close. */
    title?: string;
    onClose(): void;
    children: ReactNode;
    /**
     * Half the screen tall, over a page that stays in use: no dimming, no focus trap, and a tap
     * on the page doesn't close it. The page leaves `--sheet-half` of room at its end.
     */
    modeless?: boolean;
}

/**
 * A panel that slides up from the bottom of the screen over a dimmed page. Tapping the dimmed
 * page, the Close button or Escape closes it; focus moves into it on open and back on close.
 * A `modeless` sheet leaves the page usable instead.
 */
export function Sheet({ modeless, ...props }: SheetProps) {
    return modeless ? <ModelessSheet {...props} /> : <ModalSheet {...props} />;
}

function ModalSheet({ label, title, onClose, children }: Omit<SheetProps, 'modeless'>) {
    const panel = useRef<HTMLDivElement>(null);
    useModalFocus(panel, onClose);

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
                <SheetTop title={title} onClose={onClose} />
                {children}
            </div>
        </div>
    );
}

function ModelessSheet({ label, title, onClose, children }: Omit<SheetProps, 'modeless'>) {
    const panel = useRef<HTMLDivElement>(null);
    useModelessFocus(panel, onClose);

    return (
        <div className={styles.dock}>
            <div ref={panel} className={`${styles.panel} ${styles.modeless}`} role="dialog" aria-label={label} tabIndex={-1}>
                <SheetTop title={title} onClose={onClose} />
                {children}
            </div>
        </div>
    );
}
