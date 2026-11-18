import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { Relation } from 'typeorm';

import type { MessageEntity } from './message.entity.js';

/**
 * A Bookmark (.scratch/chat-search/spec.md): the user's mark on one Message, to come back to it.
 * One per Message, gone with it, so an edit, a Reset or deleting the Chat drops the right ones by
 * the cascade alone. Branch copies those of the Messages it keeps.
 */
@Entity('message_bookmark')
@Unique('UQ_message_bookmark_message', ['messageId'])
export class MessageBookmarkEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'message_id', type: 'integer' })
    messageId: number;

    @ManyToOne('MessageEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity>;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
