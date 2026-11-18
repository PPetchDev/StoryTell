import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity } from '../../chat/entities/chat.entity.js';
import type { MessageEntity } from '../../chat/entities/message.entity.js';

/**
 * A Chat's "Previously on…" Recap (.scratch/previously-on/spec.md): where its story stood at one
 * Message, written for the user coming back after a while away. At most one per Chat, replaced by
 * the next. It goes with its Message, and is known stale when that Message no longer says what its
 * fingerprint remembers (Regenerate, a Reply version, an edit). No prompt ever reads it.
 */
@Entity('chat_recap')
@Unique('UQ_chat_recap_chat', ['chatId'])
export class ChatRecapEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'chat_id', type: 'integer' })
    chatId: number;

    @ManyToOne('ChatEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chat_id' })
    chat: Relation<ChatEntity>;

    /** The Chat's newest Message when it was written: the Recap tells the story up to it. */
    @Column({ name: 'message_id', type: 'integer' })
    messageId: number;

    @ManyToOne('MessageEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity>;

    /** SHA-256 hex of that Message's kind and text then (`recapFingerprint`). */
    @Column({ type: 'text' })
    fingerprint: string;

    @Column({ type: 'text' })
    text: string;

    /** When the user put it away; NULL while it may still show by itself. */
    @Column({ name: 'dismissed_at', type: 'timestamptz', nullable: true })
    dismissedAt: Date | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
