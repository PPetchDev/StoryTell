import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { ChatModelService } from '../../../model/chat/chat.service.js';
import type { ChatEntity, TimeOfDay } from '../../../model/chat/entities/chat.entity.js';
import { MessageKind } from '../../../model/chat/entities/message.entity.js';
import { LedgerModelService } from '../../../model/ledger/ledger.service.js';
import type { OutfitSpriteEntity, StageLight } from '../../../model/stage/stage.entities.js';
import { StageModelService } from '../../../model/stage/stage.service.js';
import type { CharacterEntity } from '../../../model/story/entities/character.entity.js';
import type { StoryEntity } from '../../../model/story/entities/story.entity.js';
import { StoryModelService } from '../../../model/story/story.service.js';
import { isExpressionEmotion } from '../../../model/story/emotion.js';
import { ImageData, ModelGateway } from '../../../service/model-gateway/model-gateway.js';
import { ImageStoreService } from '../../../store/image/image-store.service.js';
import { expressionPrompt } from '../../expression/prompt.js';
import { currentDetails } from '../details/details.js';

/** What one Chat's dressed stage may spend in a day, in USD (.scratch/dressed-stage/spec.md). */
export const STAGE_DAILY_CAP_USD = 1;

/** The light a place is drawn in, from the Chat's time of day: three pictures a place at most. */
export function lightOf(timeOfDay: TimeOfDay | null): StageLight {
    if (timeOfDay === 'evening') return 'evening';
    if (timeOfDay === 'night') return 'night';
    return 'day';
}

/** A place or an outfit as a key: lowercased, its spaces tidied, so the same words find the same picture. */
export function stageKey(text: string): string {
    return text.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** A piece of an outfit the Judge wrote that is not worn: held, carried, a pose or a place. */
const NOT_WORN = /\b(in (?:her |his |their |one |both )?hands?|holding|holds|carrying|carries|clutching|standing|sitting|kneeling|lying|swaying|catching|by the|at the|near the|beside)\b/i;

/**
 * The worn part of an outfit as the Judge wrote it (.scratch/dressed-stage/spec.md, "Fixes after
 * the live test"): its comma-separated pieces without what is held or done ("clay jugs in hand",
 * "tail swaying"). Empty when nothing is worn.
 */
export function wornOnly(outfit: string): string {
    return outfit
        .split(/[,;]/)
        .map((piece) => piece.trim())
        .filter((piece) => piece !== '' && !NOT_WORN.test(piece))
        .join(', ');
}

/** Words that say how a garment is worn just now, not what it is: "ties loose" and "ties done" are one outfit. */
const PASSING = new Set(['a', 'an', 'the', 'and', 'with', 'of', 'at', 'on', 'in', 'to', 'her', 'his', 'their', 'is', 'being', 'now', 'still', 'just', 'half', 'partly', 'slightly', 'loose', 'loosened', 'done', 'undone', 'open', 'opened', 'closed', 'fastened', 'unfastened', 'tied', 'untied', 'tight', 'rumpled', 'messy', 'mussed', 'askew', 'up', 'down']);

function garmentWords(outfit: string): Set<string> {
    return new Set(outfit.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1 && !PASSING.has(word)));
}

/**
 * The outfit key to draw or show for a Character's outfit: an outfit already drawn in the Chat when
 * this one is the same in other words (its garment words two-thirds alike), else its own key. So
 * "ties loose at throat" and "ties done at throat" share one drawing.
 */
export function sameOutfitKey(outfit: string, drawn: readonly string[]): string {
    const words = garmentWords(outfit);
    for (const key of drawn) {
        const other = garmentWords(key);
        const shared = [...words].filter((word) => other.has(word)).length;
        const all = new Set([...words, ...other]).size;
        if (all > 0 && shared / all >= 2 / 3) return key;
    }
    return stageKey(outfit);
}

const LIGHT_WORDS: Record<StageLight, string> = {
    day: 'clear daylight',
    evening: 'warm evening light at dusk, the first lamps glowing',
    night: 'night, a dark sky, lit only by firelight, lamps or moonlight',
};

/** A place with no one in it, for the back of the stage. The Setting gives the world, the place the spot. */
export function placePrompt(setting: string, place: string, light: StageLight): string {
    return [
        `A background painting for a visual novel: ${place.trim()}, in ${LIGHT_WORDS[light]}.`,
        'An empty scene with no people and no characters in it, seen at eye level as if standing there. Detailed, painterly, soft depth. No text, no watermark.',
        `The world of the story: ${setting.trim().slice(0, 600)}`,
    ].join('\n');
}

/** The same place in another light, edited from a picture of it, so it stays the same place. */
export function relightPrompt(light: StageLight): string {
    return (
        'Edit this picture. Keep the same place, layout, objects, camera and art style exactly. ' +
        `Change only the light and the sky, to ${LIGHT_WORDS[light]}. No people, no text, no watermark.`
    );
}

/** A Character in another outfit, edited from their Reference image: the same adult person, pose and framing. */
export function outfitPrompt(character: { name: string; appearance: string }, outfit: string): string {
    const name = character.name.trim();
    const who = name === '' ? 'this adult character' : `${name}, an adult`;
    return [
        `Edit this picture of ${who}. Keep the same person, face, hair, body, every feature of the character, pose, full-body framing and art style. ` +
            `Change only the clothing, to: ${outfit.trim()}. Plain flat background in the same colour. No text, no watermark, no other people.`,
        `Appearance to keep (leave out any clothing it describes): ${character.appearance.trim()}`,
    ].join('\n');
}

/**
 * The dressed stage (.scratch/dressed-stage/spec.md). After each judgement in a Chat whose switch
 * is on, and when the switch is turned on, it draws what the stage now needs, one drawing at a
 * time per Chat, in the background:
 * - the place the Chat is in, in its light: first from words, then each other light edited from it;
 * - each Character's outfit, edited from their Reference image, cut out;
 * - each emotion that Character's lines carried in the newest reply, edited from that outfit, cut out.
 * Each is drawn once and kept: places for the Story, outfits for the Chat. It stops for the day at
 * `STAGE_DAILY_CAP_USD`, and when the Venice pool is out. A failure is tried again half an hour on.
 */
@Injectable()
export class StageManagerService implements OnApplicationBootstrap {
    private readonly logger = new Logger(StageManagerService.name);
    private readonly chains = new Map<number, Promise<void>>();

    constructor(
        private readonly chatModel: ChatModelService,
        private readonly storyModel: StoryModelService,
        private readonly ledger: LedgerModelService,
        private readonly stage: StageModelService,
        private readonly imageStore: ImageStoreService,
        private readonly gateway: ModelGateway,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.stage.failInterrupted();
    }

    /** Queues what the Chat's stage needs now. Never rejects; does nothing with the switch off. */
    dress(storyId: number, chatId: number): void {
        const previous = this.chains.get(chatId) ?? Promise.resolve();
        const next = previous
            .then(() => this.dressNow(storyId, chatId))
            .catch((error) => this.logger.warn(`Chat ${chatId}: the stage was not dressed (${error instanceof Error ? error.message : String(error)})`));
        this.chains.set(chatId, next);
        void next.finally(() => {
            if (this.chains.get(chatId) === next) this.chains.delete(chatId);
        });
    }

    /** Resolves once the Chat's queue is empty (for tests). */
    async idle(chatId: number): Promise<void> {
        while (this.chains.has(chatId)) await this.chains.get(chatId);
    }

    private async dressNow(storyId: number, chatId: number): Promise<void> {
        const [story, chat] = await Promise.all([this.storyModel.findFull(storyId), this.chatModel.findWithMessages(chatId)]);
        if (!story || !chat || !chat.dressStage) return;
        const details = currentDetails(await this.ledger.detailChangesOf(chatId));
        if (details.place && !(await this.drawPlace(story, chat, details.place, lightOf(chat.timeOfDay)))) return;

        // Only who speaks in the newest reply, most lines first: the stage shows a Character only
        // when they speak, so one who stays silent is drawn when they first do.
        const newest = [...chat.messages].reverse().find((message) => message.kind === MessageKind.Ai);
        const lines = new Map<number, number>();
        for (const part of newest?.parts ?? []) if (part.characterId !== null) lines.set(part.characterId, (lines.get(part.characterId) ?? 0) + 1);
        const speakers = details.outfits.filter(({ characterId }) => lines.has(characterId)).sort((a, b) => lines.get(b.characterId)! - lines.get(a.characterId)!);
        for (const { characterId, outfit } of speakers) {
            const character = story.characters.find((one) => one.id === characterId);
            const worn = wornOnly(outfit);
            if (!character?.referenceImagePath || worn === '') continue;
            const key = sameOutfitKey(worn, await this.stage.outfitKeys(chat.id, characterId));
            if (!(await this.drawOutfit(story, chat, character, worn, key))) return;
            const emotions = new Set(
                (newest?.parts ?? [])
                    .filter((part) => part.characterId === characterId && part.emotion && isExpressionEmotion(part.emotion))
                    .map((part) => part.emotion as string),
            );
            for (const emotion of emotions) if (!(await this.drawEmotion(story, chat, character, key, emotion))) return;
        }
    }

    /** False when the switch was turned off meanwhile, the stage may not draw more today, or the Venice pool is out. */
    private async mayDraw(chatId: number): Promise<boolean> {
        if (!(await this.chatModel.findOne(chatId))?.dressStage) return false;
        if ((await this.stage.spentToday(chatId)) >= STAGE_DAILY_CAP_USD) return false;
        const remaining = (await this.gateway.remainingCredit()).image.remainingUsd;
        return remaining === null || remaining > 0;
    }

    /** Draws the place in that light if it is not drawn yet. False when drawing stopped for the day. */
    private async drawPlace(story: StoryEntity, chat: ChatEntity, place: string, light: StageLight): Promise<boolean> {
        const key = stageKey(place);
        if (await this.stage.readyPlace(story.id, key, light)) return true;
        if (!(await this.mayDraw(chat.id))) return false;
        const id = await this.stage.claimPlace(story.id, key, light);
        if (id === null) return true;
        try {
            const drawn = (await this.stage.readyPlaces(story.id, key))[0];
            const result = drawn?.imagePath
                ? await this.gateway.generateImage({
                      kind: 'place_picture',
                      prompt: relightPrompt(light),
                      referenceImages: [await this.imageStore.read(drawn.imagePath)],
                      servedFor: { storyId: story.id, chatId: chat.id },
                  })
                : await this.gateway.generateImage({ kind: 'place_picture', prompt: placePrompt(story.setting, place, light), servedFor: { storyId: story.id, chatId: chat.id } });
            const imagePath = await this.write(`stage/story-${story.id}/place`, result.image);
            await this.stage.finishPlace(id, imagePath);
            this.logger.log(`Story ${story.id}, Chat ${chat.id}: drew the place "${key}" (${light})`);
        } catch (error) {
            await this.stage.failPlace(id);
            this.logger.warn(`Story ${story.id}, Chat ${chat.id}: the place "${key}" (${light}) was not drawn (${error instanceof Error ? error.message : String(error)})`);
        }
        return true;
    }

    /** Draws the Character in the outfit, cut out, if not drawn yet. */
    private async drawOutfit(story: StoryEntity, chat: ChatEntity, character: CharacterEntity, outfit: string, key: string): Promise<boolean> {
        if ((await this.stage.readySprites(chat.id, character.id, key)).some((sprite) => sprite.emotion === 'neutral')) return true;
        if (!(await this.mayDraw(chat.id))) return false;
        const id = await this.stage.claimSprite(chat.id, character.id, key, 'neutral');
        if (id === null) return true;
        await this.drawSprite(story, chat, character, id, key, 'neutral', outfitPrompt(character, outfit), await this.imageStore.read(character.referenceImagePath!));
        return true;
    }

    /** Draws an emotion in the outfit, from its plain drawing, if not drawn yet. */
    private async drawEmotion(story: StoryEntity, chat: ChatEntity, character: CharacterEntity, key: string, emotion: string): Promise<boolean> {
        const sprites = await this.stage.readySprites(chat.id, character.id, key);
        const plain = sprites.find((sprite) => sprite.emotion === 'neutral');
        if (!plain?.sourcePath || sprites.some((sprite) => sprite.emotion === emotion)) return true;
        if (!(await this.mayDraw(chat.id))) return false;
        const id = await this.stage.claimSprite(chat.id, character.id, key, emotion);
        if (id === null || !isExpressionEmotion(emotion)) return true;
        await this.drawSprite(story, chat, character, id, key, emotion, expressionPrompt(character, emotion), await this.imageStore.read(plain.sourcePath));
        return true;
    }

    private async drawSprite(story: StoryEntity, chat: ChatEntity, character: CharacterEntity, id: number, key: string, emotion: string, prompt: string, from: ImageData): Promise<void> {
        const servedFor = { storyId: story.id, chatId: chat.id };
        try {
            const drawn = await this.gateway.generateImage({ kind: 'outfit_sprite', prompt, referenceImages: [from], servedFor });
            const folder = `stage/story-${story.id}/chat-${chat.id}/character-${character.id}-${emotion}`;
            const sourcePath = await this.write(folder, drawn.image);
            let imagePath = sourcePath;
            let cutOut = false;
            try {
                const cut = await this.gateway.generateImage({ kind: 'image_cutout', prompt: '', referenceImages: [drawn.image], servedFor });
                imagePath = await this.write(`${folder}-cutout`, cut.image, 'png');
                cutOut = true;
            } catch (error) {
                this.logger.warn(`Chat ${chat.id}: ${character.name} (${emotion}) was not cut out (${error instanceof Error ? error.message : String(error)})`);
            }
            await this.stage.finishSprite(id, { sourcePath, imagePath, cutOut });
            this.logger.log(`Chat ${chat.id}: drew ${character.name} in "${key}" (${emotion})`);
        } catch (error) {
            await this.stage.failSprite(id);
            this.logger.warn(`Chat ${chat.id}: ${character.name} in "${key}" (${emotion}) was not drawn (${error instanceof Error ? error.message : String(error)})`);
        }
    }

    private async write(prefix: string, image: ImageData, extension?: string): Promise<string> {
        const ext = extension ?? ImageStoreService.extensionFor(image.mimeType) ?? 'jpg';
        const path = `${prefix}-${randomBytes(6).toString('hex')}.${ext}`;
        await this.imageStore.write(path, image.bytes);
        return path;
    }
}

/** The stage a Chat answers (.scratch/dressed-stage/spec.md): the place picture and each Character's outfit sprites. */
export interface ChatStage {
    /** The place the Chat is in, in its light, or in another light until that one is drawn; null for none yet. */
    placePicturePath: string | null;
    /** Per Character in an outfit with a plain drawing: each drawn emotion's picture. */
    outfits: { characterId: number; sprites: { emotion: string; imagePath: string; cutOut: boolean }[] }[];
    /** How many drawings are under way, so the page can look again. */
    drawing: number;
}

/** Reads what the Chat's stage shows now; null with the switch off. */
export async function chatStage(
    stage: StageModelService,
    story: StoryEntity,
    chat: ChatEntity,
    details: { place: string | null; outfits: { characterId: number; outfit: string }[] },
): Promise<ChatStage | null> {
    if (!chat.dressStage) return null;
    let placePicturePath: string | null = null;
    if (details.place) {
        const key = stageKey(details.place);
        placePicturePath = (await stage.readyPlace(story.id, key, lightOf(chat.timeOfDay))) ?? (await stage.readyPlaces(story.id, key))[0]?.imagePath ?? null;
    }
    const outfits: ChatStage['outfits'] = [];
    for (const { characterId, outfit } of details.outfits) {
        const worn = wornOnly(outfit);
        if (worn === '') continue;
        const sprites: OutfitSpriteEntity[] = await stage.readySprites(chat.id, characterId, sameOutfitKey(worn, await stage.outfitKeys(chat.id, characterId)));
        if (!sprites.some((sprite) => sprite.emotion === 'neutral')) continue;
        outfits.push({
            characterId,
            sprites: sprites.filter((sprite) => sprite.imagePath).map((sprite) => ({ emotion: sprite.emotion, imagePath: sprite.imagePath!, cutOut: sprite.cutOut })),
        });
    }
    return { placePicturePath, outfits, drawing: await stage.drawingFor(story.id, chat.id) };
}
