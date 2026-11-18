import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { MessageBookmarkEntity } from './entities/message-bookmark.entity.js';

/** One bookmarked Message of a Chat and when it was marked. */
export interface BookmarkRow {
    messageId: number;
    createdAt: Date;
}

/** Repository wrapper for Bookmarks (.scratch/chat-search/spec.md). No rules here. */
@Injectable()
export class MessageBookmarkModelService {
    constructor(@InjectRepository(MessageBookmarkEntity) private readonly bookmarks: Repository<MessageBookmarkEntity>) {}

    /** A Chat's bookmarked Messages, in thread order. */
    async findByChat(chatId: number): Promise<BookmarkRow[]> {
        const rows: Array<{ message_id: number; created_at: Date }> = await this.bookmarks.query(
            `SELECT b."message_id", b."created_at" FROM "message_bookmark" b JOIN "message" m ON m."id" = b."message_id"
             WHERE m."chat_id" = $1 ORDER BY m."position", m."id"`,
            [chatId],
        );
        return rows.map((row) => ({ messageId: row.message_id, createdAt: row.created_at }));
    }

    /** Marks a Message; marking one already marked changes nothing. */
    async add(messageId: number): Promise<void> {
        await this.bookmarks.query(`INSERT INTO "message_bookmark" ("message_id") VALUES ($1) ON CONFLICT ("message_id") DO NOTHING`, [messageId]);
    }

    async remove(messageId: number): Promise<void> {
        await this.bookmarks.delete({ messageId });
    }
}
