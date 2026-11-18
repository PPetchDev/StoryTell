import { BondAxis, isBondLevel, BOND_AXES } from '../../../model/ledger/bond-axes.js';
import { GateBond, gatesHold } from '../judge/bond-gates.js';

/**
 * Secret reveals (.scratch/secret-reveals/spec.md). Pure logic: which of a Character's Secrets are
 * open and on offer, what the Narrator and the Judge are told, how the Judge's answer is read and
 * applied. The code decides what is a reveal; the Judge only says which offered Secret came out.
 */

/** The longest Secret text kept. */
export const SECRET_TEXT_MAX = 1000;
/** At most this many Secrets on one Character. */
export const MAX_SECRETS = 8;
/** What the Judge's section adds to its token cap. */
export const SECRETS_EXTRA_TOKENS = 40;
export const SECRETS_HEADING = '# Secrets';
export const JUDGE_SECRETS_HEADING = '# Secrets that may come out';

/** One Secret as a Character card holds it. */
export interface CardSecret {
    id: number;
    position?: number;
    text: string;
    axis: BondAxis | null;
    atLeast: number | null;
}

/** A Character as the Secrets read it. */
export interface SecretCharacter {
    id: number;
    name: string;
    secretList?: CardSecret[] | null;
}

/** One Secret of the Story, with whose it is. */
export interface StorySecret {
    id: number;
    characterId: number;
    characterName: string;
    text: string;
    axis: BondAxis | null;
    atLeast: number | null;
}

/** A Secret the Chat has revealed, with the AI Message that told it. */
export interface RevealedSecret extends StorySecret {
    messageId: number;
}

/** A Character's Secrets in the author's order. */
export function orderedSecrets(list: readonly CardSecret[] | null | undefined): CardSecret[] {
    return [...(list ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);
}

/** Every Secret of the cast with some text, in cast order and then the author's. */
export function storySecrets(characters: readonly SecretCharacter[]): StorySecret[] {
    return characters.flatMap((character) =>
        orderedSecrets(character.secretList)
            .filter((secret) => secret.text.trim() !== '')
            .map((secret) => ({
                id: secret.id,
                characterId: character.id,
                characterName: character.name,
                text: secret.text.trim(),
                axis: secret.axis,
                atLeast: secret.atLeast,
            })),
    );
}

/** Whether a Secret has a Bond level to reach before it is told. */
export function hasLevel(secret: Pick<CardSecret, 'axis' | 'atLeast'>): secret is CardSecret & { axis: BondAxis; atLeast: number } {
    return secret.axis !== null && secret.atLeast !== null;
}

/**
 * Whether the Story has any Secret with a level: the Judge's reply shape then names its field on
 * every call in the Story's Chats, so its system message never changes from one call to the next.
 */
export function hasLevelledSecret(characters: readonly SecretCharacter[]): boolean {
    return storySecrets(characters).some(hasLevel);
}

/**
 * The Chat's Secrets as a reply reads them: those revealed, in the order they came out, and per
 * Character not sitting out the first open one in the author's order, on offer. Open: it has a level,
 * the Character's Bond toward the user holds it (a Bond with no levels yet holds none), and it is not
 * revealed yet. A reveal of a Secret the author has since removed is left out.
 */
export function secretsState(input: {
    secrets: readonly StorySecret[];
    bonds: readonly GateBond[];
    reveals: ReadonlyArray<{ secretId: number; messageId: number }>;
    sittingOut?: readonly number[];
}): { offered: StorySecret[]; revealed: RevealedSecret[] } {
    const revealedIds = new Set(input.reveals.map((reveal) => reveal.secretId));
    const revealed = input.reveals.flatMap((reveal): RevealedSecret[] => {
        const secret = input.secrets.find((candidate) => candidate.id === reveal.secretId);
        return secret ? [{ ...secret, messageId: reveal.messageId }] : [];
    });
    const sittingOut = new Set(input.sittingOut ?? []);
    const offered: StorySecret[] = [];
    const offeredFor = new Set<number>();
    for (const secret of input.secrets) {
        if (!hasLevel(secret) || revealedIds.has(secret.id) || sittingOut.has(secret.characterId) || offeredFor.has(secret.characterId)) continue;
        const [open] = gatesHold([{ fromCharacterId: secret.characterId, toCharacterId: null, axis: secret.axis, atLeast: secret.atLeast }], input.bonds);
        if (!open) continue;
        offered.push(secret);
        offeredFor.add(secret.characterId);
    }
    return { offered, revealed };
}

/**
 * What a Character's card says of their Secrets (the standing system message, so it never changes in
 * a Chat): the Secrets text with the Secrets without a level, as before, then the levelled ones the
 * Character keeps for now. Null when there is nothing to say; with no Secret in the list, exactly the
 * line the card had before.
 */
export function cardSecretLines(character: { name: string; secrets: string; secretList?: CardSecret[] | null }): string[] {
    const name = character.name;
    const listed = orderedSecrets(character.secretList).filter((secret) => secret.text.trim() !== '');
    const untimed = listed.filter((secret) => !hasLevel(secret)).map((secret) => `- ${secret.text.trim()}`);
    const timed = listed.filter(hasLevel).map((secret) => `- ${secret.text.trim()}`);
    const lines: string[] = [];
    if (character.secrets.trim() || untimed.length > 0) {
        const head = `Secrets (known only to ${name}; no one else knows these unless ${name} reveals them):`;
        lines.push([character.secrets.trim() ? `${head} ${character.secrets}` : head, ...untimed].join('\n'));
    }
    if (timed.length > 0) {
        lines.push(
            [`Secrets ${name} keeps for now (${name} does not tell them, or hint at them outright, until the Narrator's notes say ${name} may):`, ...timed].join('\n'),
        );
    }
    return lines;
}

/**
 * The Narrator's `# Secrets` block, in the closing message after the Established facts: the Secret
 * each Character may now tell, and those already told. Null when there is neither.
 */
export function secretsBlock(input: { offered: readonly StorySecret[]; revealed: readonly StorySecret[] } | null | undefined, identity: string): string | null {
    if (!input || (input.offered.length === 0 && input.revealed.length === 0)) return null;
    const lines = [SECRETS_HEADING];
    for (const secret of input.offered) {
        lines.push(`- ${secret.characterName} may now tell ${identity} this, if and when the moment truly fits; never force it or steer toward it: ${secret.text}`);
    }
    if (input.offered.length > 0) lines.push('Tell at most one secret in a reply, and none at all when the moment is wrong for it.');
    if (input.revealed.length > 0) {
        lines.push(`Already told to ${identity}, so never told again as news: ${input.revealed.map((secret) => `${secret.characterName}: ${secret.text}`).join('; ')}`);
    }
    return lines.join('\n');
}

/**
 * The Judge's section, last in its user message, only when a Secret is on offer: the Secrets numbered
 * from 1 (never by id) and the rule. Its field is named in the reply shape of the system message
 * (`withSecretsShape` in judge-prompt.ts).
 */
export function judgeSecretsSection(offered: readonly StorySecret[]): string | null {
    if (offered.length === 0) return null;
    return [
        JUDGE_SECRETS_HEADING,
        ...offered.map((secret, index) => `[${index + 1}] ${secret.characterName}: ${secret.text}`),
        'Secret rule: in "secrets_revealed" give the number of each secret above that the latest exchange actually reveals to the user: the Character tells it, or the user plainly learns it. A hint, a hesitation, a promise to tell later or a half-truth is not a reveal. Most turns reveal none: when in doubt, leave it out.',
    ].join('\n');
}

/** Read loosely: whole numbers, or strings of digits ("1", "[1]"); anything else is dropped. */
export function readJudgedSecrets(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item): number[] => {
        if (typeof item === 'number') return Number.isInteger(item) ? [item] : [];
        if (typeof item === 'string') {
            const match = item.trim().match(/^\[?(\d+)\]?$/);
            return match ? [Number(match[1])] : [];
        }
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            return readJudgedSecrets([(item as Record<string, unknown>).number ?? (item as Record<string, unknown>).secret]);
        }
        return [];
    });
}

/** The Judge's numbers as reveals: only numbers it was offered, each once. Each dropped one is described for the log. */
export function applySecretReveals(offered: readonly StorySecret[], judged: readonly number[]): { reveals: number[]; rejected: string[] } {
    const reveals: number[] = [];
    const rejected: string[] = [];
    for (const number of judged) {
        const secret = offered[number - 1];
        if (!secret) {
            rejected.push(`secret ${number}: none was offered under that number`);
            continue;
        }
        if (reveals.includes(secret.id)) {
            rejected.push(`secret ${number}: given twice`);
            continue;
        }
        reveals.push(secret.id);
    }
    return { reveals, rejected };
}

/**
 * A Secret's level as sent, checked: none, or an axis and a level within its scale. Answers why
 * not, or null when it is fine.
 */
export function secretLevelProblem(axis: BondAxis | null, atLeast: number | null): string | null {
    if (axis === null && atLeast === null) return null;
    if (axis === null || atLeast === null) return 'a level needs both a feeling and how far it has grown.';
    if (!BOND_AXES.includes(axis)) return 'that feeling is not one of the four.';
    if (!isBondLevel(axis, atLeast)) return "that level is outside the feeling's scale.";
    return null;
}
