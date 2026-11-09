import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { Relation } from 'typeorm';

import type { ExpressionEmotion } from '../emotion.js';
import type { CharacterEntity, PortraitCrop } from './character.entity.js';

/** An Expression as a Character answers it (.scratch/expressions/spec.md, "Storage"). */
export interface ExpressionResponse {
    emotion: ExpressionEmotion;
    /** Relative to the image folder; served by `GET /api/images/{path}`. */
    imagePath: string;
    /** Its own square; null uses the Portrait's. */
    crop: PortraitCrop | null;
    /** Drawn from a Reference image the Character no longer has (or from one when they have none now). */
    outdated: boolean;
}

/**
 * A Character's picture for one emotion (CONTEXT.md: "Expression"), drawn from their Reference
 * image or uploaded. At most one per emotion. The file is written and deleted by the Story
 * authoring module; the row goes with the Character (ON DELETE CASCADE).
 */
@Entity('character_expression')
@Unique('uq_character_expression_emotion', ['characterId', 'emotion'])
export class CharacterExpressionEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'character_id', type: 'integer' })
    characterId: number;

    @ManyToOne('CharacterEntity', 'expressions', { onDelete: 'CASCADE', orphanedRowAction: 'disable' })
    @JoinColumn({ name: 'character_id' })
    character: Relation<CharacterEntity>;

    @Column({ type: 'text' })
    emotion: ExpressionEmotion;

    @Column({ name: 'image_path', type: 'text' })
    imagePath: string;

    @Column({ type: 'jsonb', nullable: true })
    crop: PortraitCrop | null;

    /** The Reference image path it was drawn from; null for an upload. */
    @Column({ name: 'drawn_from', type: 'text', nullable: true })
    drawnFrom: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    /** `referenceImagePath` is the Character's current one, which `outdated` is read against. */
    toResponse(referenceImagePath: string | null): ExpressionResponse {
        return {
            emotion: this.emotion,
            imagePath: this.imagePath,
            crop: this.crop ? { x: this.crop.x, y: this.crop.y, size: this.crop.size } : null,
            outdated: this.drawnFrom !== null && this.drawnFrom !== referenceImagePath,
        };
    }
}
