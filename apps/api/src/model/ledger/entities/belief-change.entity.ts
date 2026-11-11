import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity } from '../../chat/entities/chat.entity.js';
import type { MessageEntity } from '../../chat/entities/message.entity.js';
import type { BeliefSnapshot } from '../../memory/entities/belief.entity.js';

/** What one change did to a Belief (.scratch/memory-by-meaning/spec.md, "The ledger"). */
export enum BeliefChangeKind {
    Add = 'add',
    Update = 'update',
    GiveUp = 'give_up',
    Delete = 'delete',
}

/**
 * One AI-made change to a Belief, like a MemoryChange: the Belief's fields before and after, the
 * story event and the causing AI Message, so rolling back past that Message undoes it.
 * `beliefId` is a plain reference, so a deleted Belief can come back under the same id.
 */
@Entity('belief_change')
export class BeliefChangeEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'chat_id', type: 'integer' })
    chatId: number;

    @ManyToOne('ChatEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chat_id' })
    chat: Relation<ChatEntity>;

    @Column({ name: 'belief_id', type: 'integer' })
    beliefId: number;

    @Column({ type: 'text' })
    kind: BeliefChangeKind;

    /** null for an add. */
    @Column({ type: 'jsonb', nullable: true })
    before: BeliefSnapshot | null;

    /** null for a delete. */
    @Column({ type: 'jsonb', nullable: true })
    after: BeliefSnapshot | null;

    @Column({ type: 'text' })
    event: string;

    @Index()
    @Column({ name: 'message_id', type: 'integer' })
    messageId: number;

    @ManyToOne('MessageEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity>;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
