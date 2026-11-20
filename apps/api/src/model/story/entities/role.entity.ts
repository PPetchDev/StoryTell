import { Column, Entity, JoinColumn, OneToMany, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { PortraitCrop } from './character.entity.js';
import type { Relation } from 'typeorm';

import { EXPRESSION_EMOTIONS } from '../emotion.js';
import type { IdentityExpressionEntity } from '../../your-face/entities/identity-expression.entity.js';
import type { ExpressionResponse } from './character-expression.entity.js';

import type { StoryEntity } from './story.entity.js';

/** One of the Role's Stats (.scratch/judge-rolls/spec.md): a name and the number it adds to a Roll. */
export interface RoleStat {
    name: string;
    value: number;
}

/** One of the Role's own sections (.scratch/role-sections/spec.md): a heading and free text. */
export interface RoleSection {
    heading: string;
    text: string;
}

export interface RoleResponse {
    id: number;
    name: string;
    description: string;
    /** Its Stats, in the author's order; empty without. */
    stats: RoleStat[];
    /** Its sections, in the author's order; empty without. */
    sections: RoleSection[];
    /** Its picture's path in the image folder (.scratch/role-image/spec.md), or null. */
    imagePath: string | null;
    /** Its picture's face square (.scratch/your-faces/spec.md); null uses the default. */
    imageCrop: PortraitCrop | null;
    /** Its Expressions (.scratch/your-faces/spec.md), in the order of the emotions; empty without. */
    expressions: ExpressionResponse[];
}

/** The part the user plays. Exactly one per Story, created with it. */
@Entity('role')
export class RoleEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'story_id', type: 'integer' })
    storyId: number;

    @OneToOne('StoryEntity', 'role', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'story_id' })
    story: Relation<StoryEntity>;

    @Column({ type: 'text', default: '' })
    name: string;

    @Column({ type: 'text', default: '' })
    description: string;

    /** Its Stats (.scratch/judge-rolls/spec.md), at most 6, in the author's order. */
    @Column({ type: 'jsonb', default: () => "'[]'" })
    stats: RoleStat[];

    /** Its sections (.scratch/role-sections/spec.md), at most 20, in the author's order. */
    @Column({ type: 'jsonb', default: () => "'[]'" })
    sections: RoleSection[];

    /**
     * Its picture (.scratch/role-image/spec.md): `role-images/story-<id>/picture-<random>.<ext>`,
     * owned by the Role, shown beside the user's lines written as the Role. No model reads it.
     */
    @Column({ name: 'image_path', type: 'text', nullable: true })
    imagePath: string | null;

    /** The face square of its picture, in fractions of its width (.scratch/your-faces/spec.md); null uses the default. */
    @Column({ name: 'image_crop', type: 'jsonb', nullable: true })
    imageCrop: PortraitCrop | null;

    /** Its Expressions (.scratch/your-faces/spec.md); loaded with the Story. */
    @OneToMany('IdentityExpressionEntity', 'role')
    expressions: Relation<IdentityExpressionEntity[]>;

    toResponse(): RoleResponse {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            stats: this.stats ?? [],
            sections: this.sections ?? [],
            imagePath: this.imagePath ?? null,
            imageCrop: this.imageCrop ? { x: this.imageCrop.x, y: this.imageCrop.y, size: this.imageCrop.size } : null,
            expressions: [...(this.expressions ?? [])]
                .sort((a, b) => EXPRESSION_EMOTIONS.indexOf(a.emotion) - EXPRESSION_EMOTIONS.indexOf(b.emotion))
                .map((expression) => expression.toResponse(this.imagePath ?? null)),
        };
    }
}
