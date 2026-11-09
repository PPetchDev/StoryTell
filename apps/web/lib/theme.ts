import { devicePreference } from './device-preference';
import { LIGHT_QUERY, Theme, THEME_COLOUR, THEME_KEY } from './theme-script';

/**
 * The Theme setting (spec: Chat looks, "Light theme"): Dark (the default), Light, or Match phone,
 * kept on this device only. The resolved theme sits on <html> as data-theme, which globals.css reads.
 */
export type ThemeChoice = 'dark' | 'light' | 'system';

export const THEME_CHOICES: readonly { value: ThemeChoice; label: string }[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'Match phone' },
];

function isThemeChoice(value: unknown): value is ThemeChoice {
    return THEME_CHOICES.some((option) => option.value === value);
}

const themeChoice = devicePreference<ThemeChoice>({
    key: THEME_KEY,
    fallback: 'dark',
    parse: (stored) => (isThemeChoice(stored) ? stored : null),
    serialise: (choice) => choice,
});

export const setThemeChoice = themeChoice.set;

/** This device's Theme choice; Dark while rendering on the server. */
export const useThemeChoice = themeChoice.useValue;

/** The theme a choice shows now: Match phone follows the phone's light or dark setting. */
export function resolvedTheme(choice: ThemeChoice): Theme {
    if (choice !== 'system') return choice;
    return window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark';
}

/** Puts a theme on the page: <html data-theme> and the browser chrome's colour. */
export function applyTheme(theme: Theme): void {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOUR[theme]);
}

/** Calls back when the phone's light or dark setting changes. */
export function onPhoneThemeChange(callback: () => void): () => void {
    const query = window.matchMedia(LIGHT_QUERY);
    query.addEventListener('change', callback);
    return () => query.removeEventListener('change', callback);
}
