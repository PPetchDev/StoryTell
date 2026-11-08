import { crc32 } from 'node:zlib';

/**
 * The card PNG codec (spec: "Modules"): walks a PNG's chunks, reads `tEXt` chunks by keyword,
 * strips chunks and inserts `tEXt` chunks before `IEND`. No image decoding, no dependency.
 */

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The bytes are not a PNG, or one cut short. Callers turn it into their own domain error. */
export class PngFormatError extends Error {}

export interface PngChunk {
    type: string;
    data: Buffer;
}

export function isPng(bytes: Buffer): boolean {
    return bytes.subarray(0, 8).equals(PNG_SIGNATURE);
}

/** Every chunk up to and including `IEND`; anything after it is ignored. */
export function readChunks(bytes: Buffer): PngChunk[] {
    if (!isPng(bytes)) throw new PngFormatError('Not a PNG.');
    const chunks: PngChunk[] = [];
    let offset = 8;
    while (offset < bytes.length) {
        if (offset + 12 > bytes.length) throw new PngFormatError('The PNG is cut short.');
        const length = bytes.readUInt32BE(offset);
        const type = bytes.toString('latin1', offset + 4, offset + 8);
        const end = offset + 12 + length;
        if (end > bytes.length) throw new PngFormatError('The PNG is cut short.');
        chunks.push({ type, data: bytes.subarray(offset + 8, offset + 8 + length) });
        offset = end;
        if (type === 'IEND') return chunks;
    }
    throw new PngFormatError('The PNG has no end.');
}

export function writeChunks(chunks: PngChunk[]): Buffer {
    const parts: Buffer[] = [PNG_SIGNATURE];
    for (const chunk of chunks) {
        const head = Buffer.alloc(8);
        head.writeUInt32BE(chunk.data.length, 0);
        head.write(chunk.type, 4, 'latin1');
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), chunk.data])) >>> 0, 0);
        parts.push(head, chunk.data, crc);
    }
    return Buffer.concat(parts);
}

/** A `tEXt` chunk's keyword and text (Latin-1, as PNG defines it); null for any other chunk. */
export function textOf(chunk: PngChunk): { keyword: string; text: string } | null {
    if (chunk.type !== 'tEXt') return null;
    const split = chunk.data.indexOf(0);
    if (split < 0) return null;
    return { keyword: chunk.data.toString('latin1', 0, split), text: chunk.data.toString('latin1', split + 1) };
}

/** The text of the first `tEXt` chunk with this keyword, matched ignoring case; null when there is none. */
export function readText(chunks: PngChunk[], keyword: string): string | null {
    const wanted = keyword.toLowerCase();
    for (const chunk of chunks) {
        const text = textOf(chunk);
        if (text && text.keyword.toLowerCase() === wanted) return text.text;
    }
    return null;
}

export function textChunk(keyword: string, text: string): PngChunk {
    return { type: 'tEXt', data: Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(text, 'latin1')]) };
}

const TEXT_TYPES = new Set(['tEXt', 'zTXt', 'iTXt']);

/** The PNG with every text chunk removed: what a card's picture is stored as. */
export function withoutText(bytes: Buffer): Buffer {
    return writeChunks(readChunks(bytes).filter((chunk) => !TEXT_TYPES.has(chunk.type)));
}

/** A text chunk's keyword, for any of the three text types; null for other chunks. */
function keywordOf(chunk: PngChunk): string | null {
    if (!TEXT_TYPES.has(chunk.type)) return null;
    const split = chunk.data.indexOf(0);
    return split < 0 ? null : chunk.data.toString('latin1', 0, split);
}

/**
 * The PNG with the text chunks `drop` names removed (ignoring case), then `add` inserted
 * before `IEND`, each with its CRC.
 */
export function replaceText(bytes: Buffer, drop: (keyword: string) => boolean, add: Array<{ keyword: string; text: string }>): Buffer {
    const kept = readChunks(bytes).filter((chunk) => {
        const keyword = keywordOf(chunk);
        return keyword === null || !drop(keyword.toLowerCase());
    });
    const end = kept.findIndex((chunk) => chunk.type === 'IEND');
    kept.splice(end, 0, ...add.map(({ keyword, text }) => textChunk(keyword, text)));
    return writeChunks(kept);
}
