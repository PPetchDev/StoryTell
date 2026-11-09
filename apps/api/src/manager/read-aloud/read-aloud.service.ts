import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { ChatNotFoundError, MessageNotFoundError, NotReadableError, SpeechItemNotFoundError } from '../../errors/chat.errors.js';
import { OutOfCreditError } from '../../errors/model-gateway.errors.js';
import { StoryNotFoundError } from '../../errors/story.errors.js';
import { ChatModelService } from '../../model/chat/chat.service.js';
import type { MessagePartResponse } from '../../model/chat/entities/message-part.entity.js';
import { MessageKind } from '../../model/chat/entities/message.entity.js';
import { ReplaceRuleModelService } from '../../model/replace-rule/replace-rule.service.js';
import type { StoryEntity } from '../../model/story/entities/story.entity.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { DEFAULT_NARRATION_VOICE, ModelGateway, SPEECH_MODEL } from '../../service/model-gateway/model-gateway.js';
import { venicePoolUsedUp } from '../../service/model-gateway/venice-pool.js';
import { SpeechStoreService } from '../../store/speech/speech-store.service.js';
import { applyReplaceRules } from '../replace-rule/apply-replace-rules.js';
import { ReadAloudItem, readAloudQueue, ReadAloudVoices } from './read-aloud-queue.js';

/** Every item is read at normal speed; the speed is part of the cache key all the same. */
const SPEED = 1;
const MESSAGES = 'messages';

/** A queue item as the Chat screen gets it: no text, its length, and whether its audio is on disk. */
export interface SpeechQueueItem {
    index: number;
    partIndex: number;
    paragraph: number | null;
    voice: string;
    characters: number;
    cached: boolean;
}

interface KeyedItem extends ReadAloudItem {
    key: string;
}

/**
 * Read aloud (.scratch/read-aloud/spec.md, "The play queue" and "Audio cache"). A Message's queue
 * is built from its shown version's parts with the Chat's On AI Messages Replace rules applied,
 * and the Story's voices, as they all stand when asked. Each item's audio is kept on disk under
 * `messages/<messageId>/<key>.mp3`, the key hashing model, voice, speed and shown text, so a
 * changed voice, edit or rule simply asks for a new file. Neither read takes the turn lock.
 */
@Injectable()
export class ReadAloudManagerService implements OnApplicationBootstrap {
    private readonly logger = new Logger(ReadAloudManagerService.name);

    constructor(
        private readonly storyModel: StoryModelService,
        private readonly chatModel: ChatModelService,
        private readonly replaceRuleModel: ReplaceRuleModelService,
        private readonly gateway: ModelGateway,
        private readonly speechStore: SpeechStoreService,
    ) {}

    /** Once at start: catches a crash between a delete and its sweep. */
    async onApplicationBootstrap(): Promise<void> {
        await this.sweep();
    }

    /** The Message's queue, each item marked cached when its audio is on disk. Makes no call. */
    async queue(storyId: number, chatId: number, messageId: number): Promise<SpeechQueueItem[]> {
        const { shown, folder } = await this.reading(storyId, chatId, messageId);
        const kept = new Set(await this.speechStore.files(folder));
        return shown.map(({ index, partIndex, paragraph, voice, text, key }) => ({
            index,
            partIndex,
            paragraph,
            voice,
            characters: text.length,
            cached: kept.has(`${key}.mp3`),
        }));
    }

    /**
     * One item's audio: from disk when it is there, with no call; otherwise made (kind
     * `read_aloud`) and written to disk before it is answered. A new item while the Venice pool is
     * known to be used up is refused before any call. After a write, files of this Message that no
     * queue of its shown version or Reply versions uses any more are pruned.
     */
    async item(storyId: number, chatId: number, messageId: number, index: number): Promise<Buffer> {
        const { shown, folder } = await this.reading(storyId, chatId, messageId);
        const item = shown[index];
        if (!item) throw new SpeechItemNotFoundError();
        const file = `${folder}/${item.key}.mp3`;
        const kept = await this.speechStore.read(file);
        if (kept) return kept;
        if (await venicePoolUsedUp(this.gateway)) throw new OutOfCreditError('image');

        const { audio } = await this.gateway.synthesizeSpeech({
            kind: 'read_aloud',
            text: item.text,
            voice: item.voice,
            servedFor: { storyId, chatId },
        });
        await this.speechStore.write(file, audio.bytes);
        await this.afterWrite(storyId, chatId, messageId, folder);
        return audio.bytes;
    }

    /**
     * After a write, against the Message as it stands now, not as it stood before the call: an
     * edit or Reset that took the Message away meanwhile (its sweep already ran) takes this folder
     * too, and an Again, voice or rule change meanwhile decides what is pruned.
     */
    private async afterWrite(storyId: number, chatId: number, messageId: number, folder: string): Promise<void> {
        let current: Awaited<ReturnType<ReadAloudManagerService['reading']>>;
        try {
            current = await this.reading(storyId, chatId, messageId);
        } catch {
            if ((await this.chatModel.existingMessageIds([messageId])).has(messageId)) return;
            await this.speechStore.remove(folder).catch((error: Error) => {
                this.logger.warn(`Could not delete the audio of Message ${messageId}: ${error.message}`);
            });
            return;
        }
        await this.prune(folder, new Set([...current.shown, ...current.versions].map((used) => `${used.key}.mp3`)));
    }

    /**
     * Deletes the audio folder of every Message that no longer exists. Runs after an edit that
     * discards Messages, Reset, Delete Chat and Delete Story, and at start. A folder that can't be
     * deleted is logged, never an error to the user.
     */
    async sweep(): Promise<void> {
        try {
            const folders = await this.speechStore.folders(MESSAGES);
            const ids = folders.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
            const existing = await this.chatModel.existingMessageIds(ids);
            for (const folder of folders) {
                if (existing.has(Number(folder))) continue;
                await this.speechStore.remove(`${MESSAGES}/${folder}`).catch((error: Error) => {
                    this.logger.warn(`Could not delete the audio of Message ${folder}: ${error.message}`);
                });
            }
        } catch (error) {
            this.logger.warn(`Could not sweep the speech folder: ${(error as Error).message}`);
        }
    }

    /**
     * A Branch's copy, after its transaction commits: each copied Message's audio folder is
     * copied to its new Message id, so the Branch replays it with no call. A folder that can't be
     * copied is logged, and the Branch still stands: the next reading makes that audio again.
     */
    async copyForBranch(messageIds: ReadonlyMap<number, number>): Promise<void> {
        for (const [from, to] of messageIds) {
            await this.speechStore.copyFolder(`${MESSAGES}/${from}`, `${MESSAGES}/${to}`).catch((error: Error) => {
                this.logger.warn(`Could not copy the audio of Message ${from} to ${to}: ${(error as Error).message}`);
            });
        }
    }

    /** The shown version's keyed queue, every other Reply version's, and the Message's folder. */
    private async reading(storyId: number, chatId: number, messageId: number) {
        const story = await this.storyModel.findFull(storyId);
        if (!story) throw new StoryNotFoundError();
        const chat = await this.chatModel.findOne(chatId);
        if (!chat || chat.storyId !== storyId) throw new ChatNotFoundError();
        const message = await this.chatModel.findMessageWithVersions(chatId, messageId);
        if (!message) throw new MessageNotFoundError();
        if (message.kind !== MessageKind.Ai) throw new NotReadableError();

        const rules = [...(await this.replaceRuleModel.findByScope(null)), ...story.replaceRules].filter((rule) => rule.onAi);
        const voices = storyVoices(story);
        const keyed = (parts: MessagePartResponse[]): KeyedItem[] =>
            readAloudQueue(
                parts.map((part) => ({ ...part, text: applyReplaceRules(part.text, rules) })),
                voices,
            ).map((item) => ({ ...item, key: speechKey(item.voice, item.text) }));

        return {
            shown: keyed(message.parts.map((part) => part.toResponse())),
            versions: (message.versions ?? []).flatMap((version) => keyed(version.parts)),
            folder: `${MESSAGES}/${message.id}`,
        };
    }

    /** Deletes the Message's files that no queue uses; one that can't be deleted waits for the next reading. */
    private async prune(folder: string, used: ReadonlySet<string>): Promise<void> {
        for (const file of await this.speechStore.files(folder)) {
            if (used.has(file) || !file.endsWith('.mp3')) continue;
            await this.speechStore.remove(`${folder}/${file}`).catch((error: Error) => {
                this.logger.warn(`Could not prune ${folder}/${file}: ${error.message}`);
            });
        }
    }
}

/** The Story's voices now: its Narration voice or the default, and each Character's Speaking voice. */
function storyVoices(story: StoryEntity): ReadAloudVoices {
    return {
        narration: story.narrationVoice ?? DEFAULT_NARRATION_VOICE,
        byCharacterId: new Map(story.characters.map((character) => [character.id, character.speakingVoice])),
    };
}

/** The first 32 hex characters of the SHA-256 of `model | voice | speed | text`. */
export function speechKey(voice: string, text: string): string {
    return createHash('sha256').update(`${SPEECH_MODEL}|${voice}|${SPEED}|${text}`).digest('hex').slice(0, 32);
}
