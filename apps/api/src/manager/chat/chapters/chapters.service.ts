import { Injectable, Logger } from '@nestjs/common';

import { ChapterNotFailedError, ChapterNotFoundError, ChatNotFoundError, EmptyChapterError } from '../../../errors/chat.errors.js';
import { UnparseableOutputError } from '../../../errors/model-gateway.errors.js';
import { StoryNotFoundError } from '../../../errors/story.errors.js';
import { ChatModelService } from '../../../model/chat/chat.service.js';
import { ChatEntity } from '../../../model/chat/entities/chat.entity.js';
import { MessageKind } from '../../../model/chat/entities/message.entity.js';
import { ChapterAuthor, SceneAdvanceEntity, SceneMover } from '../../../model/ledger/entities/scene-advance.entity.js';
import { LedgerModelService } from '../../../model/ledger/ledger.service.js';
import { StoryEntity } from '../../../model/story/entities/story.entity.js';
import { StoryModelService } from '../../../model/story/story.service.js';
import { ModelGateway } from '../../../service/model-gateway/model-gateway.js';
import { wornIdentity } from '../identity.js';
import { messageText } from '../story-so-far/story-so-far.service.js';
import {
    CHAPTER_MAX_TOKENS,
    chapterPromptMessages,
    chapterRanges,
    chapterRejection,
    chaptersToWrite,
    parseChapter,
} from './chapters.js';

/** A rejected answer is asked for once more before the try fails, as the Story so far's is. */
const WRITER_ATTEMPTS = 2;

/**
 * Where a Chapter's summary stands: written; being written now; not tried yet, so a coming turn writes it;
 * failed, waiting for the user's Try again; or nothing to write, with no Messages of its own.
 */
export type ChapterStatus = 'written' | 'writing' | 'waiting' | 'failed' | 'empty';

/** One ended Chapter as the sheet reads it (.scratch/scene-chapters/spec.md, "API"). */
export interface ChapterView {
    /** The Scene advance's id, which ended it. */
    id: number;
    number: number;
    /** The Scene it was played in, stamped. */
    sceneName: string;
    /** The Scene it led to; null for free play. */
    toSceneName: string | null;
    movedBy: SceneMover;
    event: string;
    /** The AI Message it ended at. */
    messageId: number;
    endedAt: string;
    summary: string | null;
    writtenBy: ChapterAuthor;
    status: ChapterStatus;
    failedReason: string | null;
}

export interface ChaptersView {
    /** The Chapter under way: its number, and its Scene (null in free play). */
    current: { number: number; scene: { id: number; name: string } | null };
    /** Every ended Chapter, oldest first. */
    chapters: ChapterView[];
}

/**
 * Chapters (.scratch/scene-chapters/spec.md). After every reply's Judge settles and after a Move on,
 * writes the summaries of the Chapters never tried yet, a few at a time, one run per Chat at a time. A
 * failed one waits for the user's Try again. Never blocks play, and no prompt reads what it writes.
 */
@Injectable()
export class ChaptersManagerService {
    private readonly logger = new Logger(ChaptersManagerService.name);
    /** Each Chat's chain of runs; at most one runs at a time. */
    private readonly chains = new Map<number, Promise<void>>();
    /** Chats with a run waiting to start: a second ask meanwhile is the same run. */
    private readonly queued = new Set<number>();
    /** The Chapters being written now (or queued by a Try again), by advance id. */
    private readonly writing = new Set<number>();

    constructor(
        private readonly storyModel: StoryModelService,
        private readonly chatModel: ChatModelService,
        private readonly ledger: LedgerModelService,
        private readonly gateway: ModelGateway,
    ) {}

    /** Writes the Chapters due, in the background. Never rejects. */
    start(story: StoryEntity, chatId: number): void {
        if (this.queued.has(chatId)) return;
        this.queued.add(chatId);
        this.enqueue(chatId, async () => {
            this.queued.delete(chatId);
            await this.writeDue(story, chatId);
        });
    }

    /** Resolves once the Chat has no run going or waiting. For tests and shutdown. */
    async idle(chatId: number): Promise<void> {
        while (this.chains.has(chatId)) await this.chains.get(chatId);
    }

    async list(storyId: number, chatId: number): Promise<ChaptersView> {
        const { story, chat } = await this.load(storyId, chatId);
        return this.view(story, chat, await this.ledger.sceneAdvancesOf(chatId));
    }

    /** The user's own summary: kept as written, and never written over by the AI. */
    async save(storyId: number, chatId: number, chapterId: number, text: string): Promise<ChaptersView> {
        if (text.trim() === '') throw new EmptyChapterError();
        await this.load(storyId, chatId);
        if (!(await this.ledger.saveUserChapter(chatId, chapterId, text.trim()))) throw new ChapterNotFoundError();
        return this.list(storyId, chatId);
    }

    /** The user's Try again on a failed Chapter: written in the background, after any run for the Chat. */
    async retry(storyId: number, chatId: number, chapterId: number): Promise<ChaptersView> {
        const { story, chat } = await this.load(storyId, chatId);
        const advances = await this.ledger.sceneAdvancesOf(chatId);
        const chapter = this.view(story, chat, advances).chapters.find((candidate) => candidate.id === chapterId);
        if (!chapter) throw new ChapterNotFoundError();
        if (chapter.status !== 'failed') throw new ChapterNotFailedError();
        this.writing.add(chapterId);
        this.enqueue(chatId, () => this.writeOne(story, chatId, chapterId));
        return this.list(storyId, chatId);
    }

    private enqueue(chatId: number, work: () => Promise<void>): void {
        const before = this.chains.get(chatId) ?? Promise.resolve();
        const chain = before.then(work).catch((error: unknown) => {
            this.logger.warn(`Chat ${chatId}: Chapters not written: ${error instanceof Error ? error.message : String(error)}`);
        });
        this.chains.set(chatId, chain);
        void chain.finally(() => {
            if (this.chains.get(chatId) === chain) this.chains.delete(chatId);
        });
    }

    private async writeDue(story: StoryEntity, chatId: number): Promise<void> {
        const chat = await this.chatModel.findWithMessages(chatId);
        if (!chat) return;
        const advances = await this.ledger.sceneAdvancesOf(chatId);
        const ranges = new Map(chapterRanges(chat.messages, advances).map((range) => [range.advanceId, range]));
        const due = chaptersToWrite(
            advances.flatMap((advance) => {
                const range = ranges.get(advance.id);
                if (!range || advance.chapterBy !== 'ai') return [];
                return [{ advanceId: advance.id, hasMessages: range.from <= range.through, summary: advance.chapterSummary, failed: advance.chapterFailed }];
            }),
        );
        for (const id of due) this.writing.add(id);
        // One after another: each reads the one before it, which may be among them.
        for (const id of due.reverse()) await this.writeOne(story, chatId, id);
    }

    /** Writes one Chapter's summary, or records why it failed. Never rejects. */
    private async writeOne(story: StoryEntity, chatId: number, advanceId: number): Promise<void> {
        try {
            const chat = await this.chatModel.findWithMessages(chatId);
            if (!chat) return;
            const advances = await this.ledger.sceneAdvancesOf(chatId);
            const index = advances.findIndex((advance) => advance.id === advanceId);
            const advance = advances[index];
            // Rolled back meanwhile, or written by the user: nothing to do.
            if (!advance || advance.chapterBy !== 'ai' || advance.chapterSummary !== null) return;
            const range = chapterRanges(chat.messages, advances).find((candidate) => candidate.advanceId === advanceId);
            if (!range || range.from > range.through) return;

            const identity = wornIdentity(story, chat);
            const messages = chat.messages
                .filter((message) => message.position >= range.from && message.position <= range.through)
                .map((message) => ({
                    speaker: message.kind === MessageKind.User ? (message.identityName ?? identity.name) : 'Story',
                    text: messageText(message),
                }));
            const request = {
                kind: 'chapter_summary' as const,
                messages: chapterPromptMessages({
                    sceneName: advance.fromSceneName,
                    identityName: identity.name,
                    castNames: story.characters.map((character) => character.name),
                    messages,
                    previous: index > 0 ? advances[index - 1].chapterSummary : null,
                }),
                maxTokens: CHAPTER_MAX_TOKENS,
                servedFor: { storyId: story.id, chatId },
            };
            const speakers = [...new Set(messages.map((message) => message.speaker))];
            let text: string;
            for (let attempt = 1; ; attempt++) {
                const result = await this.gateway.completeText(request);
                const parsed = parseChapter(result.text);
                const rejection = parsed === null ? 'The Chapter writer wrote nothing.' : chapterRejection(parsed, result.usage.completionTokens, speakers);
                if (parsed !== null && rejection === null) {
                    text = parsed;
                    break;
                }
                if (attempt >= WRITER_ATTEMPTS) throw new UnparseableOutputError(rejection ?? 'The Chapter writer wrote nothing.');
                this.logger.warn(`Chat ${chatId}, Chapter ${advanceId}: ${rejection} Asking once more.`);
            }
            if (await this.ledger.writeChapter(advanceId, text)) {
                this.logger.log(`Chat ${chatId}: Chapter "${advance.fromSceneName}" written`);
            } else {
                this.logger.log(`Chat ${chatId}: Chapter ${advanceId} finished after a rollback or the user's own text; dropped`);
            }
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Chat ${chatId}: Chapter ${advanceId} not written (${reason}); the user can try again`);
            await this.ledger.failChapter(advanceId, reason).catch(() => undefined);
        } finally {
            this.writing.delete(advanceId);
        }
    }

    private view(story: StoryEntity, chat: ChatEntity, advances: SceneAdvanceEntity[]): ChaptersView {
        const ranges = new Map(chapterRanges(chat.messages, advances).map((range) => [range.advanceId, range]));
        const busy = this.chains.has(chat.id);
        const chapters = advances.flatMap((advance): ChapterView[] => {
            const range = ranges.get(advance.id);
            if (!range) return [];
            const status: ChapterStatus =
                advance.chapterSummary !== null
                    ? 'written'
                    : range.from > range.through
                      ? 'empty'
                      : this.writing.has(advance.id)
                        ? 'writing'
                        : advance.chapterFailed !== null
                          ? 'failed'
                          : busy
                            ? 'writing'
                            : 'waiting';
            return [
                {
                    id: advance.id,
                    number: 0,
                    sceneName: advance.fromSceneName,
                    toSceneName: advance.toSceneName,
                    movedBy: advance.movedBy,
                    event: advance.event,
                    messageId: advance.messageId,
                    endedAt: advance.createdAt.toISOString(),
                    summary: advance.chapterSummary,
                    writtenBy: advance.chapterBy,
                    status,
                    failedReason: status === 'failed' ? advance.chapterFailed : null,
                },
            ];
        });
        chapters.forEach((chapter, index) => (chapter.number = index + 1));
        const scene = story.scenes.find((candidate) => candidate.id === chat.currentSceneId) ?? null;
        return { current: { number: chapters.length + 1, scene: scene ? { id: scene.id, name: scene.name } : null }, chapters };
    }

    private async load(storyId: number, chatId: number): Promise<{ story: StoryEntity; chat: ChatEntity }> {
        const story = await this.storyModel.findFull(storyId);
        if (!story) throw new StoryNotFoundError();
        const chat = await this.chatModel.findWithMessages(chatId);
        if (!chat || chat.storyId !== storyId) throw new ChatNotFoundError();
        return { story, chat };
    }
}
