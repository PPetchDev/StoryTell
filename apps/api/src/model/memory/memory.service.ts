import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Not, Repository } from 'typeorm';

import { MemoryKnownByEntity } from './entities/memory-known-by.entity.js';
import { MemoryAuthor, MemoryEntity } from './entities/memory.entity.js';

export interface NewMemory {
    chatId: number;
    text: string;
    knownBy: number[];
    writtenBy: MemoryAuthor;
    locked: boolean;
    archived: boolean;
    messageId: number | null;
}

/** Repository wrapper for Memories and their Known-by sets. No rules here. */
@Injectable()
export class MemoryModelService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        @InjectRepository(MemoryEntity) private readonly memories: Repository<MemoryEntity>,
    ) {}

    /** Every Memory of the Chat, archived included, in a stable order (oldest first). */
    findByChat(chatId: number): Promise<MemoryEntity[]> {
        return this.memories.find({ where: { chatId }, relations: { knownBy: true }, order: { id: 'ASC' } });
    }

    /**
     * The same, without each Memory's vector, for the Memory list: only choosing Memories for a
     * turn reads it, and a Chat's few hundred vectors, repeated per Known-by row by the join,
     * took most of the list's half a second (docs/ui-audit-2026-11-13.md). `embedding` is null.
     */
    async findByChatWithoutVectors(chatId: number): Promise<MemoryEntity[]> {
        const memories = await this.memories.find({
            select: {
                id: true,
                chatId: true,
                text: true,
                writtenBy: true,
                locked: true,
                archived: true,
                messageId: true,
                createdAt: true,
                embeddingModel: true,
                knownBy: { memoryId: true, characterId: true },
            },
            where: { chatId },
            relations: { knownBy: true },
            order: { id: 'ASC' },
        });
        for (const memory of memories) memory.embedding = null;
        return memories;
    }

    findOne(chatId: number, memoryId: number): Promise<MemoryEntity | null> {
        return this.memories.findOne({ where: { id: memoryId, chatId }, relations: { knownBy: true } });
    }

    /** Stores a Memory with its Known by in one transaction. */
    create(fields: NewMemory): Promise<MemoryEntity> {
        return this.dataSource.transaction((manager) => createMemory(manager, fields));
    }

    /**
     * Replaces the text, the Known-by set and the flags in one transaction. New text drops the
     * vector of the old one (.scratch/memory-by-meaning/spec.md: "A Memory whose text changes loses
     * its vector until it is embedded again").
     */
    update(
        memory: MemoryEntity,
        fields: { text: string; knownBy: number[]; writtenBy: MemoryAuthor; locked: boolean; archived: boolean },
    ): Promise<void> {
        return this.dataSource.transaction(async (manager) => {
            await manager.update(
                MemoryEntity,
                { id: memory.id },
                {
                    text: fields.text,
                    writtenBy: fields.writtenBy,
                    locked: fields.locked,
                    archived: fields.archived,
                    ...(fields.text === memory.text ? {} : { embedding: null, embeddingModel: null }),
                },
            );
            await setKnownBy(manager, memory.id, fields.knownBy);
        });
    }

    async remove(memoryId: number): Promise<void> {
        await this.memories.delete({ id: memoryId });
    }

    /** The Chat's Memories with these ids, oldest first; ids of other Chats or of deleted Memories are skipped. */
    findByIds(chatId: number, memoryIds: number[]): Promise<MemoryEntity[]> {
        if (memoryIds.length === 0) return Promise.resolve([]);
        return this.memories.find({ where: { chatId, id: In(memoryIds) }, order: { id: 'ASC' } });
    }

    /** The Chat's Memories with no vector, or with one `model` didn't make, oldest first. */
    findUnembedded(chatId: number, model: string): Promise<MemoryEntity[]> {
        return this.memories.find({
            where: [
                { chatId, embedding: IsNull() },
                { chatId, embeddingModel: Not(model) },
            ],
            order: { id: 'ASC' },
        });
    }

    /** Every Chat (with its Story) that holds a Memory with no vector, or with one `model` didn't make, by Chat id. */
    async chatsWithUnembedded(model: string): Promise<Array<{ chatId: number; storyId: number }>> {
        const rows: Array<{ chat_id: number; story_id: number }> = await this.dataSource.query(
            `SELECT DISTINCT m."chat_id", c."story_id" FROM "memory" m JOIN "chat" c ON c."id" = m."chat_id"
             WHERE m."embedding" IS NULL OR m."embedding_model" IS DISTINCT FROM $1
             ORDER BY m."chat_id"`,
            [model],
        );
        return rows.map((row) => ({ chatId: row.chat_id, storyId: row.story_id }));
    }

    /**
     * Stores a Memory's vector, but only while its text is still `text`: a vector of words the
     * Memory no longer holds is never kept.
     */
    async setEmbedding(memoryId: number, text: string, embedding: number[], model: string): Promise<void> {
        await this.memories.update({ id: memoryId, text }, { embedding, embeddingModel: model });
    }
}

/**
 * Inserts a Memory and its Known-by rows. `id` may be given to put a deleted Memory back as
 * it was: that goes through SQL, since TypeORM replaces a given id on a generated column
 * with the next one from the sequence.
 */
export async function createMemory(manager: EntityManager, fields: NewMemory & { id?: number }): Promise<MemoryEntity> {
    let id: number;
    if (fields.id === undefined) {
        const inserted = await manager.insert(MemoryEntity, {
            chatId: fields.chatId,
            text: fields.text,
            writtenBy: fields.writtenBy,
            locked: fields.locked,
            archived: fields.archived,
            messageId: fields.messageId,
        });
        id = inserted.identifiers[0].id as number;
    } else {
        await manager.query(
            `INSERT INTO "memory" ("id", "chat_id", "text", "written_by", "locked", "archived", "message_id")
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [fields.id, fields.chatId, fields.text, fields.writtenBy, fields.locked, fields.archived, fields.messageId],
        );
        id = fields.id;
    }
    await manager.save(
        [...new Set(fields.knownBy)].map((characterId) => manager.create(MemoryKnownByEntity, { memoryId: id, characterId })),
    );
    const memory = await manager.findOne(MemoryEntity, { where: { id }, relations: { knownBy: true } });
    if (!memory) throw new Error(`Memory ${id} vanished right after it was inserted`);
    return memory;
}

/** Makes the Known-by set exactly `characterIds`. */
export async function setKnownBy(manager: EntityManager, memoryId: number, characterIds: number[]): Promise<void> {
    await manager.delete(MemoryKnownByEntity, { memoryId });
    await manager.save(
        [...new Set(characterIds)].map((characterId) => manager.create(MemoryKnownByEntity, { memoryId, characterId })),
    );
}
