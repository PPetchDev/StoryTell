import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { OutOfCreditError } from '../../../errors/model-gateway.errors.js';
import { MemoryEntity } from '../../../model/memory/entities/memory.entity.js';
import { MemoryModelService } from '../../../model/memory/memory.service.js';
import { ModelGateway } from '../../../service/model-gateway/model-gateway.js';
import { unitLength } from '../../document/document-search.js';

/** Memories embedded per `memory_embedding` call, as Document passages are. */
export const MEMORY_EMBEDDING_BATCH = 32;

/**
 * Memory vectors (.scratch/memory-by-meaning/spec.md, "Embedding Memories"): each Memory is
 * embedded as a Document passage is, in `memory_embedding` calls of the text pool, and stored at
 * unit length with the model that made it. After an extraction is recorded, every Memory of the
 * Chat still without a current vector (the ones it added or reworded, and any a rollback put
 * back or an earlier failure left) goes in one call; a Memory the user adds or edits is embedded
 * on save. A failure only logs: the vector stays null, and nothing it serves fails. At API
 * start a backfill embeds, in batches, every Memory with no vector or another model's.
 */
@Injectable()
export class MemoryEmbeddingManagerService implements OnApplicationBootstrap {
    private readonly logger = new Logger(MemoryEmbeddingManagerService.name);
    /** The backfill running now, so two never overlap. */
    private backfilling: Promise<void> = Promise.resolve();

    constructor(
        private readonly memoryModel: MemoryModelService,
        private readonly gateway: ModelGateway,
    ) {}

    /** Spec: "a background job at API start". Never awaited: the API serves meanwhile. */
    onApplicationBootstrap(): void {
        void this.backfill();
    }

    /** Embeds the given Memories of a Chat, as the user saved them. Never rejects. */
    async embedSaved(storyId: number, chatId: number, memoryIds: number[]): Promise<void> {
        await this.embed(storyId, chatId, await this.memoryModel.findByIds(chatId, memoryIds));
    }

    /**
     * After an extraction is recorded: every Memory of the Chat with no vector, or another
     * model's, which takes in the ones it added or reworded. Never rejects.
     */
    async embedAfterExtraction(storyId: number, chatId: number): Promise<void> {
        try {
            await this.embed(storyId, chatId, await this.memoryModel.findUnembedded(chatId, this.gateway.embeddingModel()));
        } catch (error) {
            this.logger.warn(`Chat ${chatId}: could not look up the Memories to embed: ${String(error)}`);
        }
    }

    /**
     * Spec: "Backfill". Every Memory with no vector or with another model's, Chat by Chat, in
     * batches of 32. A failed batch is left for the next run; out of text credit stops the run,
     * since every later call would fail the same way. Runs after any backfill already running.
     */
    backfill(): Promise<void> {
        this.backfilling = this.backfilling.then(() => this.runBackfill());
        return this.backfilling;
    }

    private async runBackfill(): Promise<void> {
        try {
            const model = this.gateway.embeddingModel();
            const chats = await this.memoryModel.chatsWithUnembedded(model);
            if (chats.length === 0) return;
            let embedded = 0;
            for (const { storyId, chatId } of chats) {
                const memories = await this.memoryModel.findUnembedded(chatId, model);
                const outcome = await this.embed(storyId, chatId, memories);
                embedded += outcome.embedded;
                if (outcome.outOfCredit) {
                    this.logger.warn('Memory backfill stopped: text credit is out. The rest are embedded on the next start.');
                    break;
                }
            }
            this.logger.log(`Memory backfill: embedded ${embedded} Memories across ${chats.length} Chats`);
        } catch (error) {
            this.logger.warn(`Memory backfill failed: ${String(error)}`);
        }
    }

    /** Embeds these Memories in batches, storing each vector at unit length. Never rejects. */
    private async embed(storyId: number, chatId: number, memories: MemoryEntity[]): Promise<{ embedded: number; outOfCredit: boolean }> {
        let embedded = 0;
        for (let at = 0; at < memories.length; at += MEMORY_EMBEDDING_BATCH) {
            const batch = memories.slice(at, at + MEMORY_EMBEDDING_BATCH);
            try {
                const result = await this.gateway.embedTexts({
                    kind: 'memory_embedding',
                    inputs: batch.map((memory) => memory.text),
                    servedFor: { storyId, chatId },
                });
                for (const [index, memory] of batch.entries()) {
                    await this.memoryModel.setEmbedding(memory.id, memory.text, unitLength(result.vectors[index]), result.model);
                }
                embedded += batch.length;
            } catch (error) {
                this.logger.warn(
                    `Chat ${chatId}: could not embed ${batch.length} Memories; they stay unembedded until they are embedded again: ${error instanceof Error ? error.message : String(error)}`,
                );
                if (error instanceof OutOfCreditError) return { embedded, outOfCredit: true };
            }
        }
        return { embedded, outOfCredit: false };
    }
}
