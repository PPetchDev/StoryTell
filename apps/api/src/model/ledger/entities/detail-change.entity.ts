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
    /** What one Character is wearing. */
    Outfit = 'outfit',
    /**
     * What one Character is after now, in a short phrase from their side (.scratch/character-minds/spec.md);
     * an empty value means they have none any more.
     */
    Goal = 'goal',
    /** One of the Chat's established facts (.scratch/story-quality/spec.md), as `topic: fact`; an empty fact drops the topic. */
    Fact = 'fact',
    /** What a reply said against an established fact, as `topic: what was said`; read by the next turn only. */
    Slip = 'slip',
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
