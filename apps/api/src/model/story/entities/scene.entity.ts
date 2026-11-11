import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import type { SceneBondGateEntity, SceneBondGateResponse } from './scene-bond-gate.entity.js';
import type { StoryEntity } from './story.entity.js';

export interface SceneResponse {
    id: number;
    name: string;
    situation: string;
    moveOnCondition: string;
    /** Its Bond gates (.scratch/bond-axes/spec.md), in the order they were set. */
    gates: SceneBondGateResponse[];
}

/** A stage the plot moves through. Ordered by `position` within the Story. */
@Entity('scene')
export class SceneEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'story_id', type: 'integer' })
    storyId: number;

    @ManyToOne('StoryEntity', 'scenes', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'story_id' })
    story: Relation<StoryEntity>;

    @Column({ type: 'integer' })
    position: number;

    @Column({ type: 'text', default: '' })
    name: string;

    @Column({ type: 'text', default: '' })
    situation: string;

    @Column({ name: 'move_on_condition', type: 'text', default: '' })
    moveOnCondition: string;

    // Loaded only through StoryModelService.findFull(); never auto-loaded, and a save of the Scene never writes them.
    @OneToMany('SceneBondGateEntity', 'scene')
    gates: Relation<SceneBondGateEntity[]>;

    toResponse(): SceneResponse {
        return {
            id: this.id,
            name: this.name,
            situation: this.situation,
            moveOnCondition: this.moveOnCondition,
            gates: (this.gates ?? []).map((gate) => gate.toResponse()),
        };
    }
}
