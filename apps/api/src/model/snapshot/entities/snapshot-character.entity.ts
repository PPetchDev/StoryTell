import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { CharacterEntity } from '../../story/entities/character.entity.js';
import type { SnapshotEntity } from './snapshot.entity.js';

export interface SnapshotCharacterResponse {
    /** Null once the Character is removed from the Story; the stamped name stays. */
    characterId: number | null;
    name: string;
}

/**
 * One Character drawn in a Snapshot, in frame order (spec: "Characters drawn (reference plus
 * stamped name, at most 3)"). Removing the Character clears the link through SET NULL.
 */
@Entity('snapshot_character')
export class SnapshotCharacterEntity {
    @PrimaryColumn({ name: 'snapshot_id', type: 'integer' })
    snapshotId: number;

    @ManyToOne('SnapshotEntity', 'characters', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'snapshot_id' })
    snapshot: Relation<SnapshotEntity>;

    @PrimaryColumn({ type: 'integer' })
    position: number;

    @Column({ name: 'character_id', type: 'integer', nullable: true })
    characterId: number | null;

    @ManyToOne('CharacterEntity', { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'character_id' })
    character: Relation<CharacterEntity> | null;

    @Column({ name: 'character_name', type: 'text' })
    characterName: string;

    toResponse(): SnapshotCharacterResponse {
        return { characterId: this.characterId, name: this.characterName };
    }
}
