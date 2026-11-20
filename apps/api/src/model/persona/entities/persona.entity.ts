import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { PortraitCrop } from '../../story/entities/character.entity.js';
import type { Relation } from 'typeorm';

import { EXPRESSION_EMOTIONS } from '../../story/emotion.js';
import type { ExpressionResponse } from '../../story/entities/character-expression.entity.js';
import type { IdentityExpressionEntity } from '../../your-face/entities/identity-expression.entity.js';

export interface PersonaResponse {
    id: number;
    name: string;
    description: string;
    /** Its picture, as a path under `/api/images/` (.scratch/persona-image/spec.md); null without one. */
    imagePath: string | null;
    /** Its picture's face square (.scratch/your-faces/spec.md); null uses the default. */
    imageCrop: PortraitCrop | null;
    /** Its Expressions (.scratch/your-faces/spec.md), in the order of the emotions; empty without. */
    expressions: ExpressionResponse[];
    createdAt: string;
    updatedAt: string;
}

/**
 * The user's own reusable self-description (spec: "Personas"), app-level: a Name, a
 * Description and, when the user gives it one, a picture. A Chat can wear one in place of its
 * Story's Role.
 */
@Entity('persona')
export class PersonaEntity {
    @PrimaryGeneratedColumn()
    id: number;

    /** The Account it belongs to (.scratch/accounts/spec.md: "Ownership"). */
    @Column({ name: 'user_id', type: 'integer' })
    userId: number;

    @Column({ type: 'text' })
    name: string;

    @Column({ type: 'text', default: '' })
    description: string;

    /** The picture it owns, uploaded by the user (.scratch/persona-image/spec.md); NULL without one. The file goes with the Persona. */
    @Column({ name: 'image_path', type: 'text', nullable: true })
    imagePath: string | null;

    /** The face square of its picture, in fractions of its width (.scratch/your-faces/spec.md); null uses the default. */
    @Column({ name: 'image_crop', type: 'jsonb', nullable: true })
    imageCrop: PortraitCrop | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;

    /** Its Expressions (.scratch/your-faces/spec.md); loaded with it. */
    @OneToMany('IdentityExpressionEntity', 'persona')
    expressions: Relation<IdentityExpressionEntity[]>;

    toResponse(): PersonaResponse {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            imagePath: this.imagePath ?? null,
            imageCrop: this.imageCrop ? { x: this.imageCrop.x, y: this.imageCrop.y, size: this.imageCrop.size } : null,
            expressions: [...(this.expressions ?? [])]
                .sort((a, b) => EXPRESSION_EMOTIONS.indexOf(a.emotion) - EXPRESSION_EMOTIONS.indexOf(b.emotion))
                .map((expression) => expression.toResponse(this.imagePath ?? null)),
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
        };
    }
}
