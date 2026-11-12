import { Injectable, Logger } from '@nestjs/common';

import { ChatNotFoundError, EmptyStorySoFarError, NoStorySoFarError } from '../../../errors/chat.errors.js';
import { UnparseableOutputError } from '../../../errors/model-gateway.errors.js';
import { StoryNotFoundError } from '../../../errors/story.errors.js';
import { ChatModelService } from '../../../model/chat/chat.service.js';
import { ChatEntity, StorySoFarAuthor } from '../../../model/chat/entities/chat.entity.js';
import { MessageEntity, MessageKind } from '../../../model/chat/entities/message.entity.js';
import { StoryEntity } from '../../../model/story/entities/story.entity.js';
import { StoryModelService } from '../../../model/story/story.service.js';
import { ModelGateway } from '../../../service/model-gateway/model-gateway.js';
import { wornIdentity } from '../identity.js';
import { partsToText } from '../turn/reply-parser.js';
import { PromptHistoryMessage, PromptLayersInput, PromptStorySoFar } from '../turn/prompt.js';
import {
    parseStorySoFar,
    STORY_SO_FAR_MAX_TOKENS,
    storySoFarCoverage,
    storySoFarPromptMessages,
    storySoFarRejection,
} from './story-so-far-prompt.js';

/** Spec: "Writer output guard": a rejected answer is asked for once more before the update fails. */
const WRITER_ATTEMPTS = 2;

/** The Story so far as the Memory drawer reads it (spec: "API"). */
export interface StorySoFarView {
    chatId: number;
    /** Null while the whole Chat still fits and there is none. */
    text: string | null;
    /** How many of the Chat's first Messages it covers; 0 while there is none. */
    coveredMessages: number;
    writtenBy: StorySoFarAuthor;
    updatedAt: string | null;
    /** Why the last update failed, or null. It is tried again after the next turn. */
    failedReason: string | null;
}

/** The text of a Message as the turn history renders it: the user's text, or the AI's `@Name:` text. */
export function messageText(message: MessageEntity): string {
    return message.kind === MessageKind.User
        ? (message.text ?? '')
        : partsToText([...(message.parts ?? [])].sort((a, b) => a.position - b.position).map((part) => part.toResponse()));
}

/** The Chat's Story so far for a prompt, with how many of its first Messages it covers; null while there is none. */
export function promptStorySoFar(chat: ChatEntity): PromptStorySoFar | null {
    if (chat.storySoFar === null || chat.storySoFarThrough === null) return null;
    const through = chat.storySoFarThrough;
    return { text: chat.storySoFar, coveredMessages: chat.messages.filter((message) => message.position <= through).length };
}

/**
 * Spec: "Story so far". After every turn, checks whether the Messages after the covered
 * ones are about to outgrow the prompt, and if so writes the account again from every
 * Message it will cover. Never blocks a send: a failure keeps the old text, records why,
 * and the next turn's check runs it again. A rewind or the user's own save bumps the
 * Chat's generation, so an update that finishes after one is dropped instead of stored.
 */
@Injectable()
export class StorySoFarManagerService {
    private readonly logger = new Logger(StorySoFarManagerService.name);
    /** The update running for each Chat; at most one at a time. */
    private readonly running = new Map<number, Promise<void>>();
    /** A check asked for while one runs, by Chat: it runs once that one ends, against the Chat as it is then. */
    private readonly again = new Map<number, () => void>();
    /** Bumped by every clear and every user save; an update started before one is dropped. */
    private readonly generations = new Map<number, number>();

    constructor(
        private readonly storyModel: StoryModelService,
        private readonly chatModel: ChatModelService,
        private readonly gateway: ModelGateway,
    ) {}

    /**
     * Runs the check, and the update if one is due, in the background. `layersFor` reads the
     * prompt's system layers for the Chat as it stands, Story so far included.
     */
    start(story: StoryEntity, chatId: number, layersFor: (chat: ChatEntity) => Promise<PromptLayersInput>): void {
        // A turn that settles while an update runs still gets its check, once that update ends:
        // dropping it would leave the next update a turn late, or never due when no turn follows.
        if (this.running.has(chatId)) {
            this.again.set(chatId, () => this.start(story, chatId, layersFor));
            return;
        }
        const work = this.update(story, chatId, layersFor).finally(() => {
            this.running.delete(chatId);
            const next = this.again.get(chatId);
            this.again.delete(chatId);
            next?.();
        });
        this.running.set(chatId, work);
    }

    /** Resolves once the Chat has no update running or waiting to run. For tests and shutdown. */
    async idle(chatId: number): Promise<void> {
        while (this.running.has(chatId)) await this.running.get(chatId);
    }

    /** Spec: "Edits, Regenerate, Reset". The Chat has no Story so far again; a running update is dropped. */
    async clear(chatId: number): Promise<void> {
        this.bump(chatId);
        await this.chatModel.clearStorySoFar(chatId);
    }

    /** Clears it when a rewind from `fromPosition` reaches a Message it covers. */
    async rewound(chat: ChatEntity, fromPosition: number): Promise<void> {
        if (chat.storySoFarThrough !== null && fromPosition <= chat.storySoFarThrough) await this.clear(chat.id);
    }

    async get(storyId: number, chatId: number): Promise<StorySoFarView> {
        return view(await this.load(storyId, chatId));
    }

    /** The user's own text: it stays the Story so far until the next update, which keeps its corrections. */
    async save(storyId: number, chatId: number, text: string): Promise<StorySoFarView> {
        if (text.trim() === '') throw new EmptyStorySoFarError();
        const chat = await this.load(storyId, chatId);
        if (chat.storySoFarThrough === null) throw new NoStorySoFarError();
        this.bump(chatId);
        await this.chatModel.setStorySoFar(chatId, text.trim(), chat.storySoFarThrough, 'user');
        return this.get(storyId, chatId);
    }

    private async update(story: StoryEntity, chatId: number, layersFor: (chat: ChatEntity) => Promise<PromptLayersInput>): Promise<void> {
        const generation = this.generationOf(chatId);
        try {
            const chat = await this.chatModel.findWithMessages(chatId);
            if (!chat) return;
            const layers = await layersFor(chat);
            const history: PromptHistoryMessage[] = chat.messages.map((message) => ({
                role: message.kind === MessageKind.User ? 'user' : 'assistant',
                text: messageText(message),
            }));
            const next = storySoFarCoverage({ ...layers, storySoFar: promptStorySoFar(chat) }, history);
            if (next === null) return;

            const identity = wornIdentity(story, chat);
            const covered = chat.messages.slice(0, next);
            const messages = covered.map((message) => ({
                speaker: message.kind === MessageKind.User ? (message.identityName ?? identity.name) : 'Story',
                text: messageText(message),
            }));
            const request = {
                kind: 'story_summary' as const,
                messages: storySoFarPromptMessages({
                    identityName: identity.name,
                    castNames: story.characters.map((character) => character.name),
                    messages,
                    corrections: chat.storySoFarCorrections,
                }),
                maxTokens: STORY_SO_FAR_MAX_TOKENS,
                servedFor: { storyId: story.id, chatId },
            };
            const speakers = [...new Set(messages.map((message) => message.speaker))];
            // Spec: "Writer output guard". A cut-off or off-form answer is asked for once more, then fails.
            let text: string;
            for (let attempt = 1; ; attempt++) {
                const result = await this.gateway.completeText(request);
                const parsed = parseStorySoFar(result.text);
                const rejection = parsed === null ? 'The Story so far writer wrote nothing.' : storySoFarRejection(parsed, result.usage.completionTokens, speakers);
                if (parsed !== null && rejection === null) {
                    text = parsed;
                    break;
                }
                if (attempt >= WRITER_ATTEMPTS) throw new UnparseableOutputError(rejection ?? 'The Story so far writer wrote nothing.');
                this.logger.warn(`Chat ${chatId}: ${rejection} Asking once more.`);
            }
            if (this.generationOf(chatId) !== generation) {
                this.logger.log(`Chat ${chatId}: a Story so far update finished after a rewind or the user's save; dropped`);
                return;
            }
            await this.chatModel.setStorySoFar(chatId, text, covered[covered.length - 1].position, 'ai');
            this.logger.log(`Chat ${chatId}: the Story so far now covers the first ${covered.length} Messages`);
        } catch (error) {
            const reason = (error as Error).message;
            this.logger.warn(`Chat ${chatId}: the Story so far update failed (${reason}); it runs again after the next turn`);
            if (this.generationOf(chatId) === generation) await this.chatModel.setStorySoFarFailed(chatId, reason).catch(() => undefined);
        }
    }

    private generationOf(chatId: number): number {
        return this.generations.get(chatId) ?? 0;
    }

    private bump(chatId: number): void {
        this.generations.set(chatId, this.generationOf(chatId) + 1);
    }

    private async load(storyId: number, chatId: number): Promise<ChatEntity> {
        const story = await this.storyModel.findFull(storyId);
        if (!story) throw new StoryNotFoundError();
        const chat = await this.chatModel.findWithMessages(chatId);
        if (!chat || chat.storyId !== storyId) throw new ChatNotFoundError();
        return chat;
    }
}

function view(chat: ChatEntity): StorySoFarView {
    const prompt = promptStorySoFar(chat);
    return {
        chatId: chat.id,
        text: prompt?.text ?? null,
        coveredMessages: prompt?.coveredMessages ?? 0,
        writtenBy: chat.storySoFarBy,
        updatedAt: chat.storySoFarUpdatedAt?.toISOString() ?? null,
        failedReason: chat.storySoFarFailed,
    };
}
