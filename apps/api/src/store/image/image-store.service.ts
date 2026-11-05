import { Injectable } from '@nestjs/common';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AppConfig } from '../../config/app-config.js';
import { ImageNotFoundError, InvalidImagePathError } from '../../errors/image.errors.js';
import { ImageData } from '../../service/model-gateway/model-gateway.js';

/** The extension a stored image gets, by MIME type; the inverse of MIME_TYPES. */
const EXTENSIONS: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
};

const MIME_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
};

export interface StoredImage {
    absolutePath: string;
    mimeType: string;
    size: number;
}

/**
 * The image folder on disk. The database only ever holds paths relative to it, so the
 * folder can be backed up and restored as one unit.
 */
@Injectable()
export class ImageStoreService {
    constructor(private readonly config: AppConfig) {}

    /** `relativePath` uses `/` separators, as stored in the database. */
    async open(relativePath: string): Promise<StoredImage> {
        const absolutePath = this.resolve(relativePath);
        const mimeType = MIME_TYPES[path.extname(absolutePath).toLowerCase()];
        if (!mimeType) throw new ImageNotFoundError();

        const stats = await stat(absolutePath).catch(() => undefined);
        if (!stats?.isFile()) throw new ImageNotFoundError();

        return { absolutePath, mimeType, size: stats.size };
    }

    /** The file's bytes, e.g. a Reference image to send along with a Snapshot. */
    async read(relativePath: string): Promise<ImageData> {
        const image = await this.open(relativePath);
        return { bytes: await readFile(image.absolutePath), mimeType: image.mimeType };
    }

    /** The extension a file of this type is stored with; undefined for a type the store can't serve. */
    static extensionFor(mimeType: string): string | undefined {
        return EXTENSIONS[mimeType.split(';')[0].trim().toLowerCase()];
    }

    /**
     * The type the bytes really are, read from their first bytes; undefined for anything the
     * store can't serve. For files from outside, whose declared type can't be trusted.
     */
    static sniffMimeType(bytes: Buffer): string | undefined {
        if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
        if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
        if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
        return undefined;
    }

    /** Writes the bytes at `relativePath`, creating the folders on the way. */
    async write(relativePath: string, bytes: Buffer): Promise<void> {
        const absolutePath = this.resolve(relativePath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, bytes);
    }

    /** Deletes the file if it is there; a file already gone is not an error. */
    async remove(relativePath: string): Promise<void> {
        await rm(this.resolve(relativePath), { force: true });
    }

    private resolve(relativePath: string): string {
        const segments = relativePath.split('/');
        const unsafe = segments.some(
            (segment) =>
                segment === '' ||
                segment === '.' ||
                segment === '..' ||
                /[\\:\0]/.test(segment),
        );
        if (unsafe) throw new InvalidImagePathError();

        const absolutePath = path.resolve(this.config.imageDir, ...segments);
        // Belt and braces: the segment check above should already make escaping impossible.
        if (!absolutePath.startsWith(this.config.imageDir + path.sep)) {
            throw new InvalidImagePathError();
        }
        return absolutePath;
    }
}
