import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { ChatReachOutEntity, ReachOutHours } from './entities/chat-reach-out.entity.js';

/** A Chat whose time away is up, and the Account its Story belongs to. */
export interface DueReachOut {
    chatId: number;
    storyId: number;
    userId: number;
}

/** How long a failed attempt waits before the second, and how many an absence may have. */
export const REACH_OUT_RETRY_MS = 60 * 60 * 1000;
export const REACH_OUT_ATTEMPTS = 2;

/**
 * Repository wrapper for "Characters message first" (.scratch/reach-outs/spec.md): each Chat's
 * setting, the Chats a scheduler tick looks at, and the claim that keeps one absence to one.
 */
@Injectable()
export class ReachOutModelService {
    constructor(
        @InjectRepository(ChatReachOutEntity) private readonly settings: Repository<ChatReachOutEntity>,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) {}

    /** Whether the Chat belongs to that Story; the Story's own check names the Account. */
    async chatInStory(chatId: number, storyId: number): Promise<boolean> {
        const rows: unknown[] = await this.dataSource.query('SELECT 1 FROM "chat" WHERE "id" = $1 AND "story_id" = $2', [chatId, storyId]);
        return rows.length > 0;
    }

    find(chatId: number): Promise<ChatReachOutEntity | null> {
        return this.settings.findOneBy({ chatId });
    }

    /** Turns it on with the hours given, or off for null. Any change restarts the wait and the claim. */
    async set(chatId: number, afterHours: ReachOutHours | null): Promise<void> {
        if (afterHours === null) {
            await this.settings.delete({ chatId });
            return;
        }
        await this.dataSource.query(
            `INSERT INTO "chat_reach_out" ("chat_id", "after_hours", "set_at") VALUES ($1, $2, now())
             ON CONFLICT ("chat_id") DO UPDATE SET "after_hours" = EXCLUDED."after_hours", "set_at" = now()`,
            [chatId, afterHours],
        );
    }

    /**
     * The Chats a tick tries at `now`, oldest play first: the setting on, the Account active, the user
     * has written in it, no Reach-out after their newest Message, the time away up, and the absence
     * not claimed, or claimed by one failed attempt over an hour ago. Every other rule is checked by
     * the Chat manager, under the turn lock.
     */
    async due(now: Date, limit: number): Promise<DueReachOut[]> {
        const rows: Array<{ chat_id: number; story_id: number; user_id: number }> = await this.dataSource.query(
            `SELECT r."chat_id", c."story_id", s."user_id"
             FROM "chat_reach_out" r
             JOIN "chat" c ON c."id" = r."chat_id"
             JOIN "story" s ON s."id" = c."story_id"
             JOIN "app_user" u ON u."id" = s."user_id"
             CROSS JOIN LATERAL (
                 SELECT max(m."created_at") AS "newest_at",
                        (SELECT um."id" FROM "message" um WHERE um."chat_id" = c."id" AND um."kind" = 'user' ORDER BY um."position" DESC LIMIT 1) AS "user_message_id",
                        (SELECT max(um."position") FROM "message" um WHERE um."chat_id" = c."id" AND um."kind" = 'user') AS "user_position"
                 FROM "message" m WHERE m."chat_id" = c."id"
             ) newest
             WHERE NOT u."disabled" AND NOT u."removed"
               AND newest."user_message_id" IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1 FROM "message" ro WHERE ro."chat_id" = c."id" AND ro."reach_out" AND ro."position" > newest."user_position"
               )
               AND GREATEST(c."last_played_at", r."set_at", newest."newest_at") <= $1::timestamptz - make_interval(hours => r."after_hours")
               AND (
                   r."claimed_for" IS DISTINCT FROM newest."user_message_id"
                   OR (r."attempts" < $3 AND r."claimed_at" <= $1::timestamptz - make_interval(secs => $4))
               )
             ORDER BY c."last_played_at", c."id"
             LIMIT $2`,
            [now.toISOString(), limit, REACH_OUT_ATTEMPTS, REACH_OUT_RETRY_MS / 1000],
        );
        return rows.map((row) => ({ chatId: row.chat_id, storyId: row.story_id, userId: row.user_id }));
    }

    /**
     * Claims the absence named by the user's Message `forMessageId` for one attempt at `now`, in one
     * statement: true when it was never claimed, or its one earlier attempt failed over an hour ago.
     * Two ticks or two processes can never both win it.
     */
    async claim(chatId: number, forMessageId: number, now: Date): Promise<boolean> {
        const rows: Array<{ chat_id: number }> = await this.dataSource.query(
            `WITH claimed AS (
                 UPDATE "chat_reach_out" SET
                     "attempts" = CASE WHEN "claimed_for" = $2 THEN "attempts" + 1 ELSE 1 END,
                     "claimed_for" = $2,
                     "claimed_at" = $3::timestamptz
                 WHERE "chat_id" = $1
                   AND ("claimed_for" IS DISTINCT FROM $2 OR ("attempts" < $4 AND "claimed_at" <= $3::timestamptz - make_interval(secs => $5)))
                 RETURNING "chat_id"
             )
             SELECT "chat_id" FROM claimed`,
            [chatId, forMessageId, now.toISOString(), REACH_OUT_ATTEMPTS, REACH_OUT_RETRY_MS / 1000],
        );
        return rows.length > 0;
    }
}
