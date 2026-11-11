import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { BondAxis } from '../../ledger/bond-axes.js';
import type { CharacterEntity } from './character.entity.js';
import type { SceneEntity } from './scene.entity.js';

/** A Bond gate as its Scene answers it (.scratch/bond-axes/spec.md, "API"). */
export interface SceneBondGateResponse {
    fromCharacterId: number;
    /** null means toward the user. */
    toCharacterId: number | null;
    axis: BondAxis;
    /** The least level, within the axis's range; the editor shows only its word. */
    atLeast: number;
}

/**
 * A condition on a Scene that one Bond has reached at least a level on one Bond axis (CONTEXT.md:
 * "Bond gate"). One per Bond and axis on a Scene (a database constraint). It goes with its Scene
 * and with either Character (ON DELETE CASCADE).
 */
@Entity('scene_bond_gate')
export class SceneBondGateEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'scene_id', type: 'integer' })
    sceneId: number;

    @ManyToOne('SceneEntity', 'gates', { onDelete: 'CASCADE', orphanedRowAction: 'disable' })
    @JoinColumn({ name: 'scene_id' })
    scene: Relation<SceneEntity>;

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

    @Column({ type: 'text' })
    axis: BondAxis;

    @Column({ name: 'at_least', type: 'smallint' })
    atLeast: number;

    toResponse(): SceneBondGateResponse {
        return { fromCharacterId: this.fromCharacterId, toCharacterId: this.toCharacterId, axis: this.axis, atLeast: this.atLeast };
    }
}
