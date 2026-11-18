import { Injectable, Logger } from '@nestjs/common';

import { ChatNotFoundError } from '../../errors/chat.errors.js';
import { UnparseableOutputError } from '../../errors/model-gateway.errors.js';
import { NothingToRecapError } from '../../errors/recap.errors.js';
import { StoryNotFoundError } from '../../errors/story.errors.js';
import { ChatModelService } from '../../model/chat/chat.service.js';
import { ChatEntity } from '../../model/chat/entities/chat.entity.js';
import { MessageEntity, MessageKind } from '../../model/chat/entities/message.entity.js';
import { LedgerModelService } from '../../model/ledger/ledger.service.js';
import { ChatRecapEntity } from '../../model/recap/entities/chat-recap.entity.js';
import { RecapModelService } from '../../model/recap/recap.service.js';
import { StoryEntity } from '../../model/story/entities/story.entity.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { ModelGateway } from '../../service/model-gateway/model-gateway.js';
import { currentDetails } from '../chat/details/details.js';
import { castNowNotes, currentNowNotes } from '../chat/details/now-notes.js';
import { diaryMoment } from '../chat/diary/diary.js';
import { wornIdentity } from '../chat/identity.js';
import { currentBonds } from '../chat/judge/judge.service.js';
import { renderUser } from '../chat/memory/render-user.js';
import { messageText } from '../chat/story-so-far/story-so-far.service.js';
import {
    hasSomethingToRecap,
    parseRecap,
    RECAP_CHAPTERS,
    RECAP_MAX_TOKENS,
    recapDue,
    recapFingerprint,
    recapPromptMessages,
    recapRejection,
} from './recap.js';

/** A rejected answer is asked for once more before the write fails, as a Chapter's is. */
const WRITER_ATTEMPTS = 2;

/** The Recap for the Chat's newest Message, as the card reads it. */
export interface RecapEntryView {
    /** The Message it tells the story up to: the Chat's newest. */
    messageId: number;
    text: string;
    /** The user put it away: it no longer shows by itself. */
    dismissed: boolean;
    writtenAt: string;
}

export interface RecapView {
    /** It should show by itself now: a gap since the newest Message, and not dismissed. */
    due: boolean;
    /** The stored Recap for the newest Message, or null with none. */
    recap: RecapEntryView | null;
}

/**
 * "Previously on…" (.scratch/previously-on/spec.md). Writes a Chat's Recap when the user comes back
 * after a gap or asks for it, keeps it against the newest Message, and drops it once that Message is
 * taken back or changed. One call per Chat at a time. No prompt reads what it writes.
 */
@Injectable()
export class RecapManagerService {
    private readonly logger = new Logger(RecapManagerService.name);
    /** Each Chat's write under way: a second ask meanwhile waits for the same one. */
    private readonly writing = new Map<number, Promise<void>>();

    constructor(
        private readonly storyModel: StoryModelService,
        private readonly chatModel: ChatModelService,
        private readonly ledger: LedgerModelService,
        private readonly recaps: RecapModelService,
        private readonly gateway: ModelGateway,
    ) {}

    /** Whether a Recap is due, and the stored one for the newest Message. No call. */
    async get(storyId: number, chatId: number, now = new Date()): Promise<RecapView> {
        const { chat } = await this.load(storyId, chatId);
        return this.view(chat, await this.current(chat), now);
    }

    /** The stored Recap for the newest Message, or a new one written now. */
    async write(storyId: number, chatId: number, now = new Date()): Promise<RecapView> {
        const { story, chat } = await this.load(storyId, chatId);
        if (!hasSomethingToRecap(chat.messages.length)) throw new NothingToRecapError();
        if (!(await this.current(chat))) {
            let run = this.writing.get(chat.id);
            if (!run) {
                run = this.compose(story, chat).finally(() => this.writing.delete(chat.id));
                this.writing.set(chat.id, run);
            }
            await run;
        }
        return this.get(storyId, chatId, now);
    }

    /** Puts the stored Recap away until the next gap; nothing with none. */
    async dismiss(storyId: number, chatId: number, now = new Date()): Promise<RecapView> {
        const { chat } = await this.load(storyId, chatId);
        const recap = await this.current(chat);
        if (recap && recap.dismissedAt === null) await this.recaps.dismiss(recap.id);
        return this.get(storyId, chatId, now);
    }

    private view(chat: ChatEntity, recap: ChatRecapEntity | null, now: Date): RecapView {
        const newest = chat.messages.at(-1);
        const due =
            newest !== undefined &&
            recapDue({ newestAt: newest.createdAt, messageCount: chat.messages.length, stored: recap ? { dismissed: recap.dismissedAt !== null } : null, now });
        return {
            due,
            recap: recap
                ? { messageId: recap.messageId, text: recap.text, dismissed: recap.dismissedAt !== null, writtenAt: recap.createdAt.toISOString() }
                : null,
        };
    }

    /**
     * The stored Recap when it tells the story up to the Chat's newest Message as that Message reads
     * now, or null. One whose Message was changed in place is stale and deleted; one for an older
     * Message is kept, as it may be current again once the newer Messages are taken back.
     */
    private async current(chat: ChatEntity): Promise<ChatRecapEntity | null> {
        const recap = await this.recaps.findByChat(chat.id);
        if (!recap) return null;
        const message = chat.messages.find((candidate) => candidate.id === recap.messageId);
        if (!message) return null;
        if (recap.fingerprint !== fingerprintOf(message)) {
            await this.recaps.delete(recap.id);
            this.logger.log(`Chat ${chat.id}: Recap dropped, its Message was changed`);
            return null;
        }
        return message === chat.messages.at(-1) ? recap : null;
    }

    /** Writes and stores the Recap of the Chat as it stands. Throws the gateway's typed error, or UnparseableOutputError. */
    private async compose(story: StoryEntity, chat: ChatEntity): Promise<void> {
        const newest = chat.messages.at(-1)!;
        const fingerprint = fingerprintOf(newest);
        const state = await this.ledger.state(chat.id);
        const identity = wornIdentity(story, chat);
        const nameOf = (id: number | null): string | null =>
            id === null ? identity.name : (story.characters.find((character) => character.id === id)?.name ?? null);
        const messages = chat.messages.map((message) => ({
            speaker: message.kind === MessageKind.User ? (message.identityName ?? identity.name) : 'Story',
            text: messageText(message),
        }));
        const request = {
            kind: 'previously_on' as const,
            messages: recapPromptMessages({
                storyTitle: story.title,
                identityName: identity.name,
                identityDescription: identity.description,
                castNames: story.characters.map((character) => character.name),
                storySoFar: chat.storySoFar,
                chapters: state.sceneAdvances
                    .filter((advance) => advance.chapterSummary !== null && advance.chapterSummary.trim() !== '')
                    .slice(-RECAP_CHAPTERS)
                    .map((advance) => ({ sceneName: advance.fromSceneName, summary: advance.chapterSummary! })),
                sceneName: story.scenes.find((scene) => scene.id === chat.currentSceneId)?.name ?? null,
                moment: diaryMoment(chat.timeOfDay, currentDetails(state.detailChanges).place),
                bonds: currentBonds(state.bondChanges).flatMap((bond) => {
                    const fromName = nameOf(bond.fromCharacterId);
                    const towardName = nameOf(bond.toCharacterId);
                    if (fromName === null || towardName === null) return [];
                    return [{ fromName, towardName, label: bond.label, description: renderUser(bond.description, identity.name) }];
                }),
                nowNotes: castNowNotes(currentNowNotes(state.detailChanges), story.characters).map(({ name, note }) => ({ name, note: renderUser(note, identity.name) })),
                messages,
            }),
            maxTokens: RECAP_MAX_TOKENS,
            servedFor: { storyId: story.id, chatId: chat.id },
        };
        // The Messages' tags and the cast's names: an answer opening on either goes on with the story.
        const speakers = [...new Set([...messages.map((message) => message.speaker), ...story.characters.map((character) => character.name)])];
        let text: string;
        for (let attempt = 1; ; attempt++) {
            const result = await this.gateway.completeText(request);
            const parsed = parseRecap(result.text);
            const rejection = parsed === null ? 'The recap writer wrote nothing.' : recapRejection(parsed, result.usage.completionTokens, speakers);
            if (parsed !== null && rejection === null) {
                text = parsed;
                break;
            }
            if (attempt >= WRITER_ATTEMPTS) throw new UnparseableOutputError(rejection ?? 'The recap writer wrote nothing.');
            this.logger.warn(`Chat ${chat.id}: ${rejection} Asking once more.`);
        }
        // Taken back or changed while it was written: it tells a story that is no longer there.
        const now = await this.chatModel.findWithMessages(chat.id);
        const still = now?.messages.find((message) => message.id === newest.id);
        if (!still || fingerprintOf(still) !== fingerprint) {
            this.logger.log(`Chat ${chat.id}: Recap finished after its Message was taken back; dropped`);
            return;
        }
        await this.recaps.save({ chatId: chat.id, messageId: newest.id, fingerprint, text });
        this.logger.log(`Chat ${chat.id}: Recap written`);
    }

    private async load(storyId: number, chatId: number): Promise<{ story: StoryEntity; chat: ChatEntity }> {
        const story = await this.storyModel.findFull(storyId);
        if (!story) throw new StoryNotFoundError();
        const chat = await this.chatModel.findWithMessages(chatId);
        if (!chat || chat.storyId !== storyId) throw new ChatNotFoundError();
        return { story, chat };
    }
}

function fingerprintOf(message: MessageEntity): string {
    return recapFingerprint(message.kind, messageText(message));
}
