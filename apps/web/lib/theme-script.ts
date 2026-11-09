/**
 * What the root layout (a Server Component) needs for the theme: the inline head script and its
 * constants, with no React import. lib/theme.ts is the client side.
 */
export type Theme = 'dark' | 'light';

export const THEME_KEY = 'storytell.theme';

/**
 * The browser chrome's colour in each theme: the page colour (PWA metadata, so literal; the
 * manifest's own colours stay dark, as they only colour the splash screen).
 */
export const THEME_COLOUR: Record<Theme, string> = { dark: '#16131f', light: '#f6f4fa' };

export const LIGHT_QUERY = '(prefers-color-scheme: light)';

/**
 * The root layout's blocking head script: the same as resolvedTheme and applyTheme, inlined, so the
 * page has its theme before the first paint and before React hydrates. It reads storage safely and
 * falls back to Dark. It also makes the theme-color meta: one React rendered would be put back on the
 * client with the server's colour, as a second meta.
 */
export const THEME_SCRIPT = `(function(){var t='dark';try{var c=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(c==='light')t='light';else if(c==='system'&&window.matchMedia(${JSON.stringify(
    LIGHT_QUERY,
)}).matches)t='light'}catch(e){}document.documentElement.setAttribute('data-theme',t);var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');document.head.appendChild(m)}m.setAttribute('content',t==='light'?${JSON.stringify(
    THEME_COLOUR.light,
)}:${JSON.stringify(THEME_COLOUR.dark)})})()`;
