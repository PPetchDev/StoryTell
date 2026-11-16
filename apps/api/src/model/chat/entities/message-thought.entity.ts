import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { MessageEntity } from './message.entity.js';

/**
 * What one Character thought just before an AI Message was written (.scratch/character-minds/spec.md,
 * "Thoughts"), kept with that Message: written again with it on Regenerate, gone with it on a
 * rollback, copied by a Branch. Shown only when the user taps "Thoughts".
 */
@Entity('message_thought')
export class MessageThoughtEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'message_id', type: 'integer' })
    messageId: number;

    @ManyToOne('MessageEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity>;

    /** The Character who thought it; their thoughts go with them if they are removed. */
    @Column({ name: 'character_id', type: 'integer' })
    characterId: number;

    /** Their order under the Message: who thought first. */
    @Column({ type: 'integer' })
    position: number;

    @Column({ type: 'text' })
    text: string;
}
