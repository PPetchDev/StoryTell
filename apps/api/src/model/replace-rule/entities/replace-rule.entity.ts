import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { StoryEntity } from '../../story/entities/story.entity.js';

/** A Replace rule as the API answers it (spec: "Replace rules: storage and API"). */
export interface ReplaceRuleResponse {
    id: number;
    find: string;
    replace: string;
    regex: boolean;
    ignoreCase: boolean;
    onAi: boolean;
    onMine: boolean;
}

/** `find` runs 1–500 characters and is never trimmed; `replace` 0–1,000. */
export const REPLACE_FIND_MAX = 500;
export const REPLACE_REPLACE_MAX = 1_000;
/** At most this many per scope: app-wide, or one Story. */
export const REPLACE_RULES_MAX = 50;

/**
 * A find-and-replace rule, for the whole app (`storyId` null) or one Story, applied to AI
 * Messages as shown (`onAi`) and/or to my Messages before sending (`onMine`); both off parks it.
 * Rules run app-wide ones first, then the Story's, each scope by `position`.
 */
@Entity('replace_rule')
export class ReplaceRuleEntity {
    @PrimaryGeneratedColumn()
    id: number;

    /** The Account it belongs to (.scratch/accounts/spec.md: "Ownership"). */
    @Column({ name: 'user_id', type: 'integer' })
    userId: number;

    @Index()
    @Column({ name: 'story_id', type: 'integer', nullable: true })
    storyId: number | null;

    @ManyToOne('StoryEntity', 'replaceRules', { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'story_id' })
    story: Relation<StoryEntity> | null;

    @Column({ type: 'text' })
    find: string;

    @Column({ type: 'text', default: '' })
    replace: string;

    @Column({ type: 'boolean', default: false })
    regex: boolean;

    @Column({ name: 'ignore_case', type: 'boolean', default: false })
    ignoreCase: boolean;

    @Column({ name: 'on_ai', type: 'boolean', default: true })
    onAi: boolean;

    @Column({ name: 'on_mine', type: 'boolean', default: false })
    onMine: boolean;

    @Column({ type: 'integer' })
    position: number;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    toResponse(): ReplaceRuleResponse {
        const { id, find, replace, regex, ignoreCase, onAi, onMine } = this;
        return { id, find, replace, regex, ignoreCase, onAi, onMine };
    }
}
