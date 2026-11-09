import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { UnsupportedImageError } from '../../errors/image.errors.js';
import { OutOfCreditError } from '../../errors/model-gateway.errors.js';
import { CharacterNotFoundError, ExpressionNotFoundError, NoReferenceImageToDrawError } from '../../errors/story.errors.js';
import { ExpressionEmotion } from '../../model/story/emotion.js';
import { CharacterResponse, PortraitCrop } from '../../model/story/entities/character.entity.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { ModelGateway } from '../../service/model-gateway/model-gateway.js';
import { ImageStoreService } from '../../store/image/image-store.service.js';
import { StoryDetail, StoryManagerService } from '../story/story.service.js';
import { expressionPrompt } from './prompt.js';

/** Where an Expression's file goes: a fresh token per write, so a browser never shows a replaced picture from its cache. */
export function expressionImagePath(storyId: number, characterId: number, emotion: ExpressionEmotion, extension: string): string {
    return `expressions/story-${storyId}/character-${characterId}-${emotion}-${randomBytes(6).toString('hex')}.${extension}`;
}

/**
 * A Character's Expressions (.scratch/expressions/spec.md, "Authoring API"): draw one from the
 * Reference image, upload one, set or reset its square, remove it. Every write answers the whole Story. Removing a Character or a
 * Story, and Duplicate, handle their files in the Story authoring module.
 */
@Injectable()
export class ExpressionManagerService {
    private readonly logger = new Logger(ExpressionManagerService.name);

    constructor(
        private readonly storyManager: StoryManagerService,
        private readonly storyModel: StoryModelService,
        private readonly imageStore: ImageStoreService,
        private readonly gateway: ModelGateway,
    ) {}

    /**
     * Draws the emotion's Expression from the Character's Reference image: one `expression_image`
     * call, no text call. It replaces any there, keeping its square, and remembers the Reference
     * image it was drawn from, so it reads as outdated once that changes. Refused before any call
     * without a Reference image, or with the Venice pool known to be used up.
     */
    async draw(storyId: number, characterId: number, emotion: ExpressionEmotion): Promise<StoryDetail> {
        const character = await this.findCharacter(storyId, characterId);
        const drawnFrom = character.referenceImagePath;
        if (!drawnFrom) throw new NoReferenceImageToDrawError();
        if (await this.imageCreditOut()) throw new OutOfCreditError('image');
        const reference = await this.imageStore.read(drawnFrom);
        const result = await this.gateway.generateImage({
            kind: 'expression_image',
            prompt: expressionPrompt(character, emotion),
            referenceImages: [reference],
            servedFor: { storyId },
        });
        const extension = ImageStoreService.extensionFor(result.image.mimeType) ?? 'jpg';
        return this.store(storyId, characterId, emotion, result.image.bytes, extension, { crop: 'keep', drawnFrom });
    }

    /**
     * Stores an uploaded picture as the emotion's Expression, replacing any there, with the
     * Portrait's square and no Reference image it was drawn from. The type is read from the bytes.
     */
    async upload(storyId: number, characterId: number, emotion: ExpressionEmotion, bytes: Buffer): Promise<StoryDetail> {
        await this.findCharacter(storyId, characterId);
        const mimeType = ImageStoreService.sniffMimeType(bytes);
        if (!mimeType) throw new UnsupportedImageError();
        return this.store(storyId, characterId, emotion, bytes, ImageStoreService.extensionFor(mimeType)!, { crop: null, drawnFrom: null });
    }

    async setCrop(storyId: number, characterId: number, emotion: ExpressionEmotion, crop: PortraitCrop | null): Promise<StoryDetail> {
        await this.findCharacter(storyId, characterId);
        const square = crop ? { x: crop.x, y: crop.y, size: crop.size } : null;
        if (!(await this.storyModel.setExpressionCrop(characterId, emotion, square))) throw new ExpressionNotFoundError();
        return this.saved(storyId);
    }

    /** Deletes the Expression and its file; its emotion shows the Portrait again. */
    async remove(storyId: number, characterId: number, emotion: ExpressionEmotion): Promise<StoryDetail> {
        await this.findCharacter(storyId, characterId);
        const imagePath = await this.storyModel.removeExpression(characterId, emotion);
        if (imagePath === null) throw new ExpressionNotFoundError();
        await this.removeFile(imagePath);
        return this.saved(storyId);
    }

    /**
     * Writes the file, then inserts or replaces the row, then deletes the replaced file. A failure
     * before the row is saved deletes the new file and leaves the old Expression as it was.
     */
    protected async store(
        storyId: number,
        characterId: number,
        emotion: ExpressionEmotion,
        bytes: Buffer,
        extension: string,
        fields: { crop: PortraitCrop | null | 'keep'; drawnFrom: string | null },
    ): Promise<StoryDetail> {
        const imagePath = expressionImagePath(storyId, characterId, emotion, extension);
        await this.imageStore.write(imagePath, bytes);
        let previous;
        try {
            previous = await this.storyModel.putExpression({ characterId, emotion, imagePath, ...fields });
        } catch (error) {
            await this.removeFile(imagePath);
            throw error;
        }
        if (previous && previous.imagePath !== imagePath) await this.removeFile(previous.imagePath);
        return this.saved(storyId);
    }

    private async imageCreditOut(): Promise<boolean> {
        const remaining = (await this.gateway.remainingCredit()).image.remainingUsd;
        return remaining !== null && remaining <= 0;
    }

    protected async findCharacter(storyId: number, characterId: number): Promise<CharacterResponse> {
        const story = await this.storyManager.getStory(storyId);
        const character = story.characters.find((other) => other.id === characterId);
        if (!character) throw new CharacterNotFoundError();
        return character;
    }

    private async saved(storyId: number): Promise<StoryDetail> {
        await this.storyModel.touch(storyId);
        return this.storyManager.getStory(storyId);
    }

    /** The record is already gone or updated, so a file that can't be deleted is logged, not an error. */
    private async removeFile(relativePath: string): Promise<void> {
        try {
            await this.imageStore.remove(relativePath);
        } catch (error) {
            this.logger.warn(`Could not delete ${relativePath}: ${error instanceof Error ? error.message : error}`);
        }
    }
}
