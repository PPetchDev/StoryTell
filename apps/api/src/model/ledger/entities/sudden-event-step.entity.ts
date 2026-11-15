import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity } from '../../chat/entities/chat.entity.js';
import type { MessageEntity } from '../../chat/entities/message.entity.js';
import type { SuddenEventEntity } from '../../story/entities/sudden-event.entity.js';

/** What one judged reply did to a Sudden event (.scratch/sudden-events/spec.md, "The ledger"). */
export enum SuddenEventStepKind {
    /** Its trigger happened: the event is under way from this reply on. */
    Start = 'start',
    /** A reply inside it: the Gauge moved (or stayed) and one reply was used. */
    Move = 'move',
    /** It ended with the goal reached. */
    Success = 'success',
    /** It ended at the Gauge's far end, or with no replies left. */
    Failure = 'failure',
}

/**
 * One step of a Sudden event in a Chat, recorded against the AI Message whose judgement made it,
 * so a rewind of that Message takes the step back. A Chat's event state is read from its steps:
 * the newest one says whether an event is under way and where its Gauge stands. A step goes with
 * its Sudden event when the author removes it.
 */
@Entity('sudden_event_step')
export class SuddenEventStepEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'chat_id', type: 'integer' })
    chatId: number;

    @ManyToOne('ChatEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chat_id' })
    chat: Relation<ChatEntity>;

    @Index()
    @Column({ name: 'sudden_event_id', type: 'integer' })
    suddenEventId: number;

    @ManyToOne('SuddenEventEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'sudden_event_id' })
    suddenEvent: Relation<SuddenEventEntity>;

    @Column({ type: 'text' })
    kind: SuddenEventStepKind;

    /** The Gauge after this step, 0 to 100. */
    @Column({ type: 'integer' })
    gauge: number;

    /** The replies the user still has after this step. */
    @Column({ name: 'turns_left', type: 'integer' })
    turnsLeft: number;

    /** Why, in a sentence the user reads. */
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
