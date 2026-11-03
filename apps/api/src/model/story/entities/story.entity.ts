import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export interface StorySummary {
    id: number;
    title: string;
    createdAt: string;
    updatedAt: string;
}

// Only the columns the home screen needs. Ticket 21 adds the rest of the Story.
@Entity('story')
export class StoryEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'text' })
    title: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;

    toResponse(): StorySummary {
        return {
            id: this.id,
            title: this.title,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
        };
    }
}
