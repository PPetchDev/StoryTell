import { Injectable, Logger } from '@nestjs/common';

import { AppConfig } from '../../../config/app-config.js';
import { AppError } from '../../../errors/app-error.js';
import { ChatModelService } from '../../../model/chat/chat.service.js';
import { ChatEntity } from '../../../model/chat/entities/chat.entity.js';
import { BackgroundStatus, MessageEntity, MessageKind } from '../../../model/chat/entities/message.entity.js';
import { LedgerModelService } from '../../../model/ledger/ledger.service.js';
import { MemoryModelService } from '../../../model/memory/memory.service.js';
import { StoryEntity } from '../../../model/story/entities/story.entity.js';
import { ModelGateway } from '../../../service/model-gateway/model-gateway.js';
import { SettledBackground, sleep } from '../judge/judge.service.js';
import { partsToText } from '../turn/reply-parser.js';
import { applyExtraction } from './apply-extraction.js';
import { buildExtractionPrompt, overMemoryCap, parseExtraction } from './memory-prompt.js';
import { presentCharacters } from './present.js';

/** The latest AI Message a model wrote, which is the only one whose extraction can be pending or failed. */
export function latestExtracted(chat: ChatEntity): MessageEntity | null {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
        const message = chat.messages[i];
        if (message.kind === MessageKind.Ai && message.memoryStatus !== null) return message;
    }
    return null;
}

/**
 * Memory extraction (spec: "Memory extraction"): one V4 Flash call in JSON mode after every
 * turn, in parallel with the judge, against the AI Message it extracts from. Its operations
 * go through the apply rules into the ledger, which changes the Memories; a failure of any
 * kind marks the Message failed with the reason, and the next send is blocked until Retry
 * runs the extraction again. Same shape as the judge.
 */
@Injectable()
export class MemoryExtractionManagerService {
    private readonly logger = new Logger(MemoryExtractionManagerService.name);
    /** The extraction running for each Chat, so a send can wait for it. */
    private readonly running = new Map<number, Promise<void>>();

    constructor(
        private readonly chatModel: ChatModelService,
        private readonly memoryModel: MemoryModelService,
        private readonly ledger: LedgerModelService,
        private readonly gateway: ModelGateway,
        private readonly config: AppConfig,
    ) {}

    /** Runs the extraction in the background. The Message's status must already be pending. */
    start(story: StoryEntity, chatId: number, messageId: number): void {
        void this.run(story, chatId, messageId);
    }

    /** Runs the extraction and resolves once its status is done or failed. Never rejects. */
    run(story: StoryEntity, chatId: number, messageId: number): Promise<void> {
        const work = this.execute(story, chatId, messageId).finally(() => {
            if (this.running.get(chatId) === work) this.running.delete(chatId);
        });
        this.running.set(chatId, work);
        return work;
    }

    /** Spec: "Send flow", step 2, for the extraction. Same rules as the judge's `settle`. */
    async settle(chat: ChatEntity): Promise<SettledBackground> {
        const last = latestExtracted(chat);
        if (!last) return { status: null, waited: false };
        if (last.memoryStatus !== BackgroundStatus.Pending) return { status: last.memoryStatus, waited: false };

        const running = this.running.get(chat.id);
        if (!running) {
            await this.chatModel.setMemoryStatus(last.id, BackgroundStatus.Failed, 'The app restarted before Memory extraction finished.');
            return { status: BackgroundStatus.Failed, waited: true };
        }
        const finished = await Promise.race([running.then(() => true), sleep(this.config.backgroundWaitMs)]);
        if (!finished) return { status: BackgroundStatus.Pending, waited: true };
        const fresh = await this.chatModel.findMessage(last.id);
        return { status: fresh?.memoryStatus ?? BackgroundStatus.Failed, waited: true };
    }

    private async execute(story: StoryEntity, chatId: number, messageId: number): Promise<void> {
        try {
            // Reloaded here, not taken from the caller: the Chat may have moved on since it was read.
            const chat = await this.chatModel.findWithMessages(chatId);
            const index = chat?.messages.findIndex((message) => message.id === messageId) ?? -1;
            if (!chat || index < 0) return;
            const message = chat.messages[index];
            const previous = chat.messages[index - 1];
            const userMessage = previous?.kind === MessageKind.User ? previous : null;
            const identityName = story.role.name;
            const cast = story.characters.map((character) => ({ id: character.id, name: character.name }));
            const nameOf = (characterId: number): string | null => cast.find((member) => member.id === characterId)?.name ?? null;
            const parts = message.parts.map((part) => part.toResponse());

            const memories = await this.memoryModel.findByChat(chat.id);
            const active = memories.filter((memory) => !memory.archived);
            const lines = active.map((memory) => ({
                id: memory.id,
                text: memory.text,
                knownBy: memory.knownByIds(cast.map((member) => member.id)).flatMap((id) => nameOf(id) ?? []),
                locked: memory.locked,
            }));
            const overCap = overMemoryCap(lines);
            if (overCap) this.logger.log(`Chat ${chat.id}: Memory is over the cap; asking the extraction to merge and archive`);
            const prompt = buildExtractionPrompt({
                cast: cast.map((member) => member.name),
                identityName,
                present: presentCharacters(cast, userMessage?.text ?? '', parts).map((member) => member.name),
                memories: lines,
                userText: userMessage?.text ?? '',
                aiText: partsToText(parts),
                overCap,
            });

            const result = await this.gateway.completeText({
                kind: 'memory_extraction',
                messages: prompt.messages,
                maxTokens: prompt.maxTokens,
                json: true,
                servedFor: { storyId: story.id, chatId: chat.id },
            });
            const extraction = parseExtraction(result.text);
            const applied = applyExtraction(
                {
                    cast,
                    identityName,
                    memories: memories.map((memory) => ({
                        id: memory.id,
                        text: memory.text,
                        knownBy: memory.knownByIds(),
                        locked: memory.locked,
                        archived: memory.archived,
                    })),
                },
                extraction,
            );
            for (const reason of applied.rejected) {
                this.logger.log(`Chat ${chat.id}, Message ${message.id}: extraction item dropped: ${reason}`);
            }
            await this.ledger.recordMemories(chat.id, message.id, applied.changes);
        } catch (error) {
            const reason = error instanceof AppError ? error.message : `Unexpected error: ${String(error)}`;
            this.logger.warn(`Chat ${chatId}, Message ${messageId}: Memory extraction failed: ${reason}`);
            try {
                await this.chatModel.setMemoryStatus(messageId, BackgroundStatus.Failed, reason);
            } catch (writeError) {
                this.logger.error(`Chat ${chatId}, Message ${messageId}: could not record the extraction failure: ${String(writeError)}`);
            }
        }
    }
}
