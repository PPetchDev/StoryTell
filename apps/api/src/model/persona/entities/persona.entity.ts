import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export interface PersonaResponse {
    id: number;
    name: string;
    description: string;
    /** Its picture, as a path under `/api/images/` (.scratch/persona-image/spec.md); null without one. */
    imagePath: string | null;
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

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;

    toResponse(): PersonaResponse {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            imagePath: this.imagePath ?? null,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
        };
    }
}
