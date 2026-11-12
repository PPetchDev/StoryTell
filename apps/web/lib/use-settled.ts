'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * `value` a moment after it stops changing: for what is worked out or read out while someone
 * types (a count, a check, a live result), so it happens once, not per keystroke (audit L12, M22).
 */
export function useSettled<T>(value: T, ms = 600): T {
    const [settled, setSettled] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setSettled(value), ms);
        return () => clearTimeout(timer);
    }, [value, ms]);
    return settled;
}

/**
 * A field's error, shown once the typing has paused (audit M22): clearing it is at once, a new
 * one waits `ms`, so an alert is not read out for every half-typed value.
 */
export function useLaterError(ms = 500): [string | null, (error: string | null) => void] {
    const [shown, setShown] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);
    const set = useCallback(
        (error: string | null) => {
            clearTimeout(timer.current);
            if (error === null) setShown(null);
            else timer.current = setTimeout(() => setShown(error), ms);
        },
        [ms],
    );
    return [shown, set];
}
