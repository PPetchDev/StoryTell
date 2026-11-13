import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export interface PersonaResponse {
    id: number;
    name: string;
    description: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * The user's own reusable self-description (spec: "Personas"), app-level, Name and
 * Description only. A Chat can wear one in place of its Story's Role.
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

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;

    toResponse(): PersonaResponse {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
        };
    }
}
