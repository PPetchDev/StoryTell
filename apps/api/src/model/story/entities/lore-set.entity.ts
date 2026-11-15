import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { Relation } from 'typeorm';

import type { LoreEntryEntity, LoreEntryResponse } from './lore-entry.entity.js';
import type { StoryEntity } from './story.entity.js';

/** The most Lore sets one Story links (.scratch/shared-lore/spec.md): every linked entry is scanned on every turn. */
export const MAX_LORE_SETS_PER_STORY = 5;

/** What a Lore set is called where its name is blank. */
export function loreSetName(name: string): string {
    return name.trim() || 'Lore set';
}

/** A Lore set as a Story that links it reads it. */
export interface LoreSetResponse {
    id: number;
    name: string;
    /** In add order. */
    entries: LoreEntryResponse[];
    /** How many Stories link it, this one included: a change to it reaches them all. */
    usedBy: number;
}

/**
 * A Lore set (.scratch/shared-lore/spec.md): Lore entries kept apart from any one Story, owned by
 * an Account and linked to the Stories that share them. Its entries are `lore_entry` rows that
 * name the set where a Story's own name the Story.
 */
@Entity('lore_set')
export class LoreSetEntity {
    @PrimaryGeneratedColumn()
    id: number;

    /** The Account it belongs to (.scratch/accounts/spec.md: "Ownership"). */
    @Index()
    @Column({ name: 'user_id', type: 'integer' })
    userId: number;

    @Column({ type: 'text', default: '' })
    name: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    // Loaded only where asked for; never auto-loaded.
    @OneToMany('LoreEntryEntity', 'loreSet')
    entries: Relation<LoreEntryEntity[]>;

    @OneToMany('StoryLoreSetEntity', 'loreSet')
    links: Relation<StoryLoreSetEntity[]>;

    /** Needs its `entries` and `links` loaded. */
    toResponse(): LoreSetResponse {
        return {
            id: this.id,
            name: this.name,
            entries: [...(this.entries ?? [])].sort((a, b) => a.position - b.position || a.id - b.id).map((entry) => entry.toResponse()),
            usedBy: (this.links ?? []).length,
        };
    }
}

/** A Story linking a Lore set, in the order the author linked them. Goes with either. */
@Entity('story_lore_set')
@Unique('UQ_story_lore_set', ['storyId', 'loreSetId'])
export class StoryLoreSetEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'story_id', type: 'integer' })
    storyId: number;

    @ManyToOne('StoryEntity', 'loreSetLinks', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'story_id' })
    story: Relation<StoryEntity>;

    @Index()
    @Column({ name: 'lore_set_id', type: 'integer' })
    loreSetId: number;

    @ManyToOne('LoreSetEntity', 'links', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'lore_set_id' })
    loreSet: Relation<LoreSetEntity>;

    @Column({ type: 'integer' })
    position: number;
}
