import { DetailKind } from '../../../model/ledger/entities/detail-change.entity.js';
import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { NewDetail } from './details.js';
import { saidByUser } from './facts.js';

/**
 * Items (.scratch/story-items/spec.md): the things a Chat's story keeps track of (a key, a letter, a
 * ring, a gift, a weapon), who holds each and how it came to them, until it is used up, lost or
 * destroyed. An Item is a detail record of kind `item` whose value is JSON; the newest record of a
 * name wins. The Judge gives the changes an exchange shows and `applyItems` decides what is taken;
 * the Narrator reads the list in the closing message. Pure logic over plain inputs.
 */

export const ITEM_NAME_MAX = 60;
export const ITEM_HOLDER_MAX = 60;
export const ITEM_HOW_MAX = 80;
/** The most Items held at once: a new one past it is dropped. Gone ones do not count. */
export const ITEMS_MAX = 30;
/** The most Item changes one judgement may give. */
export const ITEMS_PER_TURN = 3;
/** The gone Items the Narrator reads, newest first. */
export const ITEMS_GONE_SHOWN = 5;
/** What answering about them adds to the Judge's token cap. */
export const ITEMS_EXTRA_TOKENS = 140;
/** The heading of the Judge's section and of the Narrator's block. */
export const ITEMS_HEADING = '# Items';
/** How the user is stored as a holder, whatever identity they wear. */
export const USER_HOLDER = '{user}';

/** How an Item ended: used up, lost or destroyed. */
export const ITEM_ENDS = ['used', 'lost', 'destroyed'] as const;
export type ItemEnd = (typeof ITEM_ENDS)[number];

export interface ChatItem {
    name: string;
    /** `{user}`, a Character's name, or anyone or anywhere else in a few words. */
    holder: string;
    /** How it came to the holder, or how it ended; may be empty. */
    how: string;
    /** Null while it is still held. */
    end: ItemEnd | null;
}

/** An Item as the Items sheet shows it. */
export interface ShownItem extends ChatItem {
    /** The current record is the user's own. */
    byUser: boolean;
}

/** A detail record as the Items read it. */
export interface ItemRecord {
    kind: DetailKind;
    value: string;
    /** Null for a record the user made in the Items sheet; left out, a Judge's. */
    messageId?: number | null;
}

export interface ItemsState {
    /** In the order they were first recorded, held and gone alike. */
    items: ShownItem[];
    /** The names (as `itemKey`) the user deleted, which nothing has recorded since. */
    clearedByUser: string[];
}

/** A name compared loosely: case, punctuation and a leading "the", "a" or "an" aside. */
export function itemKey(name: string): string {
    return name
        .toLowerCase()
        .replace(/[’']/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .replace(/^(the|a|an) /, '');
}

/** One line, no full stop at the end, no longer than allowed. */
function tidy(value: string, max: number): string {
    return value.replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '').slice(0, max).trim();
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** One of the three ends, read loosely ("used up", "Destroyed"); anything else is none. */
export function readItemEnd(value: unknown): ItemEnd | null {
    const given = str(value).toLowerCase();
    if (given === 'used' || given === 'used up' || given === 'used_up') return 'used';
    return (ITEM_ENDS as readonly string[]).includes(given) ? (given as ItemEnd) : null;
}

/** How an Item is stored. */
export function itemValue(item: ChatItem): string {
    return JSON.stringify({ name: item.name, holder: item.holder, how: item.how, end: item.end });
}

/** How the user's delete is stored. */
export function removedItemValue(name: string): string {
    return JSON.stringify({ name, removed: true });
}

/** A stored value read back; null for one that is not an Item's. */
function readValue(value: string): (ChatItem & { removed: false }) | { name: string; removed: true } | null {
    let json: unknown;
    try {
        json = JSON.parse(value);
    } catch {
        return null;
    }
    if (!isObject(json) || !str(json.name)) return null;
    if (json.removed === true) return { name: str(json.name), removed: true };
    return { name: str(json.name), holder: str(json.holder), how: str(json.how), end: readItemEnd(json.end), removed: false };
}

/**
 * The Items as they stand, in the order first recorded (a changed one keeps its place and its
 * name's wording), with whose record each is, and the names the user deleted that nothing has
 * recorded since.
 */
export function itemsState(records: readonly ItemRecord[]): ItemsState {
    const items = new Map<string, ShownItem>();
    const cleared = new Set<string>();
    for (const record of records) {
        if (record.kind !== DetailKind.Item) continue;
        const read = readValue(record.value);
        if (!read) continue;
        const key = itemKey(read.name);
        if (key === '') continue;
        const byUser = record.messageId === null;
        cleared.delete(key);
        if (read.removed) {
            items.delete(key);
            if (byUser) cleared.add(key);
            continue;
        }
        const listed = items.get(key);
        items.set(key, { name: listed?.name ?? read.name, holder: read.holder, how: read.how, end: read.end, byUser });
    }
    return { items: [...items.values()], clearedByUser: [...cleared] };
}

/** The Items as they stand, without whose record each is. */
export function currentItems(records: readonly ItemRecord[]): ChatItem[] {
    return itemsState(records).items.map(({ name, holder, how, end }) => ({ name, holder, how, end }));
}

const held = (items: readonly ChatItem[]) => items.filter((item) => item.end === null);
const gone = (items: readonly ChatItem[]) => items.filter((item) => item.end !== null);

/** What an Item's end reads as. */
const END_WORDS: Record<ItemEnd, string> = { used: 'used up', lost: 'lost', destroyed: 'destroyed' };

// ---------------------------------------------------------------------------------------------
// The Judge
// ---------------------------------------------------------------------------------------------

/** A holder as the Judge reads it: the user as "user". */
function judgeHolder(holder: string): string {
    return holder === USER_HOLDER ? 'user' : holder;
}

/**
 * The Judge's section: the Items held, the gone ones, then the rule. Sent on every judgement, so
 * the reply shape that names `items` is on every call and the system message never changes.
 */
export function judgeItemsSection(items: readonly ChatItem[]): string {
    const holding = held(items).map((item) => `- ${item.name}: held by ${judgeHolder(item.holder)}${item.how ? `, ${item.how}` : ''}`);
    const ended = gone(items).map((item) => `- ${item.name}: ${END_WORDS[item.end!]}${item.how ? `, ${item.how}` : ''}`);
    return [
        ITEMS_HEADING,
        holding.length > 0 ? holding.join('\n') : '(none yet)',
        ...(ended.length > 0 ? ['Gone:', ...ended] : []),
        `Items rule: add "items": [{"item": "...", "holder": "...", "how": "...", "end": null}] to your JSON for each thing that matters to the story (a key, a letter, a ring, a gift, a weapon, a map) that the latest exchange shows come to someone (found, given, taken, bought, made), change hands, or end. "item": a few words naming it; a listed one exactly as listed. "holder": "user", a Character's name, or who else has it or where it is now, in a few words. "how": how it came to them, in a few words ("found in the well", "given by Nara", "bought at the market"). "end": "used" when it is used up, "lost" or "destroyed" when it ends, with "how" saying how; otherwise null. Only what the exchange shows happen: never what someone plans, offers or asks for. Not clothes being worn, food eaten at once, furniture or the scenery. A thing that is gone stays gone.`,
        `Leave "items" out when nothing changed; at most ${ITEMS_PER_TURN} a turn.`,
    ].join('\n');
}

/** The field the reply shape names, so the Judge returns it (.scratch/story-quality/spec.md, "Real-model check"). */
export const ITEMS_SHAPE = '"items":[{"item":"...","holder":"...","how":"...","end":null}]';

/**
 * The reply shape with `items`. Added whenever the Items section is sent, which is every
 * judgement, so the system message is the same from call to call. Added before `new_event`
 * (`withAiEvents` goes on after it). Where the shape no longer ends as expected it is unchanged.
 */
export function withItemsShape(system: string): string {
    return system.replace(/\}\nEmpty arrays when nothing changed\.$/, `,\n ${ITEMS_SHAPE}}\nEmpty arrays when nothing changed.`);
}

/**
 * The Judge's prompt with Items added around it: the shape on the system message, and the section
 * after everything else in the user message, with room to answer. `judge-prompt.ts` is untouched,
 * so a prompt built without this is byte for byte what it was.
 */
export function withItemsJudge<P extends { messages: PromptMessage[]; maxTokens: number }>(prompt: P, section: string): P {
    const messages = prompt.messages.map((message, index) => {
        if (index === 0 && message.role === 'system') return { ...message, content: withItemsShape(message.content) };
        if (index === prompt.messages.length - 1 && message.role === 'user') return { ...message, content: `${message.content}\n\n${section}` };
        return message;
    });
    return { ...prompt, messages, maxTokens: prompt.maxTokens + ITEMS_EXTRA_TOKENS };
}

/** One Item change the Judge gave, read loosely. */
export interface JudgedItem {
    item: string;
    holder: string;
    how: string;
    end: ItemEnd | null;
}

/** Reads `items`: an entry without an item name is left out; a holder, how or end that is not text is empty. */
export function readJudgedItems(value: unknown): JudgedItem[] {
    return (Array.isArray(value) ? value : []).flatMap((entry): JudgedItem[] =>
        isObject(entry) && str(entry.item) ? [{ item: str(entry.item), holder: str(entry.holder), how: str(entry.how), end: readItemEnd(entry.end) }] : [],
    );
}

/** The `items` of the Judge's reply, read from its JSON as the judgement is; none when there is nothing to read. */
export function readJudgedItemsFrom(reply: string): JudgedItem[] {
    const match = reply.match(/\{[\s\S]*\}/);
    if (!match) return [];
    try {
        const json: unknown = JSON.parse(match[0]);
        return isObject(json) ? readJudgedItems(json.items) : [];
    } catch {
        return [];
    }
}

/** Who a holder is: the user, a Character as the cast writes them, or the words given, tidied. */
export function itemHolder(given: string, context: { identityName: string; cast: readonly string[] }): string {
    const holder = tidy(given, ITEM_HOLDER_MAX);
    const lower = holder.toLowerCase();
    if (['user', 'you', 'the user', USER_HOLDER].includes(lower) || lower === context.identityName.trim().toLowerCase()) return USER_HOLDER;
    return context.cast.find((name) => name.toLowerCase() === lower) ?? holder;
}

/**
 * What one judgement changes, against the Items as they stand. `rejected` says why what the Judge
 * gave was not taken, for the log.
 *
 * - A new Item needs a holder, and is not kept when it ends as it comes; past `ITEMS_MAX` held it is dropped.
 * - A listed Item takes a new holder (with how it came to them) or an end; its holder given again is no change.
 * - Gone stays gone: an Item used up or destroyed is never brought back. A lost one comes back when
 *   someone holds it again.
 * - An Item the user deleted is recorded again only when the user's own words name it.
 * - One change an Item a turn, at most `ITEMS_PER_TURN` in all.
 */
export function applyItems(
    input: { current: readonly ChatItem[]; identityName: string; cast: readonly string[]; userText?: string; clearedByUser?: readonly string[] },
    judged: readonly JudgedItem[],
): { changes: NewDetail[]; rejected: string[] } {
    const changes: NewDetail[] = [];
    const rejected: string[] = [];
    const listed = new Map(input.current.map((item) => [itemKey(item.name), item]));
    const cleared = new Set(input.clearedByUser ?? []);
    let holding = held(input.current).length;
    const changed = new Set<string>();
    for (const entry of judged) {
        const given = tidy(entry.item, ITEM_NAME_MAX);
        const key = itemKey(given);
        if (key === '') continue;
        const now = listed.get(key);
        const name = now?.name ?? given;
        if (changed.has(key)) {
            rejected.push(`Item "${name}": a second change in one turn`);
            continue;
        }
        const holder = entry.holder ? itemHolder(entry.holder, input) : '';
        const how = tidy(entry.how, ITEM_HOW_MAX);
        let next: ChatItem;
        if (!now) {
            if (entry.end !== null) {
                rejected.push(`Item "${name}": ended as it came, not kept`);
                continue;
            }
            if (!holder) {
                rejected.push(`Item "${name}": no holder`);
                continue;
            }
            if (cleared.has(key) && !saidByUser(given, input.userText ?? '')) {
                rejected.push(`Item "${name}": the user deleted it, and their words do not name it`);
                continue;
            }
            if (holding >= ITEMS_MAX) {
                rejected.push(`Item "${name}": ${ITEMS_MAX} are held already`);
                continue;
            }
            next = { name, holder, how, end: null };
        } else if (now.end === 'used' || now.end === 'destroyed') {
            rejected.push(`Item "${name}": it was ${END_WORDS[now.end]}, and gone stays gone`);
            continue;
        } else if (entry.end !== null) {
            if (entry.end === now.end) {
                rejected.push(`Item "${name}": already ${END_WORDS[now.end]}`);
                continue;
            }
            next = { name, holder: now.holder, how: how || now.how, end: entry.end };
        } else if (!holder) {
            rejected.push(`Item "${name}": no holder and no end, nothing changed`);
            continue;
        } else if (now.end === null && holder.toLowerCase() === now.holder.toLowerCase()) {
            rejected.push(`Item "${name}": still held by ${holder}, unchanged`);
            continue;
        } else {
            // A new holder, or a lost Item found again.
            next = { name, holder, how, end: null };
        }
        if (changes.length >= ITEMS_PER_TURN) {
            rejected.push(`Item "${name}": more than ${ITEMS_PER_TURN} in one turn`);
            continue;
        }
        changed.add(key);
        if (next.end === null && (!now || now.end !== null)) holding++;
        if (next.end !== null && now?.end === null) holding--;
        changes.push({ kind: DetailKind.Item, characterId: null, value: itemValue(next) });
    }
    return { changes, rejected };
}

// ---------------------------------------------------------------------------------------------
// The Narrator
// ---------------------------------------------------------------------------------------------

/** A holder as the Narrator reads it: the user by the worn identity's name. */
function narratorHolder(holder: string, identityName: string): string {
    return holder === USER_HOLDER ? identityName : holder;
}

/**
 * The Narrator's block (.scratch/story-items/spec.md, "The Narrator"), in the turn's trailing blocks
 * after the Established facts: who holds what now, the five gone most recently, then one sentence.
 * Null with no Items.
 */
export function itemsBlock(items: readonly ChatItem[] | null | undefined, identityName: string): string | null {
    if (!items || items.length === 0) return null;
    const holding = held(items);
    const ended = gone(items).slice(-ITEMS_GONE_SHOWN).reverse();
    const lines = [`${ITEMS_HEADING} (who has what now; where the Story so far or an earlier reply says otherwise, this wins)`];
    for (const item of holding) lines.push(`- ${item.name}: ${narratorHolder(item.holder, identityName)} has it${item.how ? `, ${item.how}` : ''}`);
    if (ended.length > 0) {
        lines.push(`Gone, so no one has them: ${ended.map((item) => `${item.name} (${END_WORDS[item.end!]}${item.how ? `, ${item.how}` : ''})`).join('; ')}`);
    }
    lines.push('Only whoever has a thing can use, show or give it, and a thing that is gone stays gone.');
    return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// The user's own change, in the Items sheet
// ---------------------------------------------------------------------------------------------

/** What the user's change in the Items sheet comes to. */
export type UserItemChange =
    /** The record to write. */
    | { value: string }
    /** Already so: nothing to write. */
    | 'unchanged'
    /** A name with no letters or digits. */
    | 'no-name'
    /** Held, with no holder. */
    | 'no-holder'
    /** A new held Item, and `ITEMS_MAX` are held. */
    | 'full';

/**
 * The user's own Item, against the Items as they stand: tidied as the Judge's are, the name matched
 * loosely (a listed one keeps its wording), the holder read as the Judge's is. `remove` deletes it.
 */
export function userItemChange(
    current: readonly ChatItem[],
    given: { name: string; holder?: string; how?: string; end?: ItemEnd | null; remove?: boolean },
    context: { identityName: string; cast: readonly string[] },
): UserItemChange {
    const name = tidy(given.name, ITEM_NAME_MAX);
    const key = itemKey(name);
    if (key === '') return 'no-name';
    const listed = current.find((item) => itemKey(item.name) === key);
    if (given.remove) return listed ? { value: removedItemValue(listed.name) } : 'unchanged';
    const holder = given.holder?.trim() ? itemHolder(given.holder, context) : '';
    const end = given.end ?? null;
    if (end === null && !holder) return 'no-holder';
    const next: ChatItem = { name: listed?.name ?? name, holder: holder || (listed?.holder ?? ''), how: tidy(given.how ?? '', ITEM_HOW_MAX), end };
    if (listed && listed.holder === next.holder && listed.how === next.how && listed.end === next.end) return 'unchanged';
    if (end === null && (!listed || listed.end !== null) && held(current).length >= ITEMS_MAX) return 'full';
    return { value: itemValue(next) };
}
