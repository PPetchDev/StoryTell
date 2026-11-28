import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity } from '../../chat/entities/chat.entity.js';
import type { MessageEntity } from '../../chat/entities/message.entity.js';
import type { StoryEntity } from './story.entity.js';

/** Which way the user must move a Sudden event's Gauge (.scratch/sudden-events/spec.md). */
export enum GaugeDirection {
    /** Bring it down: it starts high, the goal is low, and the top is failure at once. */
    Lower = 'lower',
    /** Bring it up: it starts low, the goal is high, and the bottom is failure at once. */
    Raise = 'raise',
}

/** What became of a Sudden event the story made up (.scratch/ai-events/spec.md). */
export enum EventProposal {
    /** The Judge proposed it; the user has not answered. It shows while its Message is the newest AI Message. */
    Offered = 'offered',
    /** The user started it: it has a start step against its Message. */
    Accepted = 'accepted',
    /** The user said not now. */
    Declined = 'declined',
}

/** The fewest and the most replies a Sudden event can give the user, and what a new one gives. */
export const SUDDEN_EVENT_TURNS = { min: 2, max: 8, default: 4 } as const;

/** The most Sudden events one Story holds: each waiting one is a line in every judge call. */
export const MAX_SUDDEN_EVENTS = 12;

export interface SuddenEventResponse {
    id: number;
    name: string;
    /** When it starts, in plain language ("a Character questions the user about the theft"). */
    trigger: string;
    /** What the Gauge measures ("Suspicion"). */
    gauge: string;
    direction: GaugeDirection;
    /** How many replies the user has. */
    turns: number;
    /** What follows a success, for the Narrator; may be empty. */
    success: string;
    /** What follows a failure, for the Narrator; may be empty. */
    failure: string;
}

/**
 * A Sudden event the author wrote for a Story (.scratch/sudden-events/spec.md): a moment of
 * pressure the Judge starts when its trigger happens, with a Gauge the user has a few replies to
 * move. In the author's order, by `position`.
 */
@Entity('sudden_event')
export class SuddenEventEntity {
    @PrimaryGeneratedColumn()
    id: number;

    /** The author's Story; null for an event the story made up in one Chat (.scratch/ai-events/spec.md). */
    @Index()
    @Column({ name: 'story_id', type: 'integer', nullable: true })
    storyId: number | null;

    @ManyToOne('StoryEntity', 'suddenEvents', { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'story_id' })
    story: Relation<StoryEntity> | null;

    /**
     * The Chat an event the story made up belongs to (.scratch/ai-events/spec.md); null for the
     * author's. The Story's `suddenEvents` never loads one, so the Story's list never shows it.
     */
    @Index()
    @Column({ name: 'chat_id', type: 'integer', nullable: true })
    chatId: number | null;

    @ManyToOne('ChatEntity', { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'chat_id' })
    chat: Relation<ChatEntity> | null;

    /** The AI Message whose judgement proposed it: a rewind of that Message takes it away. Null for the author's. */
    @Index()
    @Column({ name: 'message_id', type: 'integer', nullable: true })
    messageId: number | null;

    @ManyToOne('MessageEntity', { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity> | null;

    /** What became of a made-up event's proposal; null for the author's. */
    @Column({ type: 'text', nullable: true })
    proposal: EventProposal | null;

    /** Why the Judge proposed it now, in a sentence the user reads; empty for the author's. */
    @Column({ type: 'text', default: '' })
    reason: string;

    @Column({ type: 'integer' })
    position: number;

    @Column({ type: 'text', default: '' })
    name: string;

    @Column({ type: 'text', default: '' })
    trigger: string;

    @Column({ type: 'text', default: '' })
    gauge: string;

    @Column({ type: 'enum', enum: GaugeDirection, enumName: 'sudden_event_direction_enum', default: GaugeDirection.Lower })
    direction: GaugeDirection;

    @Column({ type: 'integer', default: SUDDEN_EVENT_TURNS.default })
    turns: number;

    @Column({ type: 'text', default: '' })
    success: string;

    @Column({ type: 'text', default: '' })
    failure: string;

    /** Whether it can run: the Judge needs a trigger to watch for, and the Gauge a name. */
    ready(): boolean {
        return this.trigger.trim() !== '' && this.gauge.trim() !== '';
    }

    toResponse(): SuddenEventResponse {
        return {
            id: this.id,
            name: this.name,
            trigger: this.trigger,
            gauge: this.gauge,
            direction: this.direction,
            turns: this.turns,
            success: this.success,
            failure: this.failure,
        };
    }
}
