'use client';

import { useEffect } from 'react';

import { applyTheme, onPhoneThemeChange, resolvedTheme, useThemeChoice } from '@/lib/theme';

/**
 * Keeps <html data-theme> and the browser chrome's colour in step with the Theme setting and, for
 * Match phone, with the phone's own setting as it changes. The root layout's head script set both
 * before the first paint; this takes over once React runs.
 */
export function ThemeSync() {
    const choice = useThemeChoice();
    useEffect(() => {
        applyTheme(resolvedTheme(choice));
        if (choice !== 'system') return;
        return onPhoneThemeChange(() => applyTheme(resolvedTheme('system')));
    }, [choice]);
    return null;
}
