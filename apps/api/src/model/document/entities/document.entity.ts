import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, VirtualColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { StoryEntity } from '../../story/entities/story.entity.js';

/** Where a Document's text came from (.scratch/documents/spec.md). */
export type DocumentSource = 'pasted' | 'file' | 'web';
export const DOCUMENT_SOURCES: readonly DocumentSource[] = ['pasted', 'file', 'web'];

/** A Document as the Story answers it: no text, no vectors. */
export interface DocumentSummary {
    id: number;
    title: string;
    source: DocumentSource;
    /** The file name or the page URL; null for pasted text. */
    sourceName: string | null;
    /** How many characters its text has. */
    characters: number;
    /** How many passages it was split into. */
    passages: number;
    createdAt: string;
}

/** A Document with its text, for reading. */
export interface DocumentText {
    id: number;
    title: string;
    source: DocumentSource;
    sourceName: string | null;
    text: string;
}

/**
 * A longer text the Narrator looks things up in by meaning (spec: "A Document and its
 * passages"). It belongs to the Story, shared by all its Chats, and its text never changes
 * once added, so its passages always match it. Ordered by `position` (add order).
 */
@Entity('story_document')
export class DocumentEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'story_id', type: 'integer' })
    storyId: number;

    @ManyToOne('StoryEntity', 'documents', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'story_id' })
    story: Relation<StoryEntity>;

    @Column({ type: 'text' })
    title: string;

    @Column({ type: 'text' })
    source: DocumentSource;

    @Column({ name: 'source_name', type: 'text', nullable: true })
    sourceName: string | null;

    /** Up to 200,000 characters: never read with the Story, only when asked for (`select: false`). */
    @Column({ type: 'text', select: false })
    text: string;

    @Column({ type: 'integer' })
    characters: number;

    /** The model every one of its passages was embedded with. */
    @Column({ name: 'embedding_model', type: 'text' })
    embeddingModel: string;

    @Column({ type: 'integer' })
    position: number;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    /** Counted when the Document is read; the passages themselves are never loaded with it. */
    @VirtualColumn({
        type: 'integer',
        query: (alias) => `SELECT COUNT(*) FROM "document_passage" WHERE "document_id" = ${alias}."id"`,
    })
    passageCount: number;

    toSummary(): DocumentSummary {
        return {
            id: this.id,
            title: this.title,
            source: this.source,
            sourceName: this.sourceName,
            characters: this.characters,
            passages: Number(this.passageCount ?? 0),
            createdAt: this.createdAt.toISOString(),
        };
    }
}
