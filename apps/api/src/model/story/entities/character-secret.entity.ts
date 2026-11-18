import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { BondAxis } from '../../ledger/bond-axes.js';
import type { CharacterEntity } from './character.entity.js';

/** One of a Character's Secrets as the Story editor answers it (.scratch/secret-reveals/spec.md). */
export interface CharacterSecretResponse {
    id: number;
    text: string;
    /** The feeling of the Character toward the user it needs; null for none (played like the Secrets text). */
    axis: BondAxis | null;
    /** The least level on that axis, within its range; null exactly when `axis` is. */
    atLeast: number | null;
}

/**
 * One Secret of a Character, in the author's order, with the Bond level the Character's feelings
 * toward the user must reach before they will tell it, or none (.scratch/secret-reveals/spec.md).
 * Goes with its Character; its reveals in Chats go with it.
 */
@Entity('character_secret')
export class CharacterSecretEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'character_id', type: 'integer' })
    characterId: number;

    @ManyToOne('CharacterEntity', 'secretList', { onDelete: 'CASCADE', orphanedRowAction: 'disable' })
    @JoinColumn({ name: 'character_id' })
    character: Relation<CharacterEntity>;

    @Column({ type: 'integer' })
    position: number;

    @Column({ type: 'text', default: '' })
    text: string;

    @Column({ type: 'text', nullable: true })
    axis: BondAxis | null;

    @Column({ name: 'at_least', type: 'smallint', nullable: true })
    atLeast: number | null;

    toResponse(): CharacterSecretResponse {
        return { id: this.id, text: this.text, axis: this.axis, atLeast: this.atLeast };
    }
}
