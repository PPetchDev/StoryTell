import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

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

/**
 * The widths a thumbnail is made at (audit H33): a Gallery tile or a Home cover is at most about
 * 12rem wide, so 320 covers a phone's 2x screen and 640 a 3x one or the Story sheet's banner.
 */
export const THUMBNAIL_WIDTHS = [320, 640] as const;
export type ThumbnailWidth = (typeof THUMBNAIL_WIDTHS)[number];

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
    private readonly logger = new Logger(ImageStoreService.name);
    /** Thumbnails being made, so two requests for the same one make it once. */
    private readonly making = new Map<string, Promise<void>>();

    constructor(private readonly config: AppConfig) {}

    /**
     * Thumbnails live beside the image folder, never in it: they can be made again from the
     * images at any time, so the backup (which copies the image folder) leaves them out.
     */
    get thumbnailDir(): string {
        return `${this.config.imageDir}-thumbnails`;
    }

    /** `relativePath` uses `/` separators, as stored in the database. */
    async open(relativePath: string): Promise<StoredImage> {
        const absolutePath = this.resolve(relativePath);
        const mimeType = MIME_TYPES[path.extname(absolutePath).toLowerCase()];
        if (!mimeType) throw new ImageNotFoundError();

        const stats = await stat(absolutePath).catch(() => undefined);
        if (!stats?.isFile()) throw new ImageNotFoundError();

        return { absolutePath, mimeType, size: stats.size };
    }

    /**
     * A smaller WebP copy of the image, `width` pixels wide at most, made the first time it is
     * asked for and kept on disk. Every stored image has a name of its own (a replaced picture
     * gets a new one), so a thumbnail never goes stale. A picture the encoder can't read is
     * answered as it is, so the page still shows something.
     */
    async thumbnail(relativePath: string, width: ThumbnailWidth): Promise<StoredImage> {
        const original = await this.open(relativePath);
        const absolutePath = this.thumbnailPath(relativePath, width);
        const existing = await stat(absolutePath).catch(() => undefined);
        if (existing?.isFile()) return { absolutePath, mimeType: 'image/webp', size: existing.size };

        let pending = this.making.get(absolutePath);
        if (!pending) {
            pending = this.makeThumbnail(original.absolutePath, absolutePath, width).finally(() => this.making.delete(absolutePath));
            this.making.set(absolutePath, pending);
        }
        try {
            await pending;
        } catch (error) {
            this.logger.warn(`No thumbnail for ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
            return original;
        }
        const made = await stat(absolutePath);
        return { absolutePath, mimeType: 'image/webp', size: made.size };
    }

    private async makeThumbnail(from: string, to: string, width: ThumbnailWidth): Promise<void> {
        const bytes = await sharp(from).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
        await mkdir(path.dirname(to), { recursive: true });
        // Written whole under another name first, so a reader never gets half a file.
        const partial = `${to}.${randomBytes(4).toString('hex')}.part`;
        await writeFile(partial, bytes);
        await rename(partial, to);
    }

    /** Where a thumbnail is kept; `relativePath` has been checked by `resolve` already. */
    private thumbnailPath(relativePath: string, width: ThumbnailWidth): string {
        return path.join(this.thumbnailDir, String(width), ...relativePath.split('/')) + '.webp';
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

    /** Deletes the file and its thumbnails if they are there; a file already gone is not an error. */
    async remove(relativePath: string): Promise<void> {
        await rm(this.resolve(relativePath), { force: true });
        for (const width of THUMBNAIL_WIDTHS) await rm(this.thumbnailPath(relativePath, width), { force: true });
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
