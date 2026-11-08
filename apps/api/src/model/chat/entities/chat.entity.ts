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

import type { PersonaEntity } from '../../persona/entities/persona.entity.js';
import type { SceneEntity } from '../../story/entities/scene.entity.js';
import type { StoryEntity } from '../../story/entities/story.entity.js';
import type { MessageEntity } from './message.entity.js';

/** Spec: "Story clock". Where a Chat's story is in the day, in order through it. */
export const TIMES_OF_DAY = ['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

/** Who wrote a Chat's current Story so far. */
export type StorySoFarAuthor = 'ai' | 'user';

/** A Chat as the list shows it. */
export interface ChatSummary {
    id: number;
    storyId: number;
    title: string;
    createdAt: string;
    lastPlayedAt: string;
}

/**
 * One playthrough of a Story (spec: "Chat"). The worn identity is the Story's Role while
 * `personaId` is null, else that Persona; `currentSceneId` null means free play.
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

    /**
     * Spec: "Story clock". The current Time of day; null until the story makes one clear. Set
     * and rolled back with the ledger's TimeChanges, like `currentSceneId` with SceneAdvances.
     */
    @Column({ name: 'time_of_day', type: 'text', nullable: true })
    timeOfDay: TimeOfDay | null;

    // Swapping identity is Chat state outside the ledger: never rolled back, kept by reset.
    @Column({ name: 'persona_id', type: 'integer', nullable: true })
    personaId: number | null;

    // Loaded by ChatModelService.findWithMessages(), so the worn identity can be read off the Chat.
    @ManyToOne('PersonaEntity', { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'persona_id' })
    persona: Relation<PersonaEntity> | null;

    // Spec: "Story so far". Chat state outside the ledger: rewinds into it and Reset clear it.
    @Column({ name: 'story_so_far', type: 'text', nullable: true })
    storySoFar: string | null;

    /** The position of the last Message the Story so far covers; null while there is none. */
    @Column({ name: 'story_so_far_through', type: 'integer', nullable: true })
    storySoFarThrough: number | null;

    @Column({ name: 'story_so_far_by', type: 'text', default: 'ai' })
    storySoFarBy: StorySoFarAuthor;

    @Column({ name: 'story_so_far_updated_at', type: 'timestamptz', nullable: true })
    storySoFarUpdatedAt: Date | null;

    /** Why the last update failed; null once one succeeds. Never blocks a send. */
    @Column({ name: 'story_so_far_failed', type: 'text', nullable: true })
    storySoFarFailed: string | null;

    /** The user's last own text, sent with every rewrite as corrections that win. */
    @Column({ name: 'story_so_far_corrections', type: 'text', nullable: true })
    storySoFarCorrections: string | null;

    /** The Chat this one was branched from; null for a Chat never branched, or once that Chat is deleted. */
    @Index()
    @Column({ name: 'branched_from_chat_id', type: 'integer', nullable: true })
    branchedFromChatId: number | null;

    @ManyToOne('ChatEntity', { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'branched_from_chat_id' })
    branchedFromChat: Relation<ChatEntity> | null;

    /** The Message the user tapped there (a User Message itself when branched from one); null once it is gone. */
    @Index()
    @Column({ name: 'branched_from_message_id', type: 'integer', nullable: true })
    branchedFromMessageId: number | null;

    @ManyToOne('MessageEntity', { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'branched_from_message_id' })
    branchedFromMessage: Relation<MessageEntity> | null;

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
