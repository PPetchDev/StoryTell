import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { StoryEntity } from '../../story/entities/story.entity.js';

/** A Saved reply as the API answers it (spec: "Saved replies: storage and API"). */
export interface SavedReplyResponse {
    id: number;
    text: string;
}

/** A Saved reply's text runs 1–1,000 characters once trimmed. */
export const SAVED_REPLY_TEXT_MAX = 1_000;
/** At most this many per scope: app-wide, or one Story. */
export const SAVED_REPLIES_MAX = 50;

/**
 * A line the user keeps, for the whole app (`storyId` null) or one Story. The tray lists a
 * scope's lines by `position`, which is add order.
 */
@Entity('saved_reply')
export class SavedReplyEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'story_id', type: 'integer', nullable: true })
    storyId: number | null;

    @ManyToOne('StoryEntity', 'savedReplies', { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'story_id' })
    story: Relation<StoryEntity> | null;

    @Column({ type: 'text' })
    text: string;

    @Column({ type: 'integer' })
    position: number;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    toResponse(): SavedReplyResponse {
        return { id: this.id, text: this.text };
    }
}
