import { Injectable } from '@nestjs/common';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import { AppConfig } from '../../config/app-config.js';
import { ImageNotFoundError, InvalidImagePathError } from '../../errors/image.errors.js';

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
