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

import type { SceneEntity } from '../../story/entities/scene.entity.js';
import type { StoryEntity } from '../../story/entities/story.entity.js';
import type { MessageEntity } from './message.entity.js';

/** A Chat as the list shows it. */
export interface ChatSummary {
    id: number;
    storyId: number;
    title: string;
    createdAt: string;
    lastPlayedAt: string;
}

/**
 * One playthrough of a Story (spec: "Chat"). The worn identity is the Role until ticket 26
 * adds Personas; `currentSceneId` null means free play.
 */
@Entity('chat')
export class ChatEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'story_id', type: 'integer' })
    storyId: number;

    @ManyToOne('StoryEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'story_id' })
    story: Relation<StoryEntity>;

    @Column({ type: 'text' })
    title: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @Column({ name: 'last_played_at', type: 'timestamptz', default: () => 'now()' })
    lastPlayedAt: Date;

    @Column({ name: 'current_scene_id', type: 'integer', nullable: true })
    currentSceneId: number | null;

    @ManyToOne('SceneEntity', { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'current_scene_id' })
    currentScene: Relation<SceneEntity> | null;

    // Loaded only through ChatModelService.findWithMessages(); never auto-loaded.
    @OneToMany('MessageEntity', 'chat')
    messages: Relation<MessageEntity[]>;

    toSummary(): ChatSummary {
        return {
            id: this.id,
            storyId: this.storyId,
            title: this.title,
            createdAt: this.createdAt.toISOString(),
            lastPlayedAt: this.lastPlayedAt.toISOString(),
        };
    }
}
