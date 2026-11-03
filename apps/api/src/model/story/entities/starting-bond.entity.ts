import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import type { CharacterEntity } from './character.entity.js';
import type { StoryEntity } from './story.entity.js';

export interface StartingBondResponse {
    id: number;
    fromCharacterId: number;
    /** `null` means toward the Role. */
    toCharacterId: number | null;
    label: string;
    description: string;
}

/**
 * How a Character feels toward the Role or another Character when a Chat starts. At most one
 * per direction (a database constraint backs the manager's check). A Character with none
 * starts as a stranger.
 */
@Entity('starting_bond')
export class StartingBondEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'story_id', type: 'integer' })
    storyId: number;

    @ManyToOne('StoryEntity', 'startingBonds', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'story_id' })
    story: Relation<StoryEntity>;

    @Column({ name: 'from_character_id', type: 'integer' })
    fromCharacterId: number;

    @ManyToOne('CharacterEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'from_character_id' })
    fromCharacter: Relation<CharacterEntity>;

    @Column({ name: 'to_character_id', type: 'integer', nullable: true })
    toCharacterId: number | null;

    @ManyToOne('CharacterEntity', { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'to_character_id' })
    toCharacter: Relation<CharacterEntity> | null;

    @Column({ type: 'text', default: '' })
    label: string;

    @Column({ type: 'text', default: '' })
    description: string;

    toResponse(): StartingBondResponse {
        return {
            id: this.id,
            fromCharacterId: this.fromCharacterId,
            toCharacterId: this.toCharacterId,
            label: this.label,
            description: this.description,
        };
    }
}
