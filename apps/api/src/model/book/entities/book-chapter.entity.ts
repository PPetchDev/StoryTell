import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity } from '../../chat/entities/chat.entity.js';

/** Who wrote a Book chapter's text (.scratch/chat-novel/spec.md): the play model, or the user's own hand. */
export type BookChapterAuthor = 'ai' | 'user';

/**
 * One Book chapter (.scratch/chat-novel/spec.md): a Chapter of a Chat retold as novel prose. Matched to
 * its Chapter by number, not by its Scene advance, so taking the advance back keeps the text until the
 * user rewrites or removes it.
 */
@Entity('book_chapter')
@Index(['chatId', 'number'], { unique: true })
export class BookChapterEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'chat_id', type: 'integer' })
    chatId: number;

    @ManyToOne('ChatEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chat_id' })
    chat: Relation<ChatEntity>;

    /** The Chapter's number, from 1. */
    @Column({ type: 'integer' })
    number: number;

    @Column({ type: 'text', nullable: true })
    title: string | null;

    @Column({ type: 'text', nullable: true })
    text: string | null;

    @Column({ name: 'written_by', type: 'text', default: 'ai' })
    writtenBy: BookChapterAuthor;

    /** The hash of the Chapter it was written from; out of date when the Chapter's is different now. */
    @Column({ name: 'source_hash', type: 'text', nullable: true })
    sourceHash: string | null;

    /** The Chapter's Scene, stamped when written, so a chapter whose Chapter is gone still reads. */
    @Column({ name: 'scene_name', type: 'text', nullable: true })
    sceneName: string | null;

    /** Why the last write failed; null unless it did. Any old text stays. */
    @Column({ type: 'text', nullable: true })
    failed: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}
