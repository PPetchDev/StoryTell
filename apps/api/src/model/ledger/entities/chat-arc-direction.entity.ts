import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity } from '../../chat/entities/chat.entity.js';
import type { CharacterEntity } from '../../story/entities/character.entity.js';

/**
 * A Character's Arc directions as they were when the Chat started or was last reset (spec:
 * "Live vs copied edits"). The author's later edits reach only new or reset Chats.
 */
@Entity('chat_arc_direction')
export class ChatArcDirectionEntity {
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
    text: string;
}
