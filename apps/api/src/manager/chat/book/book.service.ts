import { Injectable, Logger } from '@nestjs/common';

import {
    BookChapterBusyError,
    BookChapterNotFoundError,
    BookChapterNotWritableError,
    ChatNotFoundError,
    EmptyBookChapterError,
    EmptyBookError,
    NothingToWriteError,
} from '../../../errors/chat.errors.js';
import { StoryNotFoundError } from '../../../errors/story.errors.js';
import { BookModelService } from '../../../model/book/book.service.js';
import { BookChapterAuthor, BookChapterEntity } from '../../../model/book/entities/book-chapter.entity.js';
import { ChatModelService } from '../../../model/chat/chat.service.js';
import { ChatEntity } from '../../../model/chat/entities/chat.entity.js';
import { MessageKind } from '../../../model/chat/entities/message.entity.js';
import { LedgerModelService } from '../../../model/ledger/ledger.service.js';
import { SettingsModelService } from '../../../model/settings/settings.service.js';
import { StoryEntity, Tense } from '../../../model/story/entities/story.entity.js';
import { StoryModelService } from '../../../model/story/story.service.js';
import { ModelGateway, PLAY_MODEL_CATALOGUE, PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { SpendCap } from '../../../service/model-gateway/spend-cap.js';
import { chapterRanges } from '../chapters/chapters.js';
import { wornIdentity } from '../identity.js';
import { transcriptFileNames } from '../transcript.js';
import { ReplyPart } from '../turn/reply-parser.js';
import {
    BOOK_CHAPTER_MAX_TOKENS,
    BookSourceMessage,
    bookChapterMessages,
    bookChapterPriceUsd,
    bookChapterRejection,
    parseBookChapter,
    sourceHash,
    targetWords,
} from './book.js';
import { epub } from './epub.js';

/**
 * Where a Book chapter stands: not written; waiting its turn; being written now; written; the last
 * write failed (any old text stays); or its Chapter has no Messages, so there is nothing to write.
 */
export type BookChapterState = 'unwritten' | 'queued' | 'writing' | 'written' | 'failed' | 'empty';

/** One Book chapter as the Book view reads it (.scratch/chat-novel/spec.md, "API"). */
export interface BookChapterView {
    number: number;
    /** The Chapter's Scene now, or the one stamped when it was written if its Chapter is gone. */
    sceneName: string;
    title: string | null;
    text: string | null;
    writtenBy: BookChapterAuthor | null;
    state: BookChapterState;
    /** Its Chapter's Messages changed since it was written, or its Chapter is gone. */
    outOfDate: boolean;
    /** Its Chapter was taken back: it can be removed, not written. */
    chapterGone: boolean;
    /** The text so far while it is being written. */
    draft: string | null;
    failedReason: string | null;
    /** About what writing it will cost; null when it can't be written. */
    priceUsd: number | null;
    updatedAt: string | null;
}

export interface BookView {
    title: string;
    chatTitle: string;
    identityName: string;
    /** A write is queued or running for this Chat. */
    writing: boolean;
    /** How many chapters Write all would write, and about what it would cost. */
    writeAllCount: number;
    writeAllPriceUsd: number;
    chapters: BookChapterView[];
}

/** One ended Chapter as the Book reads it: its Messages ready for the writer, and their hash. */
interface ChapterSource {
    number: number;
    sceneName: string;
    messages: BookSourceMessage[];
    hash: string;
}

/**
 * Turn a Chat into a novel (.scratch/chat-novel/spec.md). Writes Book chapters on the user's request,
 * streamed, one at a time per Chat and oldest first, on the play model under its own kind. Never runs
 * by itself, and no prompt reads what it writes.
 */
@Injectable()
export class BookManagerService {
    private readonly logger = new Logger(BookManagerService.name);
    /** Each Chat's chain of writes; at most one runs at a time. */
    private readonly chains = new Map<number, Promise<void>>();
    /** The chapters waiting or being written, by Chat. */
    private readonly queued = new Map<number, Set<number>>();
    /** The chapter being written now and its text so far, by Chat. */
    private readonly drafts = new Map<number, { number: number; text: string }>();

    constructor(
        private readonly storyModel: StoryModelService,
        private readonly chatModel: ChatModelService,
        private readonly ledger: LedgerModelService,
        private readonly book: BookModelService,
        private readonly settingsModel: SettingsModelService,
        private readonly gateway: ModelGateway,
        private readonly spendCap: SpendCap,
    ) {}

    /** Resolves once the Chat has no write going or waiting. For tests and shutdown. */
    async idle(chatId: number): Promise<void> {
        while (this.chains.has(chatId)) await this.chains.get(chatId);
    }

    async view(storyId: number, chatId: number): Promise<BookView> {
        const { story, chat } = await this.load(storyId, chatId);
        return this.build(story, chat);
    }

    /** Writes the chapters named, or every one Write all covers. Refused at the Monthly cap before anything is queued. */
    async write(storyId: number, chatId: number, numbers?: number[]): Promise<BookView> {
        const { story, chat } = await this.load(storyId, chatId);
        const sources = await this.sources(story, chat);
        const rows = await this.book.chaptersOf(chatId);
        const queued = this.queued.get(chatId) ?? new Set<number>();
        let due: number[];
        if (numbers && numbers.length > 0) {
            for (const number of numbers) {
                const source = sources.find((candidate) => candidate.number === number);
                if (!source) {
                    if (rows.some((row) => row.number === number)) throw new BookChapterNotWritableError(number);
                    throw new BookChapterNotFoundError();
                }
                if (source.messages.length === 0) throw new BookChapterNotWritableError(number);
            }
            due = [...new Set(numbers)].sort((a, b) => a - b).filter((number) => !queued.has(number));
            if (due.length === 0) return this.build(story, chat);
        } else {
            due = this.writeAllNumbers(sources, rows).filter((number) => !queued.has(number));
            if (due.length === 0) throw new NothingToWriteError();
        }
        await this.spendCap.assertUnderCap();
        this.queued.set(chatId, new Set([...queued, ...due]));
        for (const number of due) this.enqueue(chatId, () => this.writeOne(story.id, chatId, number));
        return this.build(story, chat);
    }

    /** The user's own title and text, kept as written; a write finishing after it does not replace it. */
    async save(storyId: number, chatId: number, number: number, title: string, text: string): Promise<BookView> {
        if (title.trim() === '' || text.trim() === '') throw new EmptyBookChapterError();
        const { story, chat } = await this.load(storyId, chatId);
        if (this.queued.get(chatId)?.has(number)) throw new BookChapterBusyError();
        const source = (await this.sources(story, chat)).find((candidate) => candidate.number === number);
        const row = (await this.book.chaptersOf(chatId)).find((candidate) => candidate.number === number);
        if (!source && !row) throw new BookChapterNotFoundError();
        await this.book.saveUser(chatId, number, title.trim(), text.trim(), source?.sceneName ?? row?.sceneName ?? '', source?.hash ?? null);
        return this.build(story, chat);
    }

    /** Takes a Book chapter's stored text out of the Book; one whose Chapter is gone leaves it altogether. */
    async remove(storyId: number, chatId: number, number: number): Promise<BookView> {
        const { story, chat } = await this.load(storyId, chatId);
        if (this.queued.get(chatId)?.has(number)) throw new BookChapterBusyError();
        if (!(await this.book.remove(chatId, number))) throw new BookChapterNotFoundError();
        return this.build(story, chat);
    }

    /** The whole Book as an EPUB, with every written chapter, and the names a download saves it as. */
    async epub(storyId: number, chatId: number): Promise<{ bytes: Buffer; fileName: string; asciiFileName: string }> {
        const { story, chat } = await this.load(storyId, chatId);
        const view = await this.build(story, chat);
        const written = view.chapters.filter((chapter) => chapter.text !== null);
        if (written.length === 0) throw new EmptyBookError();
        const names = transcriptFileNames(story.title, chat.title, chat.id);
        const bytes = epub({
            id: `storytell-chat-${chat.id}`,
            title: story.title.trim() === '' ? chat.title : story.title,
            subtitle: chat.title,
            chapters: written.map((chapter) => ({ number: chapter.number, title: chapter.title ?? chapter.sceneName, text: chapter.text! })),
            modified: new Date(),
        });
        return { bytes, fileName: names.fileName.replace(/\.txt$/, '.epub'), asciiFileName: names.asciiFileName.replace(/\.txt$/, '.epub') };
    }

    private enqueue(chatId: number, work: () => Promise<void>): void {
        const before = this.chains.get(chatId) ?? Promise.resolve();
        const chain = before.then(work).catch((error: unknown) => {
            this.logger.warn(`Chat ${chatId}: Book chapter not written: ${error instanceof Error ? error.message : String(error)}`);
        });
        this.chains.set(chatId, chain);
        void chain.finally(() => {
            if (this.chains.get(chatId) === chain) this.chains.delete(chatId);
        });
    }

    /** Spec "Write all": not written, or out of date and written by the AI, and never an empty or gone Chapter. Oldest first. */
    private writeAllNumbers(sources: ChapterSource[], rows: BookChapterEntity[]): number[] {
        const byNumber = new Map(rows.map((row) => [row.number, row]));
        return sources
            .filter((source) => {
                if (source.messages.length === 0) return false;
                const row = byNumber.get(source.number);
                if (!row || row.text === null) return true;
                return row.writtenBy === 'ai' && row.sourceHash !== source.hash;
            })
            .map((source) => source.number);
    }

    /** Writes one Book chapter, streamed, or records why it failed. Never rejects. */
    private async writeOne(storyId: number, chatId: number, number: number): Promise<void> {
        let sceneName = '';
        try {
            const story = await this.storyModel.findFull(storyId);
            const chat = await this.chatModel.findWithMessages(chatId);
            if (!story || !chat) return;
            const source = (await this.sources(story, chat)).find((candidate) => candidate.number === number);
            // Taken back meanwhile: nothing to write from.
            if (!source || source.messages.length === 0) return;
            sceneName = source.sceneName;
            const rows = await this.book.chaptersOf(chatId);
            const messages = this.prompt(story, chat, source, rows);
            const startedAt = new Date();
            const draft = { number, text: '' };
            this.drafts.set(chatId, draft);
            const result = await this.gateway.streamText(
                { kind: 'book_chapter', messages, maxTokens: BOOK_CHAPTER_MAX_TOKENS, servedFor: { storyId: story.id, chatId } },
                { onText: (piece) => (draft.text += piece), signal: new AbortController().signal },
            );
            const parsed = parseBookChapter(result.text, source.sceneName);
            const speakers = [
                ...new Set([...source.messages.map((message) => (message.kind === 'user' ? message.name : 'Story')), ...story.characters.map((character) => character.name)]),
            ];
            const rejection = parsed === null ? 'The chapter came back empty.' : bookChapterRejection(parsed.text, result.usage.completionTokens, speakers);
            if (parsed === null || rejection !== null) throw new Error(rejection ?? 'The chapter came back empty.');
            const landed = await this.book.writeAi(chatId, number, { title: parsed.title, text: parsed.text, sourceHash: source.hash, sceneName: source.sceneName }, startedAt);
            this.logger.log(landed ? `Chat ${chatId}: Book chapter ${number} written` : `Chat ${chatId}: Book chapter ${number} finished after the user's own edit; dropped`);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Chat ${chatId}: Book chapter ${number} not written (${reason})`);
            await this.book.fail(chatId, number, reason, sceneName).catch(() => undefined);
        } finally {
            if (this.drafts.get(chatId)?.number === number) this.drafts.delete(chatId);
            const queued = this.queued.get(chatId);
            queued?.delete(number);
            if (queued?.size === 0) this.queued.delete(chatId);
        }
    }

    private prompt(story: StoryEntity, chat: ChatEntity, source: ChapterSource, rows: BookChapterEntity[]): PromptMessage[] {
        const identity = wornIdentity(story, chat);
        return bookChapterMessages({
            storyTitle: story.title,
            setting: story.setting,
            tense: story.tense === Tense.Present ? 'present' : 'past',
            identity: { name: identity.name, description: identity.description },
            cast: story.characters.map((character) => ({ name: character.name, appearance: character.appearance })),
            number: source.number,
            sceneName: source.sceneName,
            messages: source.messages,
            previousText: rows.find((row) => row.number === source.number - 1)?.text ?? null,
        });
    }

    /** Every ended Chapter, numbered as the Chapters sheet numbers them, with its Messages as the writer reads them. */
    private async sources(story: StoryEntity, chat: ChatEntity): Promise<ChapterSource[]> {
        const advances = await this.ledger.sceneAdvancesOf(chat.id);
        const byId = new Map(advances.map((advance) => [advance.id, advance]));
        const identity = wornIdentity(story, chat);
        return chapterRanges(chat.messages, advances).map((range, index) => {
            const sceneName = byId.get(range.advanceId)!.fromSceneName;
            const messages = chat.messages
                .filter((message) => message.position >= range.from && message.position <= range.through)
                .map((message): BookSourceMessage =>
                    message.kind === MessageKind.User
                        ? { kind: 'user', name: message.identityName ?? identity.name, text: message.text ?? '' }
                        : {
                              kind: 'ai',
                              parts: [...(message.parts ?? [])].sort((a, b) => a.position - b.position).map((part) => part.toResponse() as ReplyPart),
                          },
                );
            return { number: index + 1, sceneName, messages, hash: sourceHash(sceneName, messages) };
        });
    }

    private async build(story: StoryEntity, chat: ChatEntity): Promise<BookView> {
        const sources = await this.sources(story, chat);
        const rows = await this.book.chaptersOf(chat.id);
        const settings = await this.settingsModel.get();
        const price = PLAY_MODEL_CATALOGUE[settings.playModel]?.priceUsdPerMillion ?? PLAY_MODEL_CATALOGUE['glm-5.3'].priceUsdPerMillion;
        const queued = this.queued.get(chat.id) ?? new Set<number>();
        const draft = this.drafts.get(chat.id) ?? null;
        const sourceOf = new Map(sources.map((source) => [source.number, source]));
        const rowOf = new Map(rows.map((row) => [row.number, row]));
        const numbers = [...new Set([...sources.map((source) => source.number), ...rows.map((row) => row.number)])].sort((a, b) => a - b);

        const priceOf = (source: ChapterSource) =>
            bookChapterPriceUsd(this.prompt(story, chat, source, rows), targetWords(source.messages), price);

        const chapters = numbers.map((number): BookChapterView => {
            const source = sourceOf.get(number);
            const row = rowOf.get(number);
            const gone = !source;
            const empty = source !== undefined && source.messages.length === 0;
            const text = row?.text ?? null;
            const state: BookChapterState =
                draft?.number === number
                    ? 'writing'
                    : queued.has(number)
                      ? 'queued'
                      : row?.failed
                        ? 'failed'
                        : text !== null
                          ? 'written'
                          : empty
                            ? 'empty'
                            : 'unwritten';
            return {
                number,
                sceneName: source?.sceneName ?? row?.sceneName ?? '',
                title: row?.title ?? null,
                text,
                writtenBy: row && text !== null ? row.writtenBy : null,
                state,
                outOfDate: text !== null && (gone || row!.sourceHash !== source.hash),
                chapterGone: gone,
                draft: draft?.number === number ? draft.text : null,
                failedReason: state === 'failed' ? row!.failed : null,
                priceUsd: source && !empty ? priceOf(source) : null,
                updatedAt: row ? row.updatedAt.toISOString() : null,
            };
        });
        const writeAll = new Set(this.writeAllNumbers(sources, rows).filter((number) => !queued.has(number)));
        const writeAllPriceUsd = chapters.reduce((sum, chapter) => sum + (writeAll.has(chapter.number) ? (chapter.priceUsd ?? 0) : 0), 0);
        return {
            title: story.title,
            chatTitle: chat.title,
            identityName: wornIdentity(story, chat).name,
            writing: this.chains.has(chat.id),
            writeAllCount: writeAll.size,
            writeAllPriceUsd: Math.round(writeAllPriceUsd * 1000) / 1000,
            chapters,
        };
    }

    private async load(storyId: number, chatId: number): Promise<{ story: StoryEntity; chat: ChatEntity }> {
        const story = await this.storyModel.findFull(storyId);
        if (!story) throw new StoryNotFoundError();
        const chat = await this.chatModel.findWithMessages(chatId);
        if (!chat || chat.storyId !== storyId) throw new ChatNotFoundError();
        return { story, chat };
    }
}
