import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity } from '../../chat/entities/chat.entity.js';
import type { MessageEntity } from '../../chat/entities/message.entity.js';
import type { CharacterEntity } from '../../story/entities/character.entity.js';

export interface ArcStepResponse {
    id: number;
    characterId: number;
    step: string;
    event: string;
    messageId: number;
    createdAt: string;
}

/**
 * One lasting change to a Character's personality within a Chat (spec: "Arc"), always
 * caused by a story event in an AI Message. The core Character definition is never
 * rewritten; steps only accumulate, and a later step can turn an earlier one back.
 */
@Entity('arc_step')
export class ArcStepEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'chat_id', type: 'integer' })
    chatId: number;

    @ManyToOne('ChatEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chat_id' })
    chat: Relation<ChatEntity>;

    @Column({ name: 'character_id', type: 'integer' })
    characterId: number;

    @ManyToOne('CharacterEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'character_id' })
    character: Relation<CharacterEntity>;

    @Column({ type: 'text' })
    step: string;

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

    toResponse(): ArcStepResponse {
        return {
            id: this.id,
            characterId: this.characterId,
            step: this.step,
            event: this.event,
            messageId: this.messageId,
            createdAt: this.createdAt.toISOString(),
        };
    }
}
