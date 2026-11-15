import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { StoryEntity } from './story.entity.js';

/** The most Endings one Story holds: each one not yet reached is a line in every judge call. */
export const MAX_ENDINGS = 6;

export interface EndingResponse {
    id: number;
    name: string;
    /** When the story has reached it, in plain language ("the lamp is lit again and Mira asks the user to stay"). */
    condition: string;
    /** What its Epilogue should tell, for the Narrator; may be empty. */
    epilogue: string;
}

/**
 * An Ending the author wrote for a Story (.scratch/endings/spec.md): a way the story can end, which
 * the Judge marks reached in a Chat when its condition has happened there. In the author's order,
 * by `position`.
 */
@Entity('ending')
export class EndingEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'story_id', type: 'integer' })
    storyId: number;

    @ManyToOne('StoryEntity', 'endings', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'story_id' })
    story: Relation<StoryEntity>;

    @Column({ type: 'integer' })
    position: number;

    @Column({ type: 'text', default: '' })
    name: string;

    @Column({ type: 'text', default: '' })
    condition: string;

    @Column({ type: 'text', default: '' })
    epilogue: string;

    toResponse(): EndingResponse {
        return { id: this.id, name: this.name, condition: this.condition, epilogue: this.epilogue };
    }
}
