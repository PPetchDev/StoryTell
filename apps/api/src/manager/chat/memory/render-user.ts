/** The placeholder a Memory's text carries where it names the user (spec: "text (with `{user}`)"). */
export const USER_PLACEHOLDER = '{user}';

/**
 * Renders `{user}` as the worn identity's name (spec: story 48). The one place it happens
 * on the API side: ticket 26 passes the worn Persona's name here instead of the Role's.
 */
export function renderUser(text: string, identityName: string): string {
    return text.split(USER_PLACEHOLDER).join(identityName);
}

/**
 * The reverse, for text the AI wrote: the identity's name, as a whole word, becomes `{user}`
 * so the Memory still reads right after a Persona switch.
 */
export function placeholderUser(text: string, identityName: string): string {
    const name = identityName.trim();
    if (name === '') return text;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gu'), `$1${USER_PLACEHOLDER}`);
}
