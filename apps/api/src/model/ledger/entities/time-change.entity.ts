import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity, TimeOfDay } from '../../chat/entities/chat.entity.js';
import type { MessageEntity } from '../../chat/entities/message.entity.js';

/**
 * The Chat's Time of day moving on (spec: "Story clock"), recorded against the AI Message
 * whose judgement moved it, so a rewind of that Message puts `fromTime` back on the Chat.
 */
@Entity('time_change')
export class TimeChangeEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'chat_id', type: 'integer' })
    chatId: number;

    @ManyToOne('ChatEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chat_id' })
    chat: Relation<ChatEntity>;

    /** null when the Chat had no time of day yet. */
    @Column({ name: 'from_time', type: 'text', nullable: true })
    fromTime: TimeOfDay | null;

    @Column({ name: 'to_time', type: 'text' })
    toTime: TimeOfDay;

    @Index()
    @Column({ name: 'message_id', type: 'integer' })
    messageId: number;

    @ManyToOne('MessageEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity>;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
