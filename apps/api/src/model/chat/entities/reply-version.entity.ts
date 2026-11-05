import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { MessagePartResponse } from './message-part.entity.js';
import type { MessageEntity } from './message.entity.js';

/**
 * A Reply version that is not shown (CONTEXT.md: "Reply version"): a take of the Chat's newest
 * AI Message that Regenerate replaced, kept only to be chosen again. The shown version is the
 * Message row itself; these never reach a prompt or the ledger.
 */
@Entity('reply_version')
export class ReplyVersionEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'message_id', type: 'integer' })
    messageId: number;

    @ManyToOne('MessageEntity', 'versions', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity>;

    /** Its place in the order the versions were written; 1 is the first. */
    @Column({ type: 'integer' })
    ordinal: number;

    @Column({ type: 'text' })
    model: string;

    /** The parts as they were stored on the Message, in order. */
    @Column({ type: 'jsonb' })
    parts: MessagePartResponse[];

    @Column({ name: 'written_at', type: 'timestamptz' })
    writtenAt: Date;
}
