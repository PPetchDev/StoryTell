import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import type { StoryEntity } from './story.entity.js';

export interface CharacterResponse {
    id: number;
    name: string;
    appearance: string;
    personality: string;
    voice: string;
    exampleLines: string[];
    background: string;
    secrets: string;
    arcDirections: string;
}

/** An AI-played figure in one Story's cast. Ordered by `position` within the Story. */
@Entity('character')
export class CharacterEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'story_id', type: 'integer' })
    storyId: number;

    @ManyToOne('StoryEntity', 'characters', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'story_id' })
    story: Relation<StoryEntity>;

    @Column({ type: 'integer' })
    position: number;

    @Column({ type: 'text', default: '' })
    name: string;

    @Column({ type: 'text', default: '' })
    appearance: string;

    @Column({ type: 'text', default: '' })
    personality: string;

    @Column({ type: 'text', default: '' })
    voice: string;

    @Column({ name: 'example_lines', type: 'jsonb', default: () => "'[]'" })
    exampleLines: string[];

    @Column({ type: 'text', default: '' })
    background: string;

    @Column({ type: 'text', default: '' })
    secrets: string;

    @Column({ name: 'arc_directions', type: 'text', default: '' })
    arcDirections: string;

    toResponse(): CharacterResponse {
        return {
            id: this.id,
            name: this.name,
            appearance: this.appearance,
            personality: this.personality,
            voice: this.voice,
            exampleLines: [...this.exampleLines],
            background: this.background,
            secrets: this.secrets,
            arcDirections: this.arcDirections,
        };
    }
}
