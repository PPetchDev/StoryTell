import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity } from '../../chat/entities/chat.entity.js';
import type { MessageEntity } from '../../chat/entities/message.entity.js';
import type { EndingEntity } from '../../story/entities/ending.entity.js';

/**
 * A Chat reaching an Ending (.scratch/endings/spec.md), recorded against the AI Message whose
 * judgement saw it: one of its Story's, whose condition happened, or one the Judge suggested, which
 * has no Ending behind it and carries its own name. A Chat reaches at most one: while it has a
 * record the Judge is not asked again. A rewind of the Message takes the record away, and with it
 * the Ending; the author's goes with the Ending when the author removes that.
 */
@Entity('ending_reached')
export class EndingReachedEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'chat_id', type: 'integer' })
    chatId: number;

    @ManyToOne('ChatEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chat_id' })
    chat: Relation<ChatEntity>;

    /** The author's Ending; NULL for one the Judge suggested. */
    @Index()
    @Column({ name: 'ending_id', type: 'integer', nullable: true })
    endingId: number | null;

    @ManyToOne('EndingEntity', { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'ending_id' })
    ending: Relation<EndingEntity> | null;

    /** A suggested Ending's name; NULL for the author's, which has its own. */
    @Column({ type: 'text', nullable: true })
    name: string | null;

    /** What brought the story there, in a sentence the user reads. */
    @Column({ type: 'text', default: '' })
    reason: string;

    @Index()
    @Column({ name: 'message_id', type: 'integer' })
    messageId: number;

    @ManyToOne('MessageEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity>;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
