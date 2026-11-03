import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { StoryEntity } from './story.entity.js';

export interface RoleResponse {
    id: number;
    name: string;
    description: string;
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

    toResponse(): RoleResponse {
        return { id: this.id, name: this.name, description: this.description };
    }
}
