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
import type { MemorySnapshot } from '../../memory/entities/memory.entity.js';

/** What one extraction operation did to a Memory. A merge is deletes plus an add under one event. */
export enum MemoryChangeKind {
    Add = 'add',
    Update = 'update',
    Delete = 'delete',
    Archive = 'archive',
    KnownBy = 'known_by',
}

/**
 * One AI-made change to a Memory (spec: "MemoryChange"), with the Memory's fields before and
 * after, the story event and the causing AI Message, so a rewind can undo it. `memoryId` is a
 * plain reference, not a foreign key: a deleted Memory's id must survive so rollback can put
 * it back under the same id, which keeps the earlier records about it valid.
 */
@Entity('memory_change')
export class MemoryChangeEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'chat_id', type: 'integer' })
    chatId: number;

    @ManyToOne('ChatEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chat_id' })
    chat: Relation<ChatEntity>;

    @Column({ name: 'memory_id', type: 'integer' })
    memoryId: number;

    @Column({ type: 'enum', enum: MemoryChangeKind, enumName: 'memory_change_kind_enum' })
    kind: MemoryChangeKind;

    /** null for an add. */
    @Column({ type: 'jsonb', nullable: true })
    before: MemorySnapshot | null;

    /** null for a delete. */
    @Column({ type: 'jsonb', nullable: true })
    after: MemorySnapshot | null;

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
}
