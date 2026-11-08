import { NoCardInPictureError, UnreadableCardError, UnsupportedCardError } from '../../errors/character-card.errors.js';
import { ImageStoreService } from '../../store/image/image-store.service.js';
import { isPng, PngChunk, PngFormatError, readChunks, readText, withoutText } from './card-png.js';

/**
 * Reading a Character card (spec: "Reading a card"). Bytes in, a normalised card out: the
 * V2/V3 `data` fields with absent strings defaulted to "" and absent lists to [], whatever
 * the card's version. Pure: no database, no network, no image decoding.
 */

export type CardFormat = 'v1' | 'v2' | 'v3';

export interface CardBookEntry {
    keys: string[];
    secondary_keys: string[];
    content: string;
    enabled: boolean;
    constant: boolean;
    name: string;
    comment: string;
    /** V3: every key is a regular expression. */
    use_regex: boolean;
    /** Which of ENTRY_SETTINGS the entry sets, for the left-out list. */
    settings: string[];
}

export interface CardBook {
    entries: CardBookEntry[];
    /** Lorebook-level settings the card set (scan_depth, token_budget, recursive_scanning…), for the left-out list. */
    settings: string[];
}

export interface CardAsset {
    type: string;
    uri: string;
    name: string;
    ext: string;
}

export interface CardData {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    creator_notes: string;
    system_prompt: string;
    post_history_instructions: string;
    alternate_greetings: string[];
    tags: string[];
    creator: string;
    character_version: string;
    character_book: CardBook | null;
    extensions: Record<string, unknown>;
    /** V3 only. */
    nickname: string;
    group_only_greetings: string[];
    assets: CardAsset[];
}

export interface ReadCard {
    format: CardFormat;
    card: CardData;
    /** The card's picture as PNG bytes with its text chunks removed, or null. */
    picture: { bytes: Buffer; mimeType: string } | null;
}

export type CardKind = 'png' | 'json';

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/** The kind of card file, from its bytes alone: never its name or declared type. */
export function cardKind(bytes: Buffer): CardKind {
    if (isPng(bytes)) return 'png';
    const text = bytes.subarray(0, 4096);
    const start = text.subarray(0, 3).equals(UTF8_BOM) ? 3 : 0;
    for (let index = start; index < text.length; index++) {
        const byte = text[index];
        if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d) continue;
        if (byte === 0x7b) return 'json';
        break;
    }
    throw new UnsupportedCardError();
}

/** Any card file: PNG or JSON, told apart by the bytes. */
export function readCard(bytes: Buffer): ReadCard {
    return cardKind(bytes) === 'png' ? readPngCard(bytes) : readJsonCard(bytes);
}

/**
 * A JSON card file, BOM-led or not. A V3 card has a picture only when its main icon is a
 * `data:` URL of a PNG, JPEG or WebP; a URL is never fetched.
 */
export function readJsonCard(bytes: Buffer): ReadCard {
    const text = bytes.subarray(0, 3).equals(UTF8_BOM) ? bytes.subarray(3) : bytes;
    const read = readCardJson(text.toString('utf8'));
    return read.format === 'v3' ? { ...read, picture: iconPicture(read.card.assets) } : read;
}

/**
 * A PNG card: the `ccv3` chunk when there is one, else `chara`, each base64 of UTF-8 JSON. Its
 * picture is the PNG itself with every text chunk removed, so the card text never goes into
 * the Reference image file.
 */
export function readPngCard(bytes: Buffer): ReadCard {
    let chunks: PngChunk[];
    try {
        chunks = readChunks(bytes);
    } catch (error) {
        if (error instanceof PngFormatError) throw new UnreadableCardError('The picture is broken or cut short.');
        throw error;
    }
    const encoded = readText(chunks, 'ccv3') ?? readText(chunks, 'chara');
    if (encoded === null) throw new NoCardInPictureError();
    const read = readCardJson(Buffer.from(encoded.trim(), 'base64').toString('utf8'));
    return { ...read, picture: { bytes: withoutText(bytes), mimeType: 'image/png' } };
}

/** The main icon of a V3 card's assets, when it is a `data:` URL of a picture the store can serve. */
function iconPicture(assets: CardAsset[]): ReadCard['picture'] {
    const icon = assets.find((asset) => asset.type === 'icon' && asset.name === 'main') ?? assets.find((asset) => asset.type === 'icon');
    const match = icon && /^data:[^;,]*(;[^,]*)?,(.*)$/s.exec(icon.uri.trim());
    if (!match || !/;base64/i.test(match[1] ?? '')) return null;
    const bytes = Buffer.from(match[2], 'base64');
    const mimeType = ImageStoreService.sniffMimeType(bytes);
    if (!mimeType) return null;
    if (mimeType === 'image/png') {
        try {
            return { bytes: withoutText(bytes), mimeType };
        } catch {
            return null;
        }
    }
    return { bytes, mimeType };
}

/** The card's JSON text, from a file or from a PNG's card chunk. */
export function readCardJson(text: string): ReadCard {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new UnreadableCardError('Its JSON is broken.');
    }
    if (!isObject(parsed)) throw new UnreadableCardError('Its JSON is not an object.');

    let format: CardFormat;
    let data: Record<string, unknown>;
    if (parsed.spec === undefined) {
        format = 'v1';
        data = parsed;
    } else if (isObject(parsed.data)) {
        format = parsed.spec === 'chara_card_v2' ? 'v2' : 'v3';
        data = parsed.data;
    } else {
        throw new UnreadableCardError('It has a spec but no data.');
    }
    if (![data.name, data.description, data.first_mes].some((value) => typeof value === 'string')) {
        throw new UnreadableCardError('It has no name, description or first message.');
    }
    return { format, card: normalise(data), picture: null };
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return '';
}

function texts(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** Per-entry settings Storytell has no place for; named in the left-out list when a card sets them. */
export const ENTRY_SETTINGS = ['insertion_order', 'position', 'priority', 'case_sensitive'] as const;

function normaliseEntry(entry: Record<string, unknown>): CardBookEntry {
    // A SillyTavern world file writes `key` and `disable`; a card's book writes `keys` and `enabled`.
    const enabled = entry.enabled === undefined ? entry.disable !== true : entry.enabled !== false;
    return {
        keys: texts(entry.keys ?? entry.key),
        secondary_keys: texts(entry.secondary_keys ?? entry.keysecondary),
        content: text(entry.content),
        enabled,
        constant: entry.constant === true,
        name: text(entry.name),
        comment: text(entry.comment),
        use_regex: entry.use_regex === true,
        settings: ENTRY_SETTINGS.filter((key) => entry[key] !== undefined && entry[key] !== null),
    };
}

function normaliseBook(book: unknown): CardBook | null {
    if (!isObject(book)) return null;
    const entries = Array.isArray(book.entries)
        ? book.entries
        : isObject(book.entries)
          ? Object.values(book.entries)
          : [];
    return {
        entries: entries.filter(isObject).map(normaliseEntry),
        settings: ['scan_depth', 'token_budget', 'recursive_scanning'].filter(
            (key) => book[key] !== undefined && book[key] !== null,
        ),
    };
}

function normaliseAsset(asset: Record<string, unknown>): CardAsset {
    return { type: text(asset.type), uri: text(asset.uri), name: text(asset.name), ext: text(asset.ext) };
}

function normalise(data: Record<string, unknown>): CardData {
    return {
        name: text(data.name),
        description: text(data.description),
        personality: text(data.personality),
        scenario: text(data.scenario),
        first_mes: text(data.first_mes),
        mes_example: text(data.mes_example),
        creator_notes: text(data.creator_notes),
        system_prompt: text(data.system_prompt),
        post_history_instructions: text(data.post_history_instructions),
        alternate_greetings: texts(data.alternate_greetings),
        tags: texts(data.tags),
        creator: text(data.creator),
        character_version: text(data.character_version),
        character_book: normaliseBook(data.character_book),
        extensions: isObject(data.extensions) ? data.extensions : {},
        nickname: text(data.nickname),
        group_only_greetings: texts(data.group_only_greetings),
        assets: Array.isArray(data.assets) ? data.assets.filter(isObject).map(normaliseAsset) : [],
    };
}
