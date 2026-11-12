'use client';

import { RefObject, useEffect, useRef, useSyncExternalStore } from 'react';

import { keepFocusIn } from '@/components/sheet/sheet';

/** The desktop layout, where the Memory drawer docks beside the Chat (the `lg` breakpoint). */
const DOCKED = '(min-width: 1024px)';

function subscribe(onChange: () => void) {
    const query = window.matchMedia(DOCKED);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
}

/** Whether the drawer docks beside the Chat (1024px and up) rather than covering it as a dialog. */
export function useDocked(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => window.matchMedia(DOCKED).matches,
        () => false,
    );
}

const LIVE = '[aria-live]:not([aria-live="off"])';
const CONTROLS = 'a[href], button, input, select, textarea, summary, [tabindex]';

/**
 * Makes everything on the page but `panel` inert, and hands it back on cleanup: each sibling of
 * the panel and of each of its ancestors up to <body>. The app's live regions stay live, so what
 * `announce` says is still heard. Only what this made inert is given back.
 */
function inertAround(panel: HTMLElement): () => void {
    const made: HTMLElement[] = [];
    // A live region stays live; something holding one is gone into, so only the rest of it is inert.
    const makeInert = (element: Element) => {
        if (!(element instanceof HTMLElement) || element.inert || element.matches('script, style')) return;
        if (element.matches(LIVE) && !element.querySelector(CONTROLS)) return;
        if (element.querySelector(LIVE)) {
            for (const child of Array.from(element.children)) makeInert(child);
            return;
        }
        element.inert = true;
        made.push(element);
    };
    for (let node: HTMLElement | null = panel; node && node !== document.body; node = node.parentElement) {
        const parent: HTMLElement | null = node.parentElement;
        if (!parent) break;
        for (const sibling of Array.from(parent.children)) if (sibling !== node) makeInert(sibling);
    }
    return () => {
        for (const sibling of made) sibling.inert = false;
    };
}

/**
 * The Memory drawer's focus (audit H4, M54); `root` holds the panel and its scrim. It opens with
 * focus on `start`, and Escape closes it. Below 1024px it covers the Chat, so it is modal: the
 * rest of the page is inert, Tab stays in the panel, and on close focus goes back to what opened
 * it. Docked beside the Chat, the Chat stays in use: Escape closes it only while focus is inside,
 * and focus goes back only if it was still there.
 */
export function useDrawerFocus(
    root: RefObject<HTMLElement | null>,
    panel: RefObject<HTMLElement | null>,
    start: RefObject<HTMLElement | null>,
    onClose: () => void,
    modal: boolean,
) {
    const close = useRef(onClose);
    const isModal = useRef(modal);

    // Declared first, so on close the page is usable again before focus goes back to it.
    useEffect(() => {
        if (!modal || !root.current) return;
        return inertAround(root.current);
    }, [modal, root]);

    useEffect(() => {
        close.current = onClose;
        isModal.current = modal;
    }, [onClose, modal]);

    useEffect(() => {
        const node = panel.current;
        // A Chat menu sheet that closed in the same commit has already handed focus back to its opener.
        const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
        (start.current ?? node)?.focus();
        let inPanel = true;
        const onFocusIn = (event: FocusEvent) => {
            inPanel = !!node?.contains(event.target as Node);
        };
        const onKey = (event: KeyboardEvent) => {
            if (!node || event.defaultPrevented) return;
            if (event.key === 'Escape' && (isModal.current || node.contains(document.activeElement))) {
                event.preventDefault();
                close.current();
            }
            if (event.key === 'Tab' && isModal.current) keepFocusIn(node, event);
        };
        document.addEventListener('focusin', onFocusIn);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('focusin', onFocusIn);
            document.removeEventListener('keydown', onKey);
            if ((isModal.current || inPanel) && opener?.isConnected) opener.focus();
        };
    }, [panel, start]);
}
