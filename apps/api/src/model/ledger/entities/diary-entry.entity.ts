import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity } from '../../chat/entities/chat.entity.js';
import type { MessageEntity } from '../../chat/entities/message.entity.js';
import type { CharacterEntity } from '../../story/entities/character.entity.js';

/** A Diary entry as the API answers it (.scratch/diary/spec.md). */
export interface DiaryEntryResponse {
    id: number;
    characterId: number;
    /** The AI Message the story stood at when it was written. */
    messageId: number;
    /** When and where in the story it was written ("Night, the lamp room"); null when the Chat knew neither. */
    moment: string | null;
    text: string;
    createdAt: string;
}

/**
 * One entry of a Character's Diary in one Chat (.scratch/diary/spec.md): what they wrote, in their
 * own voice, about the story up to the AI Message it is recorded against. Like a ledger record it
 * goes when that Message is rewound, and with its Character. No prompt ever reads it.
 */
@Entity('diary_entry')
export class DiaryEntryEntity {
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

    /** The Chat's newest AI Message when the entry was written: the entry covers the story up to it. */
    @Index()
    @Column({ name: 'message_id', type: 'integer' })
    messageId: number;

    @ManyToOne('MessageEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity>;

    /** The Time of day and the Place as they stood then, in words; NULL when the Chat knew neither. */
    @Column({ type: 'text', nullable: true })
    moment: string | null;

    @Column({ type: 'text' })
    text: string;

    /**
     * How the diarist feels and what they mean to do, in a sentence or two, written with the entry
     * (.scratch/diary/spec.md): the only part the Narrator reads, and never shown. NULL when none was written.
     */
    @Column({ name: 'inner_life', type: 'text', nullable: true })
    innerLife: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    toResponse(): DiaryEntryResponse {
        return {
            id: this.id,
            characterId: this.characterId,
            messageId: this.messageId,
            moment: this.moment,
            text: this.text,
            createdAt: this.createdAt.toISOString(),
        };
    }
}
