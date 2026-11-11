import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity } from '../../chat/entities/chat.entity.js';
import type { MessageEntity } from '../../chat/entities/message.entity.js';
import type { CharacterEntity } from '../../story/entities/character.entity.js';
import type { MemoryEntity } from './memory.entity.js';

/** Who wrote a Belief's current text: the extraction (or a Starting Belief), or the user. */
export enum BeliefAuthor {
    Ai = 'ai',
    User = 'user',
}

/** A Belief's fields as a ledger record snapshots them, before and after a change. */
export interface BeliefSnapshot {
    characterId: number;
    text: string;
    contradictsMemoryId: number | null;
    writtenBy: BeliefAuthor;
    givenUpMessageId: number | null;
}

export interface BeliefResponse {
    id: number;
    /** The Character who holds it. */
    characterId: number;
    /** What they believe, with `{user}` where it names the user. */
    text: string;
    /** The Memory it contradicts, the truth; null when it contradicts none. */
    contradictsMemoryId: number | null;
    writtenBy: BeliefAuthor;
    /** The AI Message whose extraction made it; null when the user wrote it or it was seeded. */
    messageId: number | null;
    /** Null while it is held; once given up, the Message that showed the truth, with its line. */
    givenUp: { messageId: number; line: string } | null;
    createdAt: string;
}

/**
 * Something one Character holds to be true within one Chat, which may be false
 * (.scratch/memory-by-meaning/spec.md, "Beliefs"). Active until it has a `givenUpMessageId`. The
 * extraction makes and gives them up through the ledger; the user adds, edits and deletes them.
 * An AI-made Belief goes with its causing Message, as an AI-made Memory does.
 */
@Entity('belief')
export class BeliefEntity {
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

    @Column({ name: 'contradicts_memory_id', type: 'integer', nullable: true })
    contradictsMemoryId: number | null;

    @ManyToOne('MemoryEntity', { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'contradicts_memory_id' })
    contradictsMemory: Relation<MemoryEntity> | null;

    @Column({ name: 'written_by', type: 'text' })
    writtenBy: BeliefAuthor;

    @Column({ name: 'message_id', type: 'integer', nullable: true })
    messageId: number | null;

    @ManyToOne('MessageEntity', { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity> | null;

    @Column({ name: 'given_up_message_id', type: 'integer', nullable: true })
    givenUpMessageId: number | null;

    @ManyToOne('MessageEntity', { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'given_up_message_id' })
    givenUpMessage: Relation<MessageEntity> | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    /** Held until the story shows the truth. */
    get active(): boolean {
        return this.givenUpMessageId === null;
    }

    snapshot(): BeliefSnapshot {
        return {
            characterId: this.characterId,
            text: this.text,
            contradictsMemoryId: this.contradictsMemoryId,
            writtenBy: this.writtenBy,
            givenUpMessageId: this.givenUpMessageId,
        };
    }

    /** `givenUpLine` is the line of the Message that showed the truth, which the caller reads. */
    toResponse(givenUpLine = ''): BeliefResponse {
        return {
            id: this.id,
            characterId: this.characterId,
            text: this.text,
            contradictsMemoryId: this.contradictsMemoryId,
            writtenBy: this.writtenBy,
            messageId: this.messageId,
            givenUp: this.givenUpMessageId === null ? null : { messageId: this.givenUpMessageId, line: givenUpLine },
            createdAt: this.createdAt.toISOString(),
        };
    }
}
