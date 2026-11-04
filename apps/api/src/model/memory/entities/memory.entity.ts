import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity } from '../../chat/entities/chat.entity.js';
import type { MessageEntity } from '../../chat/entities/message.entity.js';
import type { MemoryKnownByEntity } from './memory-known-by.entity.js';

/** Who wrote a Memory's current text (spec: "written by: AI or user"). */
export enum MemoryAuthor {
    Ai = 'ai',
    User = 'user',
}

export interface MemoryResponse {
    id: number;
    /** The fact, with `{user}` where it names the user; the client renders the worn identity's name. */
    text: string;
    /** The Characters who know it, in cast order. */
    knownBy: number[];
    writtenBy: MemoryAuthor;
    /** A locked Memory accepts no AI update, delete, merge or archive (Known-by additions still land). */
    locked: boolean;
    archived: boolean;
    /** The AI Message that caused it; null when the user wrote it from scratch. */
    messageId: number | null;
    createdAt: string;
}

/** A Memory's fields as a ledger record snapshots them, before and after a change. */
export interface MemorySnapshot {
    text: string;
    knownBy: number[];
    writtenBy: MemoryAuthor;
    locked: boolean;
    archived: boolean;
}

/**
 * A fact established during one Chat (spec: "Memory"), known only to the Characters tagged
 * on it. The AI adds, updates, merges and archives Memories through extraction (ticket 28);
 * the user adds, edits, deletes and restores them by hand, and any Memory the user wrote or
 * touched is locked from AI changes. An AI-added Memory cascades from its causing Message:
 * rollback deletes it explicitly first, so the count is right.
 */
@Entity('memory')
export class MemoryEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'chat_id', type: 'integer' })
    chatId: number;

    @ManyToOne('ChatEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chat_id' })
    chat: Relation<ChatEntity>;

    @Column({ type: 'text' })
    text: string;

    @Column({ name: 'written_by', type: 'enum', enum: MemoryAuthor, enumName: 'memory_author_enum' })
    writtenBy: MemoryAuthor;

    @Column({ type: 'boolean', default: false })
    locked: boolean;

    @Column({ type: 'boolean', default: false })
    archived: boolean;

    @Index()
    @Column({ name: 'message_id', type: 'integer', nullable: true })
    messageId: number | null;

    @ManyToOne('MessageEntity', { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity> | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    // Loaded with the Memory (MemoryModelService); a removed Character drops out through CASCADE.
    @OneToMany('MemoryKnownByEntity', 'memory')
    knownBy: Relation<MemoryKnownByEntity[]>;

    /** Known-by ids in the order given by `castOrder` (cast order), unknown ones last. */
    knownByIds(castOrder: number[] = []): number[] {
        const rank = new Map(castOrder.map((id, index) => [id, index]));
        return (this.knownBy ?? [])
            .map((entry) => entry.characterId)
            .sort((a, b) => (rank.get(a) ?? castOrder.length) - (rank.get(b) ?? castOrder.length) || a - b);
    }

    snapshot(): MemorySnapshot {
        return {
            text: this.text,
            knownBy: this.knownByIds(),
            writtenBy: this.writtenBy,
            locked: this.locked,
            archived: this.archived,
        };
    }

    toResponse(castOrder: number[] = []): MemoryResponse {
        return {
            id: this.id,
            text: this.text,
            knownBy: this.knownByIds(castOrder),
            writtenBy: this.writtenBy,
            locked: this.locked,
            archived: this.archived,
            messageId: this.messageId,
            createdAt: this.createdAt.toISOString(),
        };
    }
}
