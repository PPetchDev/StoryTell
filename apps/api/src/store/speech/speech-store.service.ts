import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { AppConfig } from '../../config/app-config.js';

/**
 * The speech folder on disk (.scratch/read-aloud/spec.md, "Audio cache"): Read aloud's audio
 * under `messages/<messageId>/<key>.mp3` and voice samples under `samples/<voice>.mp3`. It sits
 * outside the image folder, so backups never carry it: every file can be made again.
 *
 * Paths use `/` separators and the same safety rules as the image store. Only the API builds
 * them, from ids, hashes and listed voice ids.
 */
@Injectable()
export class SpeechStoreService {
    private readonly logger = new Logger(SpeechStoreService.name);

    constructor(private readonly config: AppConfig) {}

    /** The file's bytes, or undefined when it isn't there. */
    async read(relativePath: string): Promise<Buffer | undefined> {
        try {
            return await readFile(this.resolve(relativePath));
        } catch (error) {
            if (isMissing(error)) return undefined;
            throw error;
        }
    }

    /**
     * Writes the bytes at `relativePath`, creating the folders on the way. Written to a temporary
     * name first and then renamed, so a reader never sees half a file.
     */
    async write(relativePath: string, bytes: Buffer): Promise<void> {
        const absolutePath = this.resolve(relativePath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        const partial = `${absolutePath}.${randomBytes(4).toString('hex')}.part`;
        await writeFile(partial, bytes);
        try {
            await rename(partial, absolutePath);
        } catch (error) {
            await rm(partial, { force: true });
            throw error;
        }
    }

    /** The names of the files directly in a folder; empty when the folder isn't there. */
    async files(relativeDir: string): Promise<string[]> {
        return (await this.entries(relativeDir)).filter((entry) => entry.isFile()).map((entry) => entry.name);
    }

    /** The names of the folders directly in a folder; empty when the folder isn't there. */
    async folders(relativeDir: string): Promise<string[]> {
        return (await this.entries(relativeDir)).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    }

    /** Deletes a file or a whole folder if it is there; one already gone is not an error. */
    async remove(relativePath: string): Promise<void> {
        await rm(this.resolve(relativePath), { recursive: true, force: true });
    }

    /** Copies a folder and everything in it but files still being written; a source that isn't there copies nothing. */
    async copyFolder(fromDir: string, toDir: string): Promise<void> {
        const from = this.resolve(fromDir);
        const to = this.resolve(toDir);
        if ((await this.entries(fromDir)).length === 0) return;
        await mkdir(path.dirname(to), { recursive: true });
        await cp(from, to, { recursive: true, force: true, filter: (source) => !source.endsWith('.part') });
    }

    private async entries(relativeDir: string) {
        try {
            return await readdir(this.resolve(relativeDir), { withFileTypes: true });
        } catch (error) {
            if (isMissing(error)) return [];
            throw error;
        }
    }

    private resolve(relativePath: string): string {
        const segments = relativePath.split('/');
        const unsafe = segments.some((segment) => segment === '' || segment === '.' || segment === '..' || /[\\:\0]/.test(segment));
        if (unsafe) throw new Error(`Unsafe speech path: ${relativePath}`);
        const absolutePath = path.resolve(this.config.speechDir, ...segments);
        if (!absolutePath.startsWith(this.config.speechDir + path.sep)) throw new Error(`Unsafe speech path: ${relativePath}`);
        return absolutePath;
    }
}

function isMissing(error: unknown): boolean {
    return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}
