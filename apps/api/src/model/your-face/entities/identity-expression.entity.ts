import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { PersonaEntity } from '../../persona/entities/persona.entity.js';
import type { RoleEntity } from '../../story/entities/role.entity.js';
import type { FaceEmotion } from '../../story/emotion.js';
import type { PortraitCrop } from '../../story/entities/character.entity.js';
import type { ExpressionResponse } from '../../story/entities/character-expression.entity.js';

/** Whose an identity Expression is: the Story's Role, or one of the user's Personas. */
export type FaceOwner = { roleId: number } | { personaId: number };

/**
 * An Expression of the user's own character (.scratch/your-faces/spec.md): the Role's or a
 * Persona's picture for one emotion, drawn from the Role image or Persona image, or uploaded. At
 * most one per owner and emotion. The row goes with its owner (ON DELETE CASCADE); the files are
 * deleted by whoever deletes the owner.
 */
@Entity('identity_expression')
export class IdentityExpressionEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'role_id', type: 'integer', nullable: true })
    roleId: number | null;

    @Column({ name: 'persona_id', type: 'integer', nullable: true })
    personaId: number | null;

    @ManyToOne('RoleEntity', 'expressions', { onDelete: 'CASCADE', orphanedRowAction: 'disable' })
    @JoinColumn({ name: 'role_id' })
    role: Relation<RoleEntity> | null;

    @ManyToOne('PersonaEntity', 'expressions', { onDelete: 'CASCADE', orphanedRowAction: 'disable' })
    @JoinColumn({ name: 'persona_id' })
    persona: Relation<PersonaEntity> | null;

    @Column({ type: 'text' })
    emotion: FaceEmotion;

    @Column({ name: 'image_path', type: 'text' })
    imagePath: string;

    /** Its own square; null uses the centre square of its picture. */
    @Column({ type: 'jsonb', nullable: true })
    crop: PortraitCrop | null;

    /** The Role image or Persona image it was drawn from; null for an upload. */
    @Column({ name: 'drawn_from', type: 'text', nullable: true })
    drawnFrom: string | null;

    @Column({ name: 'cutout_path', type: 'text', nullable: true })
    cutoutPath: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    /** `picturePath` is the owner's current Role image or Persona image, which `outdated` is read against. */
    toResponse(picturePath: string | null): ExpressionResponse {
        return {
            emotion: this.emotion,
            imagePath: this.imagePath,
            crop: this.crop ? { x: this.crop.x, y: this.crop.y, size: this.crop.size } : null,
            outdated: this.drawnFrom !== null && this.drawnFrom !== picturePath,
            cutoutPath: this.cutoutPath ?? null,
        };
    }
}
