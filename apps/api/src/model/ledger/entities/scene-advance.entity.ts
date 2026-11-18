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
import type { SceneEntity } from '../../story/entities/scene.entity.js';

/** Who moved the Scene on (.scratch/scene-chapters/spec.md): the Judge, or the user's Move on. */
export type SceneMover = 'judge' | 'user';

/** Who wrote a Chapter's summary. */
export type ChapterAuthor = 'ai' | 'user';

export interface SceneAdvanceResponse {
    id: number;
    fromSceneName: string;
    /** null means the Chat moved on into free play. */
    toSceneName: string | null;
    event: string;
    /** The Judge, or the user's Move on. */
    movedBy: SceneMover;
    messageId: number;
    createdAt: string;
}

/**
 * The Chat moving on from one Scene to the next, or into free play after the last (spec:
 * "SceneAdvance"). Scene names are stamped, so the record still reads when a Scene is removed.
 */
@Entity('scene_advance')
export class SceneAdvanceEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'chat_id', type: 'integer' })
    chatId: number;

    @ManyToOne('ChatEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chat_id' })
    chat: Relation<ChatEntity>;

    @Column({ name: 'from_scene_id', type: 'integer', nullable: true })
    fromSceneId: number | null;

    @ManyToOne('SceneEntity', { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'from_scene_id' })
    fromScene: Relation<SceneEntity> | null;

    @Column({ name: 'from_scene_name', type: 'text' })
    fromSceneName: string;

    @Column({ name: 'to_scene_id', type: 'integer', nullable: true })
    toSceneId: number | null;

    @ManyToOne('SceneEntity', { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'to_scene_id' })
    toScene: Relation<SceneEntity> | null;

    @Column({ name: 'to_scene_name', type: 'text', nullable: true })
    toSceneName: string | null;

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

    /** The Judge (every advance before Move on), or the user (.scratch/scene-chapters/spec.md). */
    @Column({ name: 'moved_by', type: 'text', default: 'judge' })
    movedBy: SceneMover;

    /**
     * The summary of the Chapter this advance ended (.scratch/scene-chapters/spec.md); null until it is
     * written. It lives on the advance, so a rollback, a Branch and Reset take it with the advance.
     */
    @Column({ name: 'chapter_summary', type: 'text', nullable: true })
    chapterSummary: string | null;

    @Column({ name: 'chapter_by', type: 'text', default: 'ai' })
    chapterBy: ChapterAuthor;

    /** Why the last try at the summary failed; null unless it did. Only the user's Try again writes it again. */
    @Column({ name: 'chapter_failed', type: 'text', nullable: true })
    chapterFailed: string | null;

    @Column({ name: 'chapter_updated_at', type: 'timestamptz', nullable: true })
    chapterUpdatedAt: Date | null;

    toResponse(): SceneAdvanceResponse {
        return {
            id: this.id,
            fromSceneName: this.fromSceneName,
            toSceneName: this.toSceneName,
            event: this.event,
            movedBy: this.movedBy,
            messageId: this.messageId,
            createdAt: this.createdAt.toISOString(),
        };
    }
}
