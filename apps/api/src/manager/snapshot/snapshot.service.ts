import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { AppError } from '../../errors/app-error.js';
import { ChatNotFoundError, MessageNotFoundError } from '../../errors/chat.errors.js';
import { SnapshotJobNotFailedError, SnapshotJobNotFoundError, SnapshotNotFoundError } from '../../errors/image.errors.js';
import { OutOfCreditError } from '../../errors/model-gateway.errors.js';
import { StoryNotFoundError } from '../../errors/story.errors.js';
import { ChatModelService } from '../../model/chat/chat.service.js';
import { ChatEntity } from '../../model/chat/entities/chat.entity.js';
import { MessageEntity, MessageKind } from '../../model/chat/entities/message.entity.js';
import { MemoryModelService } from '../../model/memory/memory.service.js';
import { SnapshotEntity, SnapshotResponse } from '../../model/snapshot/entities/snapshot.entity.js';
import { SnapshotModelService } from '../../model/snapshot/snapshot.service.js';
import { CharacterEntity } from '../../model/story/entities/character.entity.js';
import { StoryEntity } from '../../model/story/entities/story.entity.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { ImageData, ModelGateway } from '../../service/model-gateway/model-gateway.js';
import { ImageStoreService, StoredImage } from '../../store/image/image-store.service.js';
import { wornIdentity } from '../chat/identity.js';
import { renderUser } from '../chat/memory/render-user.js';
import { partsToText } from '../chat/turn/reply-parser.js';
import {
    InFrameCharacter,
    namesInHint,
    parseSnapshotScene,
    pickInFrame,
    SNAPSHOT_PROMPT_MAX_TOKENS,
    SNAPSHOT_RECENT_MESSAGES,
    snapshotImagePrompt,
    snapshotPromptMessages,
} from './prompt.js';

/** A Snapshot being made, or one that failed and waits for Retry (spec: "Pending and failed Snapshots"). */
export interface SnapshotJob {
    id: string;
    chatId: number;
    /** The AI Message the camera acted on; the placeholder shows under it. */
    messageId: number;
    hint: string;
    status: 'pending' | 'failed';
    /** The typed error of a failed job, as the API would answer it. */
    error: { code: string; message: string } | null;
    startedAt: string;
}

/** What the Chat screen shows under its Messages: the Snapshots still linked, and the jobs. */
export interface ChatSnapshots {
    /** Oldest first. */
    snapshots: SnapshotResponse[];
    jobs: SnapshotJob[];
}

/** A Gallery item: a Snapshot plus the title of its Chat, while that Chat exists. */
export interface GalleryItem extends SnapshotResponse {
    chatTitle: string | null;
}

/** A Snapshot's file, with the name a download saves it as. */
export interface SnapshotFile extends StoredImage {
    fileName: string;
}

/** A failed job is kept this long for its Retry; the user can also dismiss it. */
const FAILED_JOB_TTL_MS = 60 * 60_000;

/**
 * Snapshots and the Gallery (spec: "Snapshot flow"). A press starts a transient job and
 * answers at once, so play continues while the image is made; the client polls the Chat's
 * Snapshots. Only a successful image becomes a Snapshot record: a failure leaves the job
 * with its typed error for Retry, and nothing is stored. Snapshots never reach the text
 * model and never touch the ledger.
 */
@Injectable()
export class SnapshotManagerService {
    private readonly logger = new Logger(SnapshotManagerService.name);
    private readonly jobs = new Map<string, SnapshotJob>();

    constructor(
        private readonly storyModel: StoryModelService,
        private readonly chatModel: ChatModelService,
        private readonly memoryModel: MemoryModelService,
        private readonly snapshotModel: SnapshotModelService,
        private readonly imageStore: ImageStoreService,
        private readonly gateway: ModelGateway,
    ) {}

    /**
     * Spec: "Camera press, with an optional hint, on the latest AI Message". `messageId` names
     * another AI Message of the Chat, for a retake of an earlier moment; the camera sends none.
     */
    async take(storyId: number, chatId: number, hint: string, messageId?: number): Promise<SnapshotJob> {
        const { chat } = await this.load(storyId, chatId);
        const message = messageId === undefined ? latestAiMessage(chat) : chat.messages.find((m) => m.id === messageId);
        if (!message || message.kind !== MessageKind.Ai) throw new MessageNotFoundError();
        await this.requireImageCredit();

        const job: SnapshotJob = {
            id: randomBytes(8).toString('hex'),
            chatId,
            messageId: message.id,
            hint: hint.trim(),
            status: 'pending',
            error: null,
            startedAt: new Date().toISOString(),
        };
        this.sweep();
        this.jobs.set(job.id, job);
        void this.run(storyId, job);
        return { ...job };
    }

    /** Runs a failed job again, with the same Message and hint. */
    async retry(storyId: number, chatId: number, jobId: string): Promise<SnapshotJob> {
        await this.load(storyId, chatId);
        const job = this.findJob(chatId, jobId);
        if (job.status !== 'failed') throw new SnapshotJobNotFailedError();
        await this.requireImageCredit();
        job.status = 'pending';
        job.error = null;
        job.startedAt = new Date().toISOString();
        void this.run(storyId, job);
        return { ...job };
    }

    /** Drops a failed job's error from the Chat. */
    async dismiss(storyId: number, chatId: number, jobId: string): Promise<void> {
        await this.load(storyId, chatId);
        const job = this.findJob(chatId, jobId);
        if (job.status !== 'failed') throw new SnapshotJobNotFailedError();
        this.jobs.delete(job.id);
    }

    /** Spec: "Snapshots inline under their Message"; the ones whose Message is gone live only in the Gallery. */
    async forChat(storyId: number, chatId: number): Promise<ChatSnapshots> {
        const { chat } = await this.load(storyId, chatId);
        const snapshots = await this.snapshotModel.findLinkedByChat(
            chat.id,
            chat.messages.map((message) => message.id),
        );
        return {
            snapshots: snapshots.map((snapshot) => snapshot.toResponse()),
            jobs: [...this.jobs.values()].filter((job) => job.chatId === chat.id).map((job) => ({ ...job })),
        };
    }

    /** Spec: "Gallery: per Story, newest first, filterable by Chat". */
    async gallery(storyId: number, chatId?: number): Promise<GalleryItem[]> {
        await this.loadStory(storyId);
        const [snapshots, chats] = await Promise.all([
            this.snapshotModel.findByStory(storyId, chatId),
            this.chatModel.findByStory(storyId),
        ]);
        const titles = new Map(chats.map((chat) => [chat.id, chat.title]));
        return snapshots.map((snapshot) => ({
            ...snapshot.toResponse(),
            chatTitle: snapshot.chatId === null ? null : (titles.get(snapshot.chatId) ?? null),
        }));
    }

    async get(storyId: number, snapshotId: number): Promise<SnapshotResponse> {
        return (await this.find(storyId, snapshotId)).toResponse();
    }

    async file(storyId: number, snapshotId: number): Promise<SnapshotFile> {
        const snapshot = await this.find(storyId, snapshotId);
        const image = await this.imageStore.open(snapshot.imagePath);
        const extension = snapshot.imagePath.slice(snapshot.imagePath.lastIndexOf('.'));
        return { ...image, fileName: `snapshot-${snapshot.id}${extension}` };
    }

    /** Spec: "delete (removes the record and its file)", from both the timeline and the Gallery. */
    async remove(storyId: number, snapshotId: number): Promise<void> {
        const snapshot = await this.find(storyId, snapshotId);
        await this.snapshotModel.remove(snapshot.id);
        await this.removeFile(snapshot.imagePath);
    }

    private async run(storyId: number, job: SnapshotJob): Promise<void> {
        try {
            await this.make(storyId, job);
            this.jobs.delete(job.id);
        } catch (error) {
            job.status = 'failed';
            job.error =
                error instanceof AppError
                    ? { code: error.code, message: error.message }
                    : { code: '500.000.000', message: 'The Snapshot could not be made.' };
            this.logger.warn(`Chat ${job.chatId}: Snapshot failed: ${error instanceof Error ? error.message : error}`);
        }
    }

    /** Spec: "Snapshot flow", steps 2–4. */
    private async make(storyId: number, job: SnapshotJob): Promise<void> {
        const { story, chat } = await this.load(storyId, job.chatId);
        const index = chat.messages.findIndex((message) => message.id === job.messageId);
        if (index < 0) throw new MessageNotFoundError();
        const moment = momentText(chat.messages[index]);

        const identity = wornIdentity(story, chat);
        const memories = (await this.memoryModel.findByChat(chat.id))
            .filter((memory) => !memory.archived)
            .map((memory) => renderUser(memory.text, identity.name));
        const hintNames = namesInHint(job.hint, story.characters);
        const written = await this.gateway.completeText({
            kind: 'snapshot_prompt',
            messages: snapshotPromptMessages({
                identity,
                setting: story.setting,
                cast: story.characters,
                memories,
                messages: chat.messages
                    .slice(Math.max(0, index + 1 - SNAPSHOT_RECENT_MESSAGES), index + 1)
                    .map((message) => ({
                        speaker: message.kind === MessageKind.User ? (message.identityName ?? identity.name) : 'Story',
                        text: momentText(message),
                    })),
                hint: job.hint,
                hintNames,
            }),
            maxTokens: SNAPSHOT_PROMPT_MAX_TOKENS,
            json: true,
            servedFor: { storyId, chatId: chat.id },
        });
        const scene = parseSnapshotScene(written.text);
        const inFrame = pickInFrame(story.characters, scene.inFrame, hintNames);

        const references: ImageData[] = [];
        const drawn: InFrameCharacter[] = [];
        for (const character of inFrame) {
            const reference = await this.referenceImage(character);
            if (reference) references.push(reference);
            drawn.push({ name: character.name, appearance: character.appearance, referenceImage: reference ? references.length : null });
        }
        const prompt = snapshotImagePrompt({
            identityName: identity.name,
            scene: scene.scene,
            imageStyle: story.imageStyle,
            inFrame: drawn,
        });
        const result = await this.gateway.generateImage({
            kind: 'snapshot_image',
            prompt,
            referenceImages: references,
            servedFor: { storyId, chatId: chat.id },
        });

        const extension = ImageStoreService.extensionFor(result.image.mimeType) ?? 'jpg';
        const imagePath = `snapshots/story-${storyId}/chat-${chat.id}-${randomBytes(6).toString('hex')}.${extension}`;
        await this.imageStore.write(imagePath, result.image.bytes);
        try {
            // An edit while the image was made took this moment away: stored like one cleared after.
            const current = await this.chatModel.findMessage(job.messageId);
            const stillThere = current !== null && current.chatId === chat.id && momentText(current) === moment;
            const stored = await this.snapshotModel.create({
                storyId,
                chatId: chat.id,
                messageId: stillThere ? job.messageId : null,
                imagePath,
                prompt,
                hint: job.hint,
                imageModel: result.model,
                costUsd: result.costUsd,
                characters: inFrame.map((character) => ({ characterId: character.id, name: character.name })),
            });
            if (!stored) await this.removeFile(imagePath); // the Story was deleted meanwhile
        } catch (error) {
            await this.removeFile(imagePath);
            throw error;
        }
    }

    /** A Character's Reference image; a file gone missing draws the Character from text alone. */
    private async referenceImage(character: CharacterEntity): Promise<ImageData | null> {
        if (!character.referenceImagePath) return null;
        try {
            return await this.imageStore.read(character.referenceImagePath);
        } catch (error) {
            this.logger.warn(`Reference image of ${character.name} unreadable; drawn from text alone: ${error instanceof Error ? error.message : error}`);
            return null;
        }
    }

    /** Spec: "Out of image credit blocks only the camera and Reference image generation." */
    private async requireImageCredit(): Promise<void> {
        const remaining = (await this.gateway.remainingCredit()).image.remainingUsd;
        if (remaining !== null && remaining <= 0) throw new OutOfCreditError('image');
    }

    private findJob(chatId: number, jobId: string): SnapshotJob {
        const job = this.jobs.get(jobId);
        if (!job || job.chatId !== chatId) throw new SnapshotJobNotFoundError();
        return job;
    }

    /** Failed jobs nobody retried or dismissed go after a while. */
    private sweep(): void {
        const now = Date.now();
        for (const [id, job] of this.jobs) {
            if (job.status === 'failed' && now - Date.parse(job.startedAt) > FAILED_JOB_TTL_MS) this.jobs.delete(id);
        }
    }

    private async find(storyId: number, snapshotId: number): Promise<SnapshotEntity> {
        await this.loadStory(storyId);
        const snapshot = await this.snapshotModel.findOne(storyId, snapshotId);
        if (!snapshot) throw new SnapshotNotFoundError();
        return snapshot;
    }

    /** The record is already gone, so a file that can't be deleted is logged, not an error. */
    private async removeFile(relativePath: string): Promise<void> {
        try {
            await this.imageStore.remove(relativePath);
        } catch (error) {
            this.logger.warn(`Could not delete ${relativePath}: ${error instanceof Error ? error.message : error}`);
        }
    }

    private async loadStory(storyId: number): Promise<StoryEntity> {
        const story = await this.storyModel.findFull(storyId);
        if (!story) throw new StoryNotFoundError();
        return story;
    }

    private async load(storyId: number, chatId: number): Promise<{ story: StoryEntity; chat: ChatEntity }> {
        const story = await this.loadStory(storyId);
        const chat = await this.chatModel.findWithMessages(chatId);
        if (!chat || chat.storyId !== storyId) throw new ChatNotFoundError();
        return { story, chat };
    }
}

function latestAiMessage(chat: ChatEntity): MessageEntity | undefined {
    return [...chat.messages].reverse().find((message) => message.kind === MessageKind.Ai);
}

/** A Message as text: what the user wrote, or an AI Message's parts as `@Name:` lines. */
function momentText(message: MessageEntity): string {
    return message.kind === MessageKind.User
        ? (message.text ?? '')
        : partsToText(
              [...(message.parts ?? [])].sort((a, b) => a.position - b.position).map((part) => part.toResponse()),
          );
}
