import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { CharacterEntity } from './character.entity.js';
import type { StoryEntity } from './story.entity.js';

export interface StartingBeliefResponse {
    id: number;
    /** The Character who believes it when a Chat starts. */
    characterId: number;
    /** What they believe, with `{user}` where it names the user. */
    text: string;
}

/**
 * What a Character believes when a Chat starts, which may be false (.scratch/memory-by-meaning/spec.md,
 * "Starting Beliefs"). Every new Chat and every Reset seeds one Belief from each, as Starting Bonds
 * seed Bonds. In the order the author listed them.
 */
@Entity('starting_belief')
export class StartingBeliefEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'story_id', type: 'integer' })
    storyId: number;

    @ManyToOne('StoryEntity', 'startingBeliefs', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'story_id' })
    story: Relation<StoryEntity>;

    @Column({ name: 'character_id', type: 'integer' })
    characterId: number;

    @ManyToOne('CharacterEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'character_id' })
    character: Relation<CharacterEntity>;

    @Column({ type: 'text' })
    text: string;

    toResponse(): StartingBeliefResponse {
        return { id: this.id, characterId: this.characterId, text: this.text };
    }
}
