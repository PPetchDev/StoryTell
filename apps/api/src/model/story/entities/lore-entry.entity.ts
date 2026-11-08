import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { StoryEntity } from './story.entity.js';

/** How an entry's second keywords filter it (.scratch/lore-triggers/spec.md: "Matching"). */
export type LoreSecondaryMode = 'alsoNeeds' | 'unless';
export const LORE_SECONDARY_MODES: readonly LoreSecondaryMode[] = ['alsoNeeds', 'unless'];

/** A Lore entry's trigger settings (.scratch/lore-triggers/spec.md: "The Lore entry"); each default keeps the plain behaviour. */
export interface LoreTriggers {
    secondaryKeywords: string[];
    secondaryMode: LoreSecondaryMode;
    /** Regular-expression sources, matched ignoring case, Unicode, multi-line. */
    patterns: string[];
    /** "Brought in by other entries": named in a chosen entry's text, it comes along. */
    recursable: boolean;
    /** "Stays for": Messages it stays in after it went in; 0 = off. */
    sticky: number;
    /** "Rests for": Messages it can't come in after its stay; 0 = off. */
    cooldown: number;
    /** "Waits until the Chat has": it can't come in before that many Messages; 0 = off. */
    delay: number;
    /** "Chance": the percentage of the times it would come in that it does; 100 = no roll. */
    chance: number;
    /** "Group": at most one entry of a group goes in per turn; compared ignoring case; blank = none. */
    group: string;
}

/** A Group name runs at most 60 characters (spec: "The Lore entry"). */
export const LORE_GROUP_MAX = 60;

/** Stays for, Rests for and Waits until run 0–50 Messages (spec: "The Lore entry"). */
export const LORE_TIMED_MAX = 50;

export interface LoreEntryResponse extends LoreTriggers {
    id: number;
    name: string;
    keywords: string[];
    text: string;
    alwaysOn: boolean;
}

/**
 * A short note about the Story's world (spec: "Lore"). It is sent in a turn only when its name
 * or a keyword comes up in the latest exchange, or on every turn when `alwaysOn`; its trigger
 * settings narrow that (.scratch/lore-triggers/spec.md). Ordered by `position` (add order)
 * within the Story, which only breaks ties.
 */
@Entity('lore_entry')
export class LoreEntryEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'story_id', type: 'integer' })
    storyId: number;

    @ManyToOne('StoryEntity', 'lore', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'story_id' })
    story: Relation<StoryEntity>;

    @Column({ type: 'integer' })
    position: number;

    @Column({ type: 'text', default: '' })
    name: string;

    @Column({ type: 'jsonb', default: () => "'[]'" })
    keywords: string[];

    @Column({ type: 'text', default: '' })
    text: string;

    @Column({ name: 'always_on', type: 'boolean', default: false })
    alwaysOn: boolean;

    /** Second keywords: they filter an entry that came up, never bring one up. */
    @Column({ name: 'secondary_keywords', type: 'jsonb', default: () => "'[]'" })
    secondaryKeywords: string[];

    @Column({ name: 'secondary_mode', type: 'text', default: 'alsoNeeds' })
    secondaryMode: LoreSecondaryMode;

    /** Patterns: regular expressions that bring the entry up like keywords do. */
    @Column({ type: 'jsonb', default: () => "'[]'" })
    patterns: string[];

    /** "Brought in by other entries" (spec: "Recursion"). */
    @Column({ type: 'boolean', default: true })
    recursable: boolean;

    /** Stays for, Rests for, Waits until (spec: "Timed effects"), in Messages. */
    @Column({ type: 'integer', default: 0 })
    sticky: number;

    @Column({ type: 'integer', default: 0 })
    cooldown: number;

    @Column({ type: 'integer', default: 0 })
    delay: number;

    /** Chance (spec: "Chance"), 0–100; 100 means no roll. */
    @Column({ type: 'integer', default: 100 })
    chance: number;

    /** Group (spec: "Groups"); blank = none. */
    @Column({ name: 'group_name', type: 'text', default: '' })
    group: string;

    toResponse(): LoreEntryResponse {
        return {
            id: this.id,
            name: this.name,
            keywords: [...this.keywords],
            text: this.text,
            alwaysOn: this.alwaysOn,
            secondaryKeywords: [...this.secondaryKeywords],
            secondaryMode: this.secondaryMode,
            patterns: [...this.patterns],
            recursable: this.recursable,
            sticky: this.sticky,
            cooldown: this.cooldown,
            delay: this.delay,
            chance: this.chance,
            group: this.group,
        };
    }
}
