import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { AppConfig } from '../../config/app-config.js';
import { AppError } from '../../errors/app-error.js';
import { ChatNotFoundError, MessageNotFoundError } from '../../errors/chat.errors.js';
import {
    SnapshotJobNotFailedError,
    SnapshotJobNotFoundError,
    SnapshotNotFoundError,
    SnapshotPromptNotFoundError,
} from '../../errors/image.errors.js';
import { OutOfCreditError } from '../../errors/model-gateway.errors.js';
import { StoryNotFoundError } from '../../errors/story.errors.js';
import { ChatModelService } from '../../model/chat/chat.service.js';
import { ChatEntity } from '../../model/chat/entities/chat.entity.js';
import { MessageEntity, MessageKind } from '../../model/chat/entities/message.entity.js';
import { BeliefModelService } from '../../model/memory/belief.service.js';
import { MemoryModelService } from '../../model/memory/memory.service.js';
import { SnapshotEntity, SnapshotResponse } from '../../model/snapshot/entities/snapshot.entity.js';
import { SnapshotModelService } from '../../model/snapshot/snapshot.service.js';
import { CharacterEntity } from '../../model/story/entities/character.entity.js';
import { StoryEntity } from '../../model/story/entities/story.entity.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { ImageData, ModelGateway } from '../../service/model-gateway/model-gateway.js';
import { ImageStoreService, StoredImage } from '../../store/image/image-store.service.js';
import { wornIdentity } from '../chat/identity.js';
import { chosenLore, promptLore, selectLoreAt } from '../chat/lore/lore-select.js';
import { renderUser } from '../chat/memory/render-user.js';
import { chooseForChat, presentForMemory } from '../chat/memory/chat-memory-choice.js';
import { choiceBeliefs } from '../chat/memory/beliefs.js';
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

/** A Character the Snapshot prompt has in frame. */
export interface SnapshotPromptCharacter {
    characterId: number;
    name: string;
}

/**
 * A written Snapshot prompt, for the user to read and edit before it is drawn
 * (.scratch/snapshot-prompt-review/spec.md).
 */
export interface SnapshotPrompt {
    id: string;
    chatId: number;
    /** The AI Message it shows. */
    messageId: number;
    hint: string;
    /** What the writer wrote: the part the user may edit. */
    text: string;
    /** In frame order, at most 3. */
    inFrame: SnapshotPromptCharacter[];
    /** The whole prompt the image model would be given: `text` with the fixed rules around it. */
    imagePrompt: string;
}

/** What a draw needs besides the text, fixed when the Snapshot prompt is written so every retry sends the same. */
interface DrawPlan {
    text: string;
    inFrameIds: number[];
    /** The writer's art style labels (see `drawingStyle`). */
    pieceLabels: Record<string, string> | null;
    /** The Message's text when the prompt was written: a different one by the time it is stored took the moment away. */
    moment: string;
}

interface HeldPrompt extends SnapshotPrompt {
    plan: Omit<DrawPlan, 'text'>;
    writtenAt: number;
}

interface HeldJob extends SnapshotJob {
    plan: DrawPlan;
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
/** A Snapshot prompt not drawn is thrown away after this long (the sheet throws it away on closing anyway). */
const HELD_PROMPT_TTL_MS = 60 * 60_000;

/**
 * Snapshots and the Gallery (spec: "Snapshot flow", .scratch/snapshot-prompt-review/spec.md).
 * Writing the Snapshot prompt answers once it is written, and is held for the user to read; no
 * image is drawn until Draw. Draw starts a transient job and answers at once, so play continues
 * while the image is made; the client polls the Chat's Snapshots. Only a successful image becomes
 * a Snapshot record: a failure leaves the job with its typed error for Retry, and nothing is
 * stored. Snapshots never reach the text model and never touch the ledger.
 */
@Injectable()
export class SnapshotManagerService {
    private readonly logger = new Logger(SnapshotManagerService.name);
    private readonly jobs = new Map<string, HeldJob>();
    /** At most one written Snapshot prompt per Chat, keyed by the Chat's id. */
    private readonly prompts = new Map<number, HeldPrompt>();

    constructor(
        private readonly storyModel: StoryModelService,
        private readonly chatModel: ChatModelService,
        private readonly memoryModel: MemoryModelService,
        private readonly beliefModel: BeliefModelService,
        private readonly snapshotModel: SnapshotModelService,
        private readonly imageStore: ImageStoreService,
        private readonly gateway: ModelGateway,
        private readonly config: AppConfig,
    ) {}

    /**
     * Writes the Snapshot prompt of the Chat's latest AI Message, with an optional hint, and holds
     * it for the user to read; it replaces one the Chat held. `messageId` names another AI Message
     * of the Chat, for a retake of an earlier moment. No image is drawn.
     */
    async writePrompt(storyId: number, chatId: number, hint: string, messageId?: number): Promise<SnapshotPrompt> {
        const { story, chat } = await this.load(storyId, chatId);
        const message = messageId === undefined ? latestAiMessage(chat) : chat.messages.find((m) => m.id === messageId);
        if (!message || message.kind !== MessageKind.Ai) throw new MessageNotFoundError();
        // No writer call for a picture that can't be drawn.
        await this.requireImageCredit();

        const trimmed = hint.trim();
        const scene = await this.writeScene(story, chat, message.id, trimmed);
        const inFrame: SnapshotPromptCharacter[] = scene.inFrame.map((character) => ({ characterId: character.id, name: character.name }));
        const held: HeldPrompt = {
            id: randomBytes(8).toString('hex'),
            chatId: chat.id,
            messageId: message.id,
            hint: trimmed,
            text: scene.text,
            inFrame,
            imagePrompt: this.imagePrompt(story, chat, scene.text, scene.inFrame, scene.pieceLabels, trimmed, (character) => character.referenceImagePath !== null),
            plan: { inFrameIds: inFrame.map((character) => character.characterId), pieceLabels: scene.pieceLabels, moment: momentText(message) },
            writtenAt: Date.now(),
        };
        this.sweep();
        this.prompts.set(chat.id, held);
        return publicPrompt(held);
    }

    /**
     * Draw Snapshot: draws the Chat's held Snapshot prompt with `text`, the user's edit or the
     * writer's own, and uses it up. The writer is not called again, by this or by any retry.
     */
    async draw(storyId: number, chatId: number, promptId: string, text: string): Promise<SnapshotJob> {
        const { chat } = await this.load(storyId, chatId);
        const held = this.prompts.get(chat.id);
        if (!held || held.id !== promptId || Date.now() - held.writtenAt > HELD_PROMPT_TTL_MS) throw new SnapshotPromptNotFoundError();
        if (!chat.messages.some((message) => message.id === held.messageId)) {
            this.prompts.delete(chat.id);
            throw new MessageNotFoundError();
        }
        await this.requireImageCredit();
        this.prompts.delete(chat.id);

        const job: HeldJob = {
            id: randomBytes(8).toString('hex'),
            chatId: chat.id,
            messageId: held.messageId,
            hint: held.hint,
            status: 'pending',
            error: null,
            startedAt: new Date().toISOString(),
            plan: { ...held.plan, text: text.trim() },
        };
        this.sweep();
        this.jobs.set(job.id, job);
        void this.run(storyId, job, true);
        return publicJob(job);
    }

    /** Runs a failed job again, with the same Message, hint and Snapshot prompt: once, with no automatic retry. */
    async retry(storyId: number, chatId: number, jobId: string): Promise<SnapshotJob> {
        await this.load(storyId, chatId);
        const job = this.findJob(chatId, jobId);
        if (job.status !== 'failed') throw new SnapshotJobNotFailedError();
        await this.requireImageCredit();
        job.status = 'pending';
        job.error = null;
        job.startedAt = new Date().toISOString();
        void this.run(storyId, job, false);
        return publicJob(job);
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
        // Read the jobs before the Snapshots. A job is removed only after its Snapshot is stored, so this order
        // never misses both. The other order can: the job finishes during the query and the poll sees neither.
        const jobs = [...this.jobs.values()].filter((job) => job.chatId === chat.id).map(publicJob);
        const snapshots = await this.snapshotModel.findLinkedByChat(
            chat.id,
            chat.messages.map((message) => message.id),
        );
        return { snapshots: snapshots.map((snapshot) => snapshot.toResponse()), jobs };
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

    /**
     * Makes the job's Snapshot. With `autoRetry` (a camera press), a failure is tried once more
     * after `backgroundRetryMs`, the job pending meanwhile; only then is it marked failed
     * (.scratch/background-retry/spec.md).
     */
    private async run(storyId: number, job: HeldJob, autoRetry: boolean): Promise<void> {
        try {
            try {
                await this.make(storyId, job);
            } catch (first) {
                // Out of credit would only fail the same way again.
                if (!autoRetry || first instanceof OutOfCreditError) throw first;
                this.logger.log(`Chat ${job.chatId}: Snapshot failed, trying once more: ${first instanceof Error ? first.message : first}`);
                await new Promise((resolve) => setTimeout(resolve, this.config.backgroundRetryMs));
                await this.make(storyId, job);
            }
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

    /** Draws the job's approved Snapshot prompt and stores the Snapshot (.scratch/snapshot-prompt-review/spec.md, steps 4–5). */
    private async make(storyId: number, job: HeldJob): Promise<void> {
        const { story, chat } = await this.load(storyId, job.chatId);
        // A Character removed from the cast since the prompt was written is no longer drawn.
        const inFrame = job.plan.inFrameIds.flatMap((id) => story.characters.filter((character) => character.id === id));

        const references: ImageData[] = [];
        const readable = new Set<number>();
        for (const character of inFrame) {
            const reference = await this.referenceImage(character);
            if (!reference) continue;
            references.push(reference);
            readable.add(character.id);
        }
        const prompt = this.imagePrompt(story, chat, job.plan.text, inFrame, job.plan.pieceLabels, job.hint, (character) => readable.has(character.id));
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
            // An edit since the prompt was written took this moment away: stored like one cleared after.
            const current = await this.chatModel.findMessage(job.messageId);
            const stillThere = current !== null && current.chatId === chat.id && momentText(current) === job.plan.moment;
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

    /**
     * The image model's prompt for a Snapshot prompt's text. `hasReference` says which in-frame
     * Characters send a Reference image, numbering them in frame order.
     */
    private imagePrompt(
        story: StoryEntity,
        chat: ChatEntity,
        text: string,
        inFrame: CharacterEntity[],
        pieceLabels: Record<string, string> | null,
        hint: string,
        hasReference: (character: CharacterEntity) => boolean,
    ): string {
        let references = 0;
        const drawn: InFrameCharacter[] = inFrame.map((character) => ({
            name: character.name,
            appearance: character.appearance,
            referenceImage: hasReference(character) ? ++references : null,
        }));
        return snapshotImagePrompt({
            identityName: wornIdentity(story, chat).name,
            scene: text,
            imageStyle: story.imageStyle,
            pieceLabels,
            hint,
            inFrame: drawn,
        });
    }

    /** Spec: "Snapshot flow", step 2: the writer call, from the Messages up to the one shown. */
    private async writeScene(
        story: StoryEntity,
        chat: ChatEntity,
        messageId: number,
        hint: string,
    ): Promise<{ text: string; inFrame: CharacterEntity[]; pieceLabels: Record<string, string> | null }> {
        const index = chat.messages.findIndex((message) => message.id === messageId);
        if (index < 0) throw new MessageNotFoundError();
        const identity = wornIdentity(story, chat);
        // The Memories the Memory choice picks at this Message, with the query its turn searched
        // with (.scratch/memory-by-meaning/spec.md: "Every reader uses it"); no search of its own.
        let aiAt = index;
        while (aiAt >= 0 && chat.messages[aiAt].kind !== MessageKind.Ai) aiAt--;
        const beliefs = choiceBeliefs(story, await this.beliefModel.findByChat(chat.id));
        const choice = chooseForChat({
            story,
            memories: await this.memoryModel.findByChat(chat.id),
            beliefs,
            present: presentForMemory(story, chat, index + 1),
            identityName: identity.name,
            query: aiAt >= 0 ? await this.chatModel.contextQueryOf(chat.messages[aiAt].id) : null,
        });
        const memories = choice.memories.map(({ memory }) => renderUser(memory.text, identity.name));
        const hintNames = namesInHint(hint, story.characters);
        // .scratch/speaker-controls/spec.md: someone sitting out is out of the frame, unless the user's hint names them.
        const sittingOut = chat.sittingOutIds();
        const cast = story.characters.filter(
            (character) => !sittingOut.includes(character.id) || hintNames.includes(character.name.trim()),
        );
        const recent = chat.messages
            .slice(Math.max(0, index + 1 - SNAPSHOT_RECENT_MESSAGES), index + 1)
            .map((message) => ({
                speaker: message.kind === MessageKind.User ? (message.identityName ?? identity.name) : 'Story',
                text: momentText(message),
            }));
        // Spec: "Lore": chosen at the point after the Message shown, scanning the hint, then the
        // moment's Messages newest first (.scratch/lore-triggers/spec.md: "The point, and the scan").
        const upToMoment = chat.messages.slice(0, index + 1).map((message) => ({
            role: message.kind === MessageKind.User ? ('user' as const) : ('assistant' as const),
            text: momentText(message),
        }));
        const lore = chosenLore(
            selectLoreAt(promptLore(story), upToMoment, { extraScan: hint, scanLength: SNAPSHOT_RECENT_MESSAGES }),
        );
        const written = await this.gateway.completeText({
            kind: 'snapshot_prompt',
            messages: snapshotPromptMessages({
                identity,
                setting: story.setting,
                imageStyle: story.imageStyle,
                cast,
                memories,
                messages: recent,
                hint: hint,
                hintNames,
                timeOfDay: chat.timeOfDay,
                lore,
            }),
            maxTokens: SNAPSHOT_PROMPT_MAX_TOKENS,
            json: true,
            servedFor: { storyId: story.id, chatId: chat.id },
        });
        const scene = parseSnapshotScene(written.text);
        return { text: scene.scene, inFrame: pickInFrame(cast, scene.inFrame, hintNames), pieceLabels: scene.pieceLabels };
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

    private findJob(chatId: number, jobId: string): HeldJob {
        const job = this.jobs.get(jobId);
        if (!job || job.chatId !== chatId) throw new SnapshotJobNotFoundError();
        return job;
    }

    /** Failed jobs nobody retried or dismissed, and Snapshot prompts nobody drew, go after a while. */
    private sweep(): void {
        const now = Date.now();
        for (const [id, job] of this.jobs) {
            if (job.status === 'failed' && now - Date.parse(job.startedAt) > FAILED_JOB_TTL_MS) this.jobs.delete(id);
        }
        for (const [chatId, held] of this.prompts) {
            if (now - held.writtenAt > HELD_PROMPT_TTL_MS) this.prompts.delete(chatId);
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

/** A job as the API answers it, without what it draws. */
function publicJob({ plan: _plan, ...job }: HeldJob): SnapshotJob {
    return job;
}

/** A held Snapshot prompt as the API answers it. */
function publicPrompt({ plan: _plan, writtenAt: _writtenAt, ...prompt }: HeldPrompt): SnapshotPrompt {
    return { ...prompt, inFrame: prompt.inFrame.map((character) => ({ ...character })) };
}
