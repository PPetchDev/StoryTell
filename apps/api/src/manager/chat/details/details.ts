import { DetailKind } from '../../../model/ledger/entities/detail-change.entity.js';

/**
 * Place, Weather and Outfits (.scratch/info-box/spec.md): a Chat's current values read from its
 * records, what the Judge is asked and how its answer is applied, and what the Narrator and the
 * Snapshot writer are told. Pure logic over plain inputs: the managers gather them.
 */

/** The longest each may be, in characters: a few words for a Place or the Weather, a short phrase for an Outfit. */
export const DETAIL_MAX: Record<DetailKind, number> = {
    [DetailKind.Place]: 80,
    [DetailKind.Weather]: 60,
    [DetailKind.Outfit]: 160,
};

/** A recorded change, oldest first in a list. */
export interface DetailRecord {
    kind: DetailKind;
    characterId: number | null;
    value: string;
}

/** A Chat's Place, Weather and Outfits as they stand. */
export interface ChatDetails {
    /** null until the story makes it clear. */
    place: string | null;
    weather: string | null;
    /** One per Character whose Outfit the story has shown, in the order they were first set. */
    outfits: Array<{ characterId: number; outfit: string }>;
}

/** The current values: the newest record of each kind, and of each Character's Outfit. */
export function currentDetails(records: readonly DetailRecord[]): ChatDetails {
    let place: string | null = null;
    let weather: string | null = null;
    const outfits = new Map<number, string>();
    for (const record of records) {
        if (record.kind === DetailKind.Place) place = record.value;
        else if (record.kind === DetailKind.Weather) weather = record.value;
        else if (record.characterId !== null) outfits.set(record.characterId, record.value);
    }
    return { place, weather, outfits: [...outfits].map(([characterId, outfit]) => ({ characterId, outfit })) };
}

/** What the Judge answered, read loosely; null when it said nothing readable. */
export interface JudgedDetails {
    place: string | null;
    weather: string | null;
    outfits: Array<{ character: string; outfit: string }>;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Reads the judgement's `details` object: strings only, anything else is left out. */
export function readJudgedDetails(value: unknown): JudgedDetails | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const fields = value as Record<string, unknown>;
    const outfits = (Array.isArray(fields.outfits) ? fields.outfits : []).flatMap((item): JudgedDetails['outfits'] => {
        if (typeof item !== 'object' || item === null) return [];
        const entry = item as Record<string, unknown>;
        return text(entry.character) && text(entry.outfit) ? [{ character: text(entry.character), outfit: text(entry.outfit) }] : [];
    });
    const place = text(fields.place) || null;
    const weather = text(fields.weather) || null;
    return place === null && weather === null && outfits.length === 0 ? null : { place, weather, outfits };
}

export interface DetailsCastMember {
    id: number;
    name: string;
}

/**
 * The Judge's section about the Place, the Weather and the Outfits: what each is now, then the
 * rule and the JSON field, so the system message never changes. Read after the latest exchange.
 */
export function judgeDetailsSection(details: ChatDetails, cast: readonly DetailsCastMember[]): string {
    const wearing = cast.map((member) => `${member.name}: ${details.outfits.find((entry) => entry.characterId === member.id)?.outfit ?? 'not yet known'}`);
    return [
        '# Place, weather and outfits',
        `Place: ${details.place ?? 'not yet known'}`,
        `Weather: ${details.weather ?? 'not yet known'}`,
        `Wearing: ${wearing.join('; ') || '(no Characters)'}`,
        'Details rule: add "details": {"place": "...", "weather": "...", "outfits": [{"character": "Name", "outfit": "..."}]} to your JSON, giving only what the latest exchange changed or first made clear; leave the rest out, and leave "details" out when nothing did. "place": where the story is at the end of the exchange, in a few words ("the lamp room"). "weather": a few words, only as the story shows it. "outfit": what that Character is wearing now, in one short phrase, when they change, put something on or take something off, or when the story first describes it. Read them from the story; never guess.',
    ].join('\n');
}

/** What answering about them adds to the judge's token cap. */
export const DETAILS_EXTRA_TOKENS = 120;

/** A change to record against the judged Message. */
export interface NewDetail {
    kind: DetailKind;
    characterId: number | null;
    value: string;
}

/** One line, no stray spaces, no full stop at the end, and no longer than its kind allows. */
function tidy(value: string, kind: DetailKind): string {
    return value.replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '').slice(0, DETAIL_MAX[kind]).trim();
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * What one judgement changes. A value equal to the current one is not a change; an Outfit needs a
 * Character of the cast who is not sitting out, and each Character takes one a turn. `rejected`
 * says why what the Judge gave was not taken, for the log.
 */
export function applyDetails(
    input: { current: ChatDetails; cast: readonly DetailsCastMember[]; sittingOut?: readonly number[] },
    judged: JudgedDetails | null,
): { changes: NewDetail[]; rejected: string[] } {
    const changes: NewDetail[] = [];
    const rejected: string[] = [];
    if (!judged) return { changes, rejected };
    const single = (kind: DetailKind.Place | DetailKind.Weather, given: string | null, now: string | null, label: string) => {
        if (given === null) return;
        const value = tidy(given, kind);
        if (value === '') return;
        if (now !== null && same(now, value)) rejected.push(`${label}: still "${value}" — not a change`);
        else changes.push({ kind, characterId: null, value });
    };
    single(DetailKind.Place, judged.place, input.current.place, 'Place');
    single(DetailKind.Weather, judged.weather, input.current.weather, 'Weather');

    const sittingOut = new Set(input.sittingOut ?? []);
    const dressed = new Set<number>();
    for (const entry of judged.outfits) {
        const character = input.cast.find((member) => same(member.name, entry.character));
        if (!character) {
            rejected.push(`Outfit of ${entry.character}: unknown name`);
            continue;
        }
        if (sittingOut.has(character.id)) {
            rejected.push(`Outfit of ${character.name}: sitting out`);
            continue;
        }
        if (dressed.has(character.id)) {
            rejected.push(`Outfit of ${character.name}: a second one in one turn`);
            continue;
        }
        const value = tidy(entry.outfit, DetailKind.Outfit);
        if (value === '') continue;
        const now = input.current.outfits.find((outfit) => outfit.characterId === character.id)?.outfit;
        if (now !== undefined && same(now, value)) {
            rejected.push(`Outfit of ${character.name}: unchanged`);
            continue;
        }
        dressed.add(character.id);
        changes.push({ kind: DetailKind.Outfit, characterId: character.id, value });
    }
    return { changes, rejected };
}

/** The details as a prompt names them: Outfits by Character name, in cast order. */
export interface PromptDetails {
    place: string | null;
    weather: string | null;
    outfits: Array<{ name: string; outfit: string }>;
}

/** The Chat's details with each Outfit under its Character's name, in cast order; a Character gone from the cast is left out. */
export function promptDetails(details: ChatDetails, cast: readonly DetailsCastMember[]): PromptDetails {
    return {
        place: details.place,
        weather: details.weather,
        outfits: cast.flatMap((member) => {
            const outfit = details.outfits.find((entry) => entry.characterId === member.id)?.outfit;
            return outfit ? [{ name: member.name, outfit }] : [];
        }),
    };
}

/**
 * The sentences "Where things stand" adds for them: the Place and the Weather after the Scene and
 * the Time, and what the Characters named in `present` are wearing. Nothing for what is not known.
 */
export function detailsReminder(details: PromptDetails | null | undefined, present: readonly string[]): { where: string[]; wearing: string | null } {
    if (!details) return { where: [], wearing: null };
    const where: string[] = [];
    if (details.place) where.push(`Place: ${details.place}.`);
    if (details.weather) where.push(`Weather: ${details.weather}.`);
    const outfits = details.outfits.filter((entry) => present.includes(entry.name));
    const wearing =
        outfits.length > 0
            ? `Wearing now: ${outfits.map((entry) => `${entry.name}, ${entry.outfit}`).join('; ')}. Keep them dressed so until the story changes it.`
            : null;
    return { where, wearing };
}
