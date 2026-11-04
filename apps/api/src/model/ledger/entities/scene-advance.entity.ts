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

export interface SceneAdvanceResponse {
    id: number;
    fromSceneName: string;
    /** null means the Chat moved on into free play. */
    toSceneName: string | null;
    event: string;
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

    toResponse(): SceneAdvanceResponse {
        return {
            id: this.id,
            fromSceneName: this.fromSceneName,
            toSceneName: this.toSceneName,
            event: this.event,
            messageId: this.messageId,
            createdAt: this.createdAt.toISOString(),
        };
    }
}
