import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BookChapterEntity } from './entities/book-chapter.entity.js';

export interface WrittenBookChapter {
    title: string;
    text: string;
    sourceHash: string;
    sceneName: string;
}

/** Repository wrapper for Book chapters (.scratch/chat-novel/spec.md). The caller has checked the Chat is the Account's. */
@Injectable()
export class BookModelService {
    constructor(@InjectRepository(BookChapterEntity) private readonly chapters: Repository<BookChapterEntity>) {}

    chaptersOf(chatId: number): Promise<BookChapterEntity[]> {
        return this.chapters.find({ where: { chatId }, order: { number: 'ASC' } });
    }

    /**
     * The play model's text for a chapter. It lands unless the user wrote their own since the write began
     * (`startedAt`): the user's edit wins over a write that finishes after it. Answers whether it landed.
     */
    async writeAi(chatId: number, number: number, written: WrittenBookChapter, startedAt: Date): Promise<boolean> {
        const existing = await this.chapters.findOne({ where: { chatId, number } });
        if (existing && existing.writtenBy === 'user' && existing.updatedAt > startedAt) return false;
        await this.chapters.upsert(
            { chatId, number, ...written, writtenBy: 'ai', failed: null, updatedAt: new Date() },
            { conflictPaths: ['chatId', 'number'] },
        );
        return true;
    }

    /** Why a write failed. Any old text, title and author stay. */
    async fail(chatId: number, number: number, reason: string, sceneName: string): Promise<void> {
        const existing = await this.chapters.findOne({ where: { chatId, number } });
        if (existing) {
            await this.chapters.update({ id: existing.id }, { failed: reason });
            return;
        }
        await this.chapters.insert({ chatId, number, failed: reason, sceneName });
    }

    /**
     * The user's own title and text. Keeps the source hash: it still tells of the Messages it was written
     * from. A chapter with no hash yet takes `hash`, the Chapter's now.
     */
    async saveUser(chatId: number, number: number, title: string, text: string, sceneName: string, hash: string | null): Promise<void> {
        const existing = await this.chapters.findOne({ where: { chatId, number } });
        if (existing) {
            await this.chapters.update(
                { id: existing.id },
                { title, text, writtenBy: 'user', failed: null, sourceHash: existing.sourceHash ?? hash, updatedAt: new Date() },
            );
            return;
        }
        await this.chapters.insert({ chatId, number, title, text, writtenBy: 'user', sceneName, sourceHash: hash });
    }

    async remove(chatId: number, number: number): Promise<boolean> {
        return ((await this.chapters.delete({ chatId, number })).affected ?? 0) > 0;
    }
}
