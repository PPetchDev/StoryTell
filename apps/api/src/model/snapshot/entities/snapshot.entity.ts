import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import { decimalColumn } from '../../../store/db/decimal.js';
import type { ChatEntity } from '../../chat/entities/chat.entity.js';
import type { MessageEntity } from '../../chat/entities/message.entity.js';
import type { StoryEntity } from '../../story/entities/story.entity.js';
import type { SnapshotCharacterEntity, SnapshotCharacterResponse } from './snapshot-character.entity.js';

export interface SnapshotResponse {
    id: number;
    storyId: number;
    /** Null once the Chat is deleted. */
    chatId: number | null;
    /** Null once an edit or a reset took the Message away: "from an earlier version of this Chat". */
    messageId: number | null;
    /** Relative to the image folder; served by `GET /api/images/{path}`. */
    imagePath: string;
    prompt: string;
    hint: string;
    imageModel: string;
    costUsd: number;
    /** In frame order, at most 3. */
    characters: SnapshotCharacterResponse[];
    createdAt: string;
}

/**
 * An image of a Chat's moment, made on the user's request (spec: "Snapshot record"). It
 * belongs to its Story's Gallery: the Chat and Message links are optional and are cleared,
 * never cascaded, when either goes. Snapshots never reach the text model and never cause
 * ledger records.
 */
@Entity('snapshot')
export class SnapshotEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'story_id', type: 'integer' })
    storyId: number;

    @ManyToOne('StoryEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'story_id' })
    story: Relation<StoryEntity>;

    @Index()
    @Column({ name: 'chat_id', type: 'integer', nullable: true })
    chatId: number | null;

    @ManyToOne('ChatEntity', { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'chat_id' })
    chat: Relation<ChatEntity> | null;

    @Index()
    @Column({ name: 'message_id', type: 'integer', nullable: true })
    messageId: number | null;

    @ManyToOne('MessageEntity', { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity> | null;

    @Column({ name: 'image_path', type: 'text' })
    imagePath: string;

    @Column({ type: 'text' })
    prompt: string;

    @Column({ type: 'text', default: '' })
    hint: string;

    @Column({ name: 'image_model', type: 'text' })
    imageModel: string;

    @Column({ name: 'cost_usd', ...decimalColumn(12, 6) })
    costUsd: number;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @OneToMany('SnapshotCharacterEntity', 'snapshot')
    characters: Relation<SnapshotCharacterEntity[]>;

    /** Needs `characters` loaded (SnapshotModelService does). */
    toResponse(): SnapshotResponse {
        return {
            id: this.id,
            storyId: this.storyId,
            chatId: this.chatId,
            messageId: this.messageId,
            imagePath: this.imagePath,
            prompt: this.prompt,
            hint: this.hint,
            imageModel: this.imageModel,
            costUsd: this.costUsd,
            characters: [...(this.characters ?? [])]
                .sort((a, b) => a.position - b.position)
                .map((character) => character.toResponse()),
            createdAt: this.createdAt.toISOString(),
        };
    }
}
