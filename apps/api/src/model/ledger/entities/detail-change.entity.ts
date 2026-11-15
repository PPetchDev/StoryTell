import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity } from '../../chat/entities/chat.entity.js';
import type { MessageEntity } from '../../chat/entities/message.entity.js';
import type { CharacterEntity } from '../../story/entities/character.entity.js';

/** What a Detail change is about (.scratch/info-box/spec.md). */
export enum DetailKind {
    /** Where the story is. */
    Place = 'place',
    Weather = 'weather',
    /** What one Character is wearing; the only kind with a Character. */
    Outfit = 'outfit',
}

/**
 * A Chat's Place, Weather or one Character's Outfit as an AI Message's judgement set it, recorded
 * against that Message. The Chat's current value of each is its newest record, so a rewind of the
 * Message puts the one before back just by taking this one away. An Outfit goes with its Character.
 */
@Entity('detail_change')
export class DetailChangeEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'chat_id', type: 'integer' })
    chatId: number;

    @ManyToOne('ChatEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chat_id' })
    chat: Relation<ChatEntity>;

    @Column({ type: 'text' })
    kind: DetailKind;

    /** The Character an Outfit is of; NULL for the Place and the Weather. */
    @Column({ name: 'character_id', type: 'integer', nullable: true })
    characterId: number | null;

    @ManyToOne('CharacterEntity', { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'character_id' })
    character: Relation<CharacterEntity> | null;

    @Column({ type: 'text' })
    value: string;

    @Index()
    @Column({ name: 'message_id', type: 'integer' })
    messageId: number;

    @ManyToOne('MessageEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity>;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
