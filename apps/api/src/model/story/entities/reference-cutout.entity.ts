import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { CharacterEntity } from './character.entity.js';

/**
 * A Character's Reference image with its background taken away (.scratch/stage-pictures/spec.md):
 * the neutral picture on the Visual novel stage. In a table of its own so a Character autosave never
 * touches it. Current only while `cutFrom` is the Character's Reference image; the file is deleted by
 * the Expression module when replaced and by Story and Character deletion.
 */
@Entity('reference_cutout')
export class ReferenceCutoutEntity {
    @PrimaryColumn({ name: 'character_id', type: 'integer' })
    characterId: number;

    @OneToOne('CharacterEntity', 'referenceCutout', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'character_id' })
    character: Relation<CharacterEntity>;

    @Column({ name: 'image_path', type: 'text' })
    imagePath: string;

    /** The Reference image path it was cut from. */
    @Column({ name: 'cut_from', type: 'text' })
    cutFrom: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}
