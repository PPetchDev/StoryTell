import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { DocumentPassageEntity } from './entities/document-passage.entity.js';
import { DocumentEntity, DocumentSource } from './entities/document.entity.js';

export interface NewDocument {
    storyId: number;
    title: string;
    source: DocumentSource;
    sourceName: string | null;
    text: string;
    characters: number;
    embeddingModel: string;
}

export interface NewPassage {
    text: string;
    /** At unit length. */
    embedding: number[];
}

/** How many passages go in one INSERT: each carries a vector of a thousand numbers. */
const INSERT_CHUNK = 50;

/** A stored passage as a turn compares it, with the model its Document was embedded with. */
export interface StoredPassage {
    id: number;
    documentId: number;
    position: number;
    text: string;
    embedding: number[];
    model: string;
}

/**
 * Repository wrapper for Documents and their passages (.scratch/documents/spec.md). No business
 * rules live here. A Story's passages are read once and kept in memory (spec: "The vectors"),
 * until one of its Documents is added or removed, or it is deleted (`forget`).
 */
@Injectable()
export class DocumentModelService {
    private readonly passageCache = new Map<number, Promise<StoredPassage[]>>();

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        @InjectRepository(DocumentEntity) private readonly documents: Repository<DocumentEntity>,
    ) {}

    /** Every passage of the Story with its vector, from memory after the first read. */
    passagesOf(storyId: number): Promise<StoredPassage[]> {
        let cached = this.passageCache.get(storyId);
        if (!cached) {
            cached = this.readPassages(storyId);
            this.passageCache.set(storyId, cached);
            // A failed read is not kept.
            cached.catch(() => this.passageCache.delete(storyId));
        }
        return cached;
    }

    /** Those of the given passages that still exist in the Story, with their Document's title, in the order given. */
    async passagesByIds(
        storyId: number,
        ids: number[],
    ): Promise<Array<{ id: number; documentId: number; documentTitle: string; position: number; text: string }>> {
        if (ids.length === 0) return [];
        const rows = await this.dataSource.query<Array<{ id: number; document_id: number; title: string; position: number; text: string }>>(
            `SELECT p."id", p."document_id", d."title", p."position", p."text"
             FROM "document_passage" p JOIN "story_document" d ON d."id" = p."document_id"
             WHERE p."story_id" = $1 AND p."id" = ANY($2::int[])`,
            [storyId, ids],
        );
        const byId = new Map(rows.map((row) => [row.id, row]));
        return ids.flatMap((id) => {
            const row = byId.get(id);
            return row ? [{ id: row.id, documentId: row.document_id, documentTitle: row.title, position: row.position, text: row.text }] : [];
        });
    }

    /** Drops the Story's passages from memory, so the next turn reads them afresh. */
    forget(storyId: number): void {
        this.passageCache.delete(storyId);
    }

    private async readPassages(storyId: number): Promise<StoredPassage[]> {
        const rows = await this.dataSource.query<
            Array<{ id: number; document_id: number; position: number; text: string; embedding: number[]; model: string }>
        >(
            `SELECT p."id", p."document_id", p."position", p."text", p."embedding", d."embedding_model" AS "model"
             FROM "document_passage" p JOIN "story_document" d ON d."id" = p."document_id"
             WHERE p."story_id" = $1 ORDER BY d."position", p."position"`,
            [storyId],
        );
        return rows.map((row) => ({
            id: row.id,
            documentId: row.document_id,
            position: row.position,
            text: row.text,
            embedding: row.embedding.map(Number),
            model: row.model,
        }));
    }

    /** Stores a Document after the Story's others, with all its passages, in one transaction. Answers its id. */
    async insert(document: NewDocument, passages: NewPassage[]): Promise<number> {
        this.forget(document.storyId);
        const id = await this.dataSource.transaction(async (manager) => {
            const [{ next }] = await manager.query<Array<{ next: number }>>(
                `SELECT COALESCE(MAX("position"), -1) + 1 AS next FROM "story_document" WHERE "story_id" = $1`,
                [document.storyId],
            );
            const saved = await manager.save(manager.create(DocumentEntity, { ...document, position: Number(next) }));
            await insertPassages(
                manager,
                passages.map((passage, position) => ({ ...passage, position, documentId: saved.id, storyId: document.storyId })),
            );
            return saved.id;
        });
        // Again once stored: a turn that read the passages meanwhile cached them without this one.
        this.forget(document.storyId);
        return id;
    }

    /** One of the Story's Documents with its text, or null when the Story has none by that id. */
    findWithText(storyId: number, documentId: number): Promise<DocumentEntity | null> {
        return this.documents
            .createQueryBuilder('document')
            .addSelect('document.text')
            .where('document.id = :documentId AND document.story_id = :storyId', { documentId, storyId })
            .getOne();
    }

    async rename(documentId: number, title: string): Promise<void> {
        await this.documents.update({ id: documentId }, { title });
    }

    /** Its passages go with it through ON DELETE CASCADE, and out of memory. */
    async remove(storyId: number, documentId: number): Promise<void> {
        await this.documents.delete({ id: documentId, storyId });
        this.forget(storyId);
    }
}

/**
 * Copies a Story's Documents, passages and vectors included, to another Story inside the
 * caller's transaction (Duplicate Story). No call: the vectors are the same.
 */
export async function copyDocuments(manager: EntityManager, fromStoryId: number, toStoryId: number): Promise<void> {
    const sources = await manager.query<Array<{ id: number }>>(
        `SELECT "id" FROM "story_document" WHERE "story_id" = $1 ORDER BY "position", "id"`,
        [fromStoryId],
    );
    for (const { id } of sources) {
        const [{ id: copyId }] = await manager.query<Array<{ id: number }>>(
            `INSERT INTO "story_document" ("story_id", "title", "source", "source_name", "text", "characters", "embedding_model", "position")
             SELECT $1, "title", "source", "source_name", "text", "characters", "embedding_model", "position"
             FROM "story_document" WHERE "id" = $2
             RETURNING "id"`,
            [toStoryId, id],
        );
        await manager.query(
            `INSERT INTO "document_passage" ("document_id", "story_id", "position", "text", "embedding")
             SELECT $1, $2, "position", "text", "embedding" FROM "document_passage" WHERE "document_id" = $3`,
            [copyId, toStoryId, id],
        );
    }
}

/** Inserts passages in chunks, so no statement carries hundreds of vectors. */
export async function insertPassages(
    manager: EntityManager,
    passages: Array<Pick<DocumentPassageEntity, 'documentId' | 'storyId' | 'position' | 'text' | 'embedding'>>,
): Promise<void> {
    for (let at = 0; at < passages.length; at += INSERT_CHUNK) {
        await manager.insert(DocumentPassageEntity, passages.slice(at, at + INSERT_CHUNK));
    }
}
