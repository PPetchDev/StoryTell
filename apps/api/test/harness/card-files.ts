import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

// Plain TypeScript with no decorators or path aliases: the Playwright harness in apps/web
// imports this file too.

const CARDS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/character-cards');

/** A hand-made card file from test/fixtures/character-cards. */
export function cardFixture(name: string): Buffer {
    return readFileSync(path.join(CARDS, name));
}

/** The card file's JSON, to change one field and send it again. */
export function cardFixtureJson(name: string): any {
    return JSON.parse(cardFixture(name).toString('utf8'));
}

/** A V2 card's JSON with the given `data` fields over a small default. */
export function v2Card(data: Record<string, unknown> = {}): any {
    return {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
            name: 'Rowan',
            description: '{{char}} is a ferryman in his fifties.',
            personality: 'Patient.',
            scenario: '{{user}} needs to cross the river.',
            first_mes: '"Fare\'s a silver, {{user}}."',
            mes_example: '',
            creator_notes: '',
            system_prompt: '',
            post_history_instructions: '',
            alternate_greetings: [],
            tags: [],
            creator: '',
            character_version: '',
            extensions: {},
            ...data,
        },
    };
}

/** A V3 card's JSON with the given `data` fields over a small default. */
export function v3Card(data: Record<string, unknown> = {}): any {
    const v2 = v2Card(data);
    return { spec: 'chara_card_v3', spec_version: '3.0', data: { nickname: '', group_only_greetings: [], assets: [], ...v2.data } };
}

export function jsonFile(card: unknown): Buffer {
    return Buffer.from(JSON.stringify(card), 'utf8');
}

// --- PNG cards, built in code (no card from the internet is checked in) ---

function chunk(type: string, data: Buffer): Buffer {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A real, decodable RGB PNG: a vertical gradient from `top` to `bottom`. */
export function pngImage(width = 32, height = 48, top: [number, number, number] = [200, 90, 120], bottom: [number, number, number] = [40, 30, 80]): Buffer {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8; // bit depth
    header[9] = 2; // RGB
    const rows: Buffer[] = [];
    for (let y = 0; y < height; y++) {
        const row = Buffer.alloc(1 + width * 3);
        const t = height === 1 ? 0 : y / (height - 1);
        for (let x = 0; x < width; x++) {
            for (let c = 0; c < 3; c++) row[1 + x * 3 + c] = Math.round(top[c] + (bottom[c] - top[c]) * t);
        }
        rows.push(row);
    }
    return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

export interface PngCardOptions {
    /** The V2 definition, written as a `chara` chunk. */
    chara?: unknown;
    /** The V3 definition, written as a `ccv3` chunk. */
    ccv3?: unknown;
    /** The keywords as written, e.g. 'Chara' to test matching ignoring case. */
    keywords?: { chara?: string; ccv3?: string };
    /** Other text chunks, e.g. a large `Comment` to make the file big. */
    extraText?: Array<{ keyword: string; text: string }>;
    image?: Buffer;
}

/** A PNG card: the picture's chunks, then the card's `tEXt` chunks (base64 of UTF-8 JSON) before `IEND`. */
export function pngCard(options: PngCardOptions): Buffer {
    const image = options.image ?? pngImage();
    const iend = image.length - 12;
    const text = (keyword: string, value: string) => chunk('tEXt', Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(value, 'latin1')]));
    const encode = (card: unknown) => Buffer.from(JSON.stringify(card), 'utf8').toString('base64');
    const chunks: Buffer[] = [];
    for (const extra of options.extraText ?? []) chunks.push(text(extra.keyword, extra.text));
    if (options.chara !== undefined) chunks.push(text(options.keywords?.chara ?? 'chara', encode(options.chara)));
    if (options.ccv3 !== undefined) chunks.push(text(options.keywords?.ccv3 ?? 'ccv3', encode(options.ccv3)));
    return Buffer.concat([image.subarray(0, iend), ...chunks, image.subarray(iend)]);
}

/** The chunk types of a PNG, in order. */
export function chunkTypes(png: Buffer): string[] {
    const types: string[] = [];
    let offset = 8;
    while (offset + 12 <= png.length) {
        const length = png.readUInt32BE(offset);
        types.push(png.toString('latin1', offset + 4, offset + 8));
        offset += 12 + length;
    }
    return types;
}

/** A PNG's chunks with their data, for comparing the image data of two files. */
export function chunksOf(png: Buffer): Array<{ type: string; data: Buffer }> {
    const chunks: Array<{ type: string; data: Buffer }> = [];
    let offset = 8;
    while (offset + 12 <= png.length) {
        const length = png.readUInt32BE(offset);
        chunks.push({ type: png.toString('latin1', offset + 4, offset + 8), data: png.subarray(offset + 8, offset + 8 + length) });
        offset += 12 + length;
    }
    return chunks;
}
