'use client';

import { RefObject, useEffect, useState } from 'react';

/**
 * Which ends of a sideways-scrolling row hide more of it (docs/ui-audit-2026-11-13.md, M4 and M11:
 * an item cut at the edge gave no sign the row scrolls). Each hidden end fades out over 40px; the
 * fade goes once that end is reached.
 */
export const SCROLL_FADES = {
    none: '',
    end: '[mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)]',
    start: '[mask-image:linear-gradient(to_left,#000_calc(100%-2.5rem),transparent)]',
    both: '[mask-image:linear-gradient(to_right,transparent,#000_2.5rem,#000_calc(100%-2.5rem),transparent)]',
} as const;

export type ScrollFade = keyof typeof SCROLL_FADES;

/** Reads which ends of the row `ref` has more to scroll to, again on every scroll and resize. */
export function useScrollFade(ref: RefObject<HTMLElement | null>): ScrollFade {
    const [fade, setFade] = useState<ScrollFade>('none');
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const read = () => {
            const before = el.scrollLeft > 1;
            const after = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
            setFade(before && after ? 'both' : before ? 'start' : after ? 'end' : 'none');
        };
        read();
        el.addEventListener('scroll', read, { passive: true });
        const resized = new ResizeObserver(read);
        resized.observe(el);
        for (const child of el.children) resized.observe(child);
        return () => {
            el.removeEventListener('scroll', read);
            resized.disconnect();
        };
    });
    return fade;
}
