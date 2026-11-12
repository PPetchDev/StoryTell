'use client';

import { PointerEvent, ReactNode, RefObject, useCallback, useEffect, useRef } from 'react';

import { CloseIcon } from '@/components/icons';

/** Everything Tab can land on (audit L39: a summary, a tabindex and contenteditable count too). */
const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    'summary',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
].join(', ');

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

// The entrance and exit animations (audit L3: the exit, 120ms, is quicker than the 180ms entrance).
const ENTER_BACKDROP = 'motion-safe:animate-fade-in';
const EXIT_BACKDROP = 'motion-safe:animate-fade-out';
const ENTER_PANEL = 'motion-safe:animate-sheet-in';
const EXIT_PANEL = 'motion-safe:animate-sheet-out';

/**
 * Plays the exit on a still copy of the sheet, laid over the page for the moment it takes:
 * inert, hidden from assistive tech and from taps. The sheet itself closes at once, so its focus
 * goes back at once, and opening it again straight away is never lost to a closing one.
 */
function playExit(root: HTMLElement | null) {
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ghost = root.cloneNode(true) as HTMLElement;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.style.pointerEvents = 'none';
    ghost.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    const panel = ghost.querySelector<HTMLElement>('[role="dialog"]');
    if (ghost.classList.contains(ENTER_BACKDROP)) ghost.classList.replace(ENTER_BACKDROP, EXIT_BACKDROP);
    panel?.removeAttribute('role');
    panel?.classList.replace(ENTER_PANEL, EXIT_PANEL);
    document.body.appendChild(ghost);
    const remove = () => ghost.remove();
    panel?.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, 400);
}

/** Closing: the exit plays on a copy of `root` (playExit), and `onClose` runs now. */
function useExit(root: RefObject<HTMLElement | null>, onClose: () => void) {
    return useCallback(() => {
        playExit(root.current);
        onClose();
    }, [root, onClose]);
}

/** How far down the grip must be dragged to close the sheet, in px, or a quarter of its height. */
const DRAG_CLOSE_PX = 96;

/**
 * Drag the grip row down to close (audit L1): the panel follows the finger, and a long enough
 * drag closes it, else it springs back. Close and Escape do the same without a drag.
 */
function useDragToClose(panel: RefObject<HTMLElement | null>, close: () => void) {
    const start = useRef<number | null>(null);
    const moved = useRef(0);

    const onPointerDown = (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || (event.target as Element).closest('button')) return;
        start.current = event.clientY;
        moved.current = 0;
        event.currentTarget.setPointerCapture(event.pointerId);
        if (panel.current) panel.current.style.transition = 'none';
    };
    const onPointerMove = (event: PointerEvent<HTMLElement>) => {
        if (start.current === null || !panel.current) return;
        moved.current = Math.max(0, event.clientY - start.current);
        panel.current.style.transform = `translateY(${moved.current}px)`;
    };
    const onPointerEnd = () => {
        const node = panel.current;
        if (start.current === null || !node) return;
        start.current = null;
        if (moved.current > Math.min(DRAG_CLOSE_PX, node.offsetHeight / 4)) {
            close();
            return;
        }
        node.style.transition = 'transform 180ms cubic-bezier(0.2, 0, 0, 1)';
        node.style.transform = '';
    };
    return { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd };
}

function SheetTop({ title, onClose, drag }: { title?: string; onClose(): void; drag: ReturnType<typeof useDragToClose> }) {
    return (
        <div className="relative flex min-h-10 flex-none touch-none items-center justify-center" {...drag}>
            {title && <h2 className="absolute top-0 left-0 m-0 text-base leading-11">{title}</h2>}
            <span className="h-1 w-10 cursor-grab rounded-full bg-field-line" aria-hidden="true" />
            <button
                type="button"
                className="bare-button press absolute top-0 -right-2 grid size-11 place-items-center rounded-full text-muted"
                aria-label="Close"
                onClick={onClose}
            >
                <CloseIcon size={20} strokeWidth={2} />
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
 * page, the Close button, Escape or dragging the grip down closes it, with a short slide out
 * (only Close, Escape, the backdrop and the grip play it: a parent that unmounts it just ends it);
 * focus moves into it on open and back on close. A `modeless` sheet leaves the page usable instead.
 */
export function Sheet({ modeless, ...props }: SheetProps) {
    return modeless ? <ModelessSheet {...props} /> : <ModalSheet {...props} />;
}

/** The panel's look, shared by both kinds: it scrolls on its own and never scrolls the page (L2). */
const PANEL =
    'w-full max-w-[40rem] overscroll-contain rounded-t-2xl bg-surface px-4 pt-1 pb-[calc(1rem+env(safe-area-inset-bottom))] focus:outline-none';

function ModalSheet({ label, title, onClose, children }: Omit<SheetProps, 'modeless'>) {
    const root = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const close = useExit(root, onClose);
    const drag = useDragToClose(panel, close);
    useModalFocus(panel, close);

    return (
        <div ref={root} className={`fixed inset-0 z-sheet flex items-end justify-center bg-scrim ${ENTER_BACKDROP}`} onClick={close}>
            <div
                ref={panel}
                className={`${PANEL} max-h-[85dvh] overflow-y-auto ${ENTER_PANEL}`}
                role="dialog"
                aria-modal="true"
                aria-label={label}
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
            >
                <SheetTop title={title} onClose={close} drag={drag} />
                {children}
            </div>
        </div>
    );
}

function ModelessSheet({ label, title, onClose, children }: Omit<SheetProps, 'modeless'>) {
    const root = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const close = useExit(root, onClose);
    const drag = useDragToClose(panel, close);
    useModelessFocus(panel, close);

    return (
        <div ref={root} className="pointer-events-none fixed inset-x-0 bottom-0 z-sheet flex justify-center">
            <div
                ref={panel}
                className={`${PANEL} pointer-events-auto flex h-(--sheet-half) flex-col overflow-hidden border-t border-line shadow-[0_-10px_40px_var(--shadow-strong)] ${ENTER_PANEL}`}
                role="dialog"
                aria-label={label}
                tabIndex={-1}
            >
                <SheetTop title={title} onClose={close} drag={drag} />
                {children}
            </div>
        </div>
    );
}
