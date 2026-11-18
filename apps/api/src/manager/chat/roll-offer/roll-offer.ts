import { AUTHOR_MODEL, MessageKind, StoredRollOffer } from '../../../model/chat/entities/message.entity.js';
import { RoleStat } from '../../../model/story/entities/role.entity.js';

/**
 * Roll offers and Stats (.scratch/judge-rolls/spec.md). Pure logic: when the Judge may offer a Roll,
 * what its section says, how its answer is read and applied, and the offer a Chat shows. The code
 * decides whether an offer is allowed; the Judge only whether the moment calls for one.
 */

/** The model-written replies, the judged one included, after the last offer or Roll before another offer. */
export const ROLL_OFFER_GAP = 6;
/** What the section adds to the Judge's token cap. */
export const ROLL_OFFER_EXTRA_TOKENS = 60;
/** The longest stakes kept. */
export const STAKES_MAX = 160;
/** At most this many Stats on a Role. */
export const MAX_STATS = 6;
export const STAT_NAME_MAX = 24;
export const STAT_MIN = -3;
export const STAT_MAX = 5;

/** What the gap reads of a Message. */
export interface OfferMessage {
    kind: MessageKind;
    model: string | null;
    roll: number | null;
    rollOffer: StoredRollOffer | null;
    epilogue?: boolean;
}

/** An offer as the Judge gave it, read loosely. */
export interface JudgedRollOffer {
    stakes: string;
    stat: string | null;
}

/** The pending offer as a Chat carries it: the Stat with the Role's number now, or null. */
export interface RollOfferView {
    stakes: string;
    stat: { name: string; bonus: number } | null;
}

/** The Role's Stat of that name, ignoring case and spaces around it. */
export function statNamed(stats: readonly RoleStat[], name: string | null | undefined): RoleStat | null {
    const wanted = (name ?? '').trim().toLowerCase();
    if (!wanted) return null;
    return stats.find((stat) => stat.name.trim().toLowerCase() === wanted) ?? null;
}

const written = (message: OfferMessage): boolean =>
    message.kind === MessageKind.Ai && message.model !== null && message.model !== AUTHOR_MODEL;

/**
 * Whether the AI Message at `index` may carry an offer: the Story's offers are on, it is not an
 * Epilogue, the User Message it answers had no Roll, and at least `ROLL_OFFER_GAP` written
 * replies, it included, came after the last offer (taken, dismissed or ignored) and the last Roll.
 */
export function rollOfferAllowed(input: { rollOffers: boolean; messages: readonly OfferMessage[]; index: number }): boolean {
    const { messages, index } = input;
    const judged = messages[index];
    if (!input.rollOffers || !judged || judged.epilogue) return false;
    const answered = messages[index - 1];
    if (answered?.kind === MessageKind.User && answered.roll !== null && answered.roll !== undefined) return false;
    let replies = 0;
    for (let i = index; i >= 0; i--) {
        const message = messages[i];
        // Its own offer from an earlier judgement of it is not a previous offer.
        if (i < index && message.kind === MessageKind.Ai && message.rollOffer) break;
        if (message.kind === MessageKind.User && message.roll !== null && message.roll !== undefined) break;
        if (written(message)) replies++;
        if (replies >= ROLL_OFFER_GAP) return true;
    }
    return false;
}

const signed = (value: number): string => (value < 0 ? `${value}` : `+${value}`);

/** The Role's Stats in words: "Strength +2, Charm +1", or "none". */
export function statsInWords(stats: readonly RoleStat[]): string {
    return stats.length > 0 ? stats.map((stat) => `${stat.name} ${signed(stat.value)}`).join(', ') : 'none';
}

/**
 * The Judge's "# Roll offer" section, sent only when an offer is allowed. Its field is named in the
 * reply shape of the system message on every call (`withRollOfferShape` in judge-prompt.ts).
 */
export function judgeRollOfferSection(stats: readonly RoleStat[]): string {
    return [
        '# Roll offer',
        `The user can be offered a Roll: a d20 they may choose to throw for their next message, to leave whether a risky attempt works to chance. Their Stats: ${statsInWords(stats)}.`,
        `Roll offer rule: set "roll_offer" to {"stakes": "...", "stat": "..."} only when the latest exchange leaves the user at a key moment whose outcome is truly uncertain and worth leaving to chance: a risky act, persuading or deceiving someone who resists, a chase, a fight, sneaking past someone, a feat of skill. "stakes" is one short question to the user saying what is at stake ("Can you talk the guard into letting you pass?"). "stat" is the one Stat above that applies, or null.`,
        'Never offer during an intimate, romantic or sexual moment, tenderness, rest or ordinary talk, unless the user\'s latest message itself asks to leave something to chance. Most turns have none: when in doubt, "roll_offer" is null.',
    ].join('\n');
}

const str = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/** Read loosely: an object with a non-empty `stakes`; anything else is no offer. */
export function readJudgedRollOffer(value: unknown): JudgedRollOffer | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const stakes = str(record.stakes);
    if (!stakes) return null;
    const stat = str(record.stat);
    return { stakes, stat: stat && stat.toLowerCase() !== 'null' && stat.toLowerCase() !== 'none' ? stat : null };
}

/**
 * The offer to store: none when not allowed (logged as dropped), stakes on one line and cut to
 * `STAKES_MAX`, and a Stat the Role doesn't have made null while the offer stays.
 */
export function applyRollOffer(
    input: { allowed: boolean; stats: readonly RoleStat[] },
    judged: JudgedRollOffer | null,
): { offer: { stakes: string; stat: string | null } | null; rejected: string[] } {
    if (!judged) return { offer: null, rejected: [] };
    if (!input.allowed) return { offer: null, rejected: [`roll offer "${judged.stakes}": none is allowed now`] };
    const stat = statNamed(input.stats, judged.stat);
    const rejected = judged.stat && !stat ? [`roll offer stat "${judged.stat}": the Role has no such Stat`] : [];
    return { offer: { stakes: judged.stakes.slice(0, STAKES_MAX).trim(), stat: stat?.name ?? null }, rejected };
}

/**
 * The offer the Chat shows: the one on its newest Message, when that is an AI Message, the offer
 * is not dismissed, and the Story's offers are on. Its Stat with the Role's number now.
 */
export function pendingRollOffer(
    input: { rollOffers: boolean; stats: readonly RoleStat[] },
    newest: Pick<OfferMessage, 'kind' | 'rollOffer'> | undefined,
): RollOfferView | null {
    if (!input.rollOffers || !newest || newest.kind !== MessageKind.Ai || !newest.rollOffer || newest.rollOffer.dismissed) return null;
    const stat = statNamed(input.stats, newest.rollOffer.stat);
    return { stakes: newest.rollOffer.stakes, stat: stat ? { name: stat.name, bonus: stat.value } : null };
}

/**
 * A Role's Stats as sent, checked: at most `MAX_STATS`, each a one-line name of 1 to
 * `STAT_NAME_MAX` characters, unique ignoring case, and a whole number from `STAT_MIN` to
 * `STAT_MAX`. Returns why not, or null when the list is fine.
 */
export function statsProblem(stats: readonly RoleStat[]): string | null {
    if (stats.length > MAX_STATS) return `A Role has at most ${MAX_STATS} Stats.`;
    const seen = new Set<string>();
    for (const stat of stats) {
        const name = stat.name.trim();
        if (!name || name.length > STAT_NAME_MAX || /[\r\n]/.test(name)) return `A Stat's name is 1 to ${STAT_NAME_MAX} characters on one line.`;
        if (seen.has(name.toLowerCase())) return `Two Stats are called "${name}".`;
        seen.add(name.toLowerCase());
        if (!Number.isInteger(stat.value) || stat.value < STAT_MIN || stat.value > STAT_MAX) return `A Stat is a whole number from ${STAT_MIN} to ${STAT_MAX}.`;
    }
    return null;
}
