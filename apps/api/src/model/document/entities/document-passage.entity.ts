import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { DocumentEntity } from './document.entity.js';

/**
 * A piece of a Document of a few hundred words, with its meaning as a vector (spec: "A
 * Document and its passages"). `story_id` is kept so a turn reads one Story's passages
 * without a join. The vector is a plain `real[]` stored at unit length, so cosine similarity
 * is a dot product: no pgvector.
 */
@Entity('document_passage')
export class DocumentPassageEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'document_id', type: 'integer' })
    documentId: number;

    @ManyToOne('DocumentEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'document_id' })
    document: Relation<DocumentEntity>;

    @Index()
    @Column({ name: 'story_id', type: 'integer' })
    storyId: number;

    /** Its place in the Document, from 0. */
    @Column({ type: 'integer' })
    position: number;

    @Column({ type: 'text' })
    text: string;

    @Column({ type: 'real', array: true })
    embedding: number[];
}
