import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { CharacterEntity } from '../../story/entities/character.entity.js';
import type { MemoryEntity } from './memory.entity.js';

/**
 * One Character on a Memory's Known by (spec: "Known by: a set of Characters"). Its own
 * table rather than a column, so a removed Character drops out of every Known by through
 * CASCADE (spec: "Remove Character") and a Memory left with nobody stays.
 */
@Entity('memory_known_by')
export class MemoryKnownByEntity {
    @PrimaryColumn({ name: 'memory_id', type: 'integer' })
    memoryId: number;

    @ManyToOne('MemoryEntity', 'knownBy', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'memory_id' })
    memory: Relation<MemoryEntity>;

    @PrimaryColumn({ name: 'character_id', type: 'integer' })
    characterId: number;

    @ManyToOne('CharacterEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'character_id' })
    character: Relation<CharacterEntity>;
}
