import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity } from '../../chat/entities/chat.entity.js';
import type { MessageEntity } from '../../chat/entities/message.entity.js';
import type { CharacterEntity } from '../../story/entities/character.entity.js';

/**
 * One Meanwhile (.scratch/meanwhile/spec.md): what a Character away from the moment did on their
 * own, recorded against the AI Message it came after. It is what the "Meanwhile" button and the
 * profile's "Lately" show; the story knows it through the Memory written with it. Like a ledger
 * record it goes when that Message is rewound, and with its Character.
 */
@Entity('meanwhile')
export class MeanwhileEntity {
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

    @Index()
    @Column({ name: 'message_id', type: 'integer' })
    messageId: number;

    @ManyToOne('MessageEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity>;

    /** The words as written, kept even when the user later edits the Memory. */
    @Column({ type: 'text' })
    text: string;

    /** The Memory written with it; NULL once that Memory is deleted. */
    @Column({ name: 'memory_id', type: 'integer', nullable: true })
    memoryId: number | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
