import { CastName, ReplyPart } from '../turn/reply-parser.js';

/**
 * Which Characters were present in an exchange (spec: "which Characters were present"). The
 * app tracks no presence, so this reads it off the exchange: a Character who speaks in the
 * reply or is named in the user's text or the reply. When that finds nobody, everyone is
 * taken as present rather than nobody, so a user-added Memory is never known by no one.
 */
export function presentCharacters(cast: CastName[], userText: string, reply: ReplyPart[]): CastName[] {
    const present = charactersInExchange(cast, userText, reply);
    return present.length > 0 ? present : [...cast];
}

/** The Characters who speak in the reply or are named in it or the user's text; possibly none. */
export function charactersInExchange(cast: CastName[], userText: string, reply: ReplyPart[]): CastName[] {
    const spoke = new Set(reply.flatMap((part) => (part.kind === 'speech' && part.characterId !== null ? [part.characterId] : [])));
    const text = `${userText}\n${reply.map((part) => part.text).join('\n')}`.toLowerCase();
    return cast.filter((character) => spoke.has(character.id) || mentions(text, character.name));
}

/** Whether `text` (lower-cased) names the Character as a whole word, by full name or first name. */
function mentions(text: string, name: string): boolean {
    const candidates = [name.trim(), name.trim().split(/\s+/)[0]].filter((candidate) => candidate.length > 1);
    return candidates.some((candidate) => {
        const escaped = candidate.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(text);
    });
}
