import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { StoryEntity } from './story.entity.js';

export interface LoreEntryResponse {
    id: number;
    name: string;
    keywords: string[];
    text: string;
    alwaysOn: boolean;
}

/**
 * A short note about the Story's world (spec: "Lore"). It is sent in a turn only when its name
 * or a keyword comes up in the latest exchange, or on every turn when `alwaysOn`. Ordered by
 * `position` (add order) within the Story, which only breaks ties.
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

    toResponse(): LoreEntryResponse {
        return {
            id: this.id,
            name: this.name,
            keywords: [...this.keywords],
            text: this.text,
            alwaysOn: this.alwaysOn,
        };
    }
}
