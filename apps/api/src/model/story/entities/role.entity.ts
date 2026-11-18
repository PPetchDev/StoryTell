import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { StoryEntity } from './story.entity.js';

/** One of the Role's Stats (.scratch/judge-rolls/spec.md): a name and the number it adds to a Roll. */
export interface RoleStat {
    name: string;
    value: number;
}

export interface RoleResponse {
    id: number;
    name: string;
    description: string;
    /** Its Stats, in the author's order; empty without. */
    stats: RoleStat[];
}

/** The part the user plays. Exactly one per Story, created with it. */
@Entity('role')
export class RoleEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'story_id', type: 'integer' })
    storyId: number;

    @OneToOne('StoryEntity', 'role', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'story_id' })
    story: Relation<StoryEntity>;

    @Column({ type: 'text', default: '' })
    name: string;

    @Column({ type: 'text', default: '' })
    description: string;

    /** Its Stats (.scratch/judge-rolls/spec.md), at most 6, in the author's order. */
    @Column({ type: 'jsonb', default: () => "'[]'" })
    stats: RoleStat[];

    toResponse(): RoleResponse {
        return { id: this.id, name: this.name, description: this.description, stats: this.stats ?? [] };
    }
}
