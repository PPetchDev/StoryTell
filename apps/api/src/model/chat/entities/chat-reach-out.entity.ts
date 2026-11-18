import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity } from './chat.entity.js';

/** How long away a Chat waits before a Reach-out (.scratch/reach-outs/spec.md). */
export const REACH_OUT_HOURS = [6, 12, 24] as const;
export type ReachOutHours = (typeof REACH_OUT_HOURS)[number];

/**
 * A Chat's "Characters message first" (.scratch/reach-outs/spec.md): a row means on. The claim
 * columns keep one absence, named by the user's newest Message, to at most one Reach-out.
 */
@Entity('chat_reach_out')
export class ChatReachOutEntity {
    @PrimaryColumn({ name: 'chat_id', type: 'integer' })
    chatId: number;

    @OneToOne('ChatEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chat_id' })
    chat?: Relation<ChatEntity>;

    @Column({ name: 'after_hours', type: 'smallint' })
    afterHours: ReachOutHours;

    /** When the setting was last changed: the time away is never counted from before it. */
    @Column({ name: 'set_at', type: 'timestamptz', default: () => 'now()' })
    setAt: Date;

    /** The id of the user's Message whose absence was claimed; null until the first claim. */
    @Column({ name: 'claimed_for', type: 'integer', nullable: true })
    claimedFor: number | null;

    @Column({ name: 'claimed_at', type: 'timestamptz', nullable: true })
    claimedAt: Date | null;

    /** Calls made for the claimed absence: at most two. */
    @Column({ type: 'smallint', default: 0 })
    attempts: number;
}
