import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { UnsupportedImageError } from '../../errors/image.errors.js';
import { OutOfCreditError } from '../../errors/model-gateway.errors.js';
import { CharacterNotFoundError, ExpressionNotFoundError, NoReferenceImageToDrawError } from '../../errors/story.errors.js';
import { ExpressionEmotion } from '../../model/story/emotion.js';
import { CharacterResponse, PortraitCrop } from '../../model/story/entities/character.entity.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { ImageData, ModelGateway } from '../../service/model-gateway/model-gateway.js';
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
        const imagePath = await this.storeFile(storyId, characterId, emotion, result.image.bytes, extension, { crop: 'keep', drawnFrom });
        // Cut out for the stage (.scratch/stage-pictures/spec.md): the drawn picture, and the Reference
        // image when it has no current cut-out yet. Best effort: the Expression stands either way.
        await this.cutOutExpression(storyId, characterId, emotion, imagePath, result.image);
        if (!character.referenceCutoutPath) await this.cutOutReference(storyId, characterId, drawnFrom, reference);
        return this.saved(storyId);
    }

    /**
     * Cuts out an Expression that is there (an upload, or one whose cut-out failed or is missing):
     * one `image_cutout` call. Refused before the call without the Expression, or with the Venice
     * pool known to be used up; a failed call is the error.
     */
    async cutOut(storyId: number, characterId: number, emotion: ExpressionEmotion): Promise<StoryDetail> {
        const character = await this.findCharacter(storyId, characterId);
        const expression = character.expressions.find((one) => one.emotion === emotion);
        if (!expression) throw new ExpressionNotFoundError();
        if (await this.imageCreditOut()) throw new OutOfCreditError('image');
        const bytes = await this.imageStore.read(expression.imagePath);
        await this.cutOutExpression(storyId, characterId, emotion, expression.imagePath, bytes, true);
        if (character.referenceImagePath && !character.referenceCutoutPath) {
            await this.cutOutReference(storyId, characterId, character.referenceImagePath, await this.imageStore.read(character.referenceImagePath));
        }
        return this.saved(storyId);
    }

    /** Cuts out the picture now at `imagePath` and keeps it as that Expression's cut-out. Swallows a failure unless `rethrow`. */
    private async cutOutExpression(storyId: number, characterId: number, emotion: ExpressionEmotion, imagePath: string, image: ImageData | Buffer, rethrow = false): Promise<void> {
        let cutoutPath: string | null = null;
        try {
            const cut = await this.cutOutImage(storyId, image);
            cutoutPath = expressionImagePath(storyId, characterId, emotion, 'png').replace(/.png$/, '-cutout.png');
            await this.imageStore.write(cutoutPath, cut);
            const previous = await this.storyModel.setExpressionCutout(characterId, emotion, imagePath, cutoutPath);
            // Redrawn or removed meanwhile: this cut-out belongs to no Expression.
            if (previous === false) await this.removeFile(cutoutPath);
            else if (previous) await this.removeFile(previous);
        } catch (error) {
            if (cutoutPath) await this.removeFile(cutoutPath);
            this.logger.warn(`Story ${storyId}, Character ${characterId}: no cut-out for ${emotion} (${error instanceof Error ? error.message : error})`);
            if (rethrow) throw error;
        }
    }

    /** Cuts out the Reference image at `referencePath` and keeps it as the stage's neutral picture. Swallows a failure. */
    private async cutOutReference(storyId: number, characterId: number, referencePath: string, image: ImageData | Buffer): Promise<void> {
        let cutoutPath: string | null = null;
        try {
            const cut = await this.cutOutImage(storyId, image);
            cutoutPath = `reference-images/story-${storyId}/character-${characterId}-cutout-${randomBytes(6).toString('hex')}.png`;
            await this.imageStore.write(cutoutPath, cut);
            const previous = await this.storyModel.putReferenceCutout(characterId, cutoutPath, referencePath);
            if (previous && previous !== cutoutPath) await this.removeFile(previous);
        } catch (error) {
            if (cutoutPath) await this.removeFile(cutoutPath);
            this.logger.warn(`Story ${storyId}, Character ${characterId}: no cut-out of the Reference image (${error instanceof Error ? error.message : error})`);
        }
    }

    /** One `image_cutout` call; its PNG's bytes. */
    private async cutOutImage(storyId: number, image: ImageData | Buffer): Promise<Buffer> {
        const source: ImageData = Buffer.isBuffer(image) ? { bytes: image, mimeType: ImageStoreService.sniffMimeType(image) ?? 'image/jpeg' } : image;
        const result = await this.gateway.generateImage({ kind: 'image_cutout', prompt: '', referenceImages: [source], servedFor: { storyId } });
        return result.image.bytes;
    }

    /**
     * Stores an uploaded picture as the emotion's Expression, replacing any there, with the
     * Portrait's square and no Reference image it was drawn from. The type is read from the bytes.
     */
    async upload(storyId: number, characterId: number, emotion: ExpressionEmotion, bytes: Buffer): Promise<StoryDetail> {
        await this.findCharacter(storyId, characterId);
        const mimeType = ImageStoreService.sniffMimeType(bytes);
        if (!mimeType) throw new UnsupportedImageError();
        await this.storeFile(storyId, characterId, emotion, bytes, ImageStoreService.extensionFor(mimeType)!, { crop: null, drawnFrom: null });
        return this.saved(storyId);
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
        const removed = await this.storyModel.removeExpression(characterId, emotion);
        if (removed === null) throw new ExpressionNotFoundError();
        await this.removeFile(removed.imagePath);
        if (removed.cutoutPath) await this.removeFile(removed.cutoutPath);
        return this.saved(storyId);
    }

    /**
     * Writes the file, then inserts or replaces the row (with no cut-out), then deletes the replaced
     * file and its cut-out. A failure before the row is saved deletes the new file and leaves the
     * old Expression as it was. Answers the new file's path.
     */
    protected async storeFile(
        storyId: number,
        characterId: number,
        emotion: ExpressionEmotion,
        bytes: Buffer,
        extension: string,
        fields: { crop: PortraitCrop | null | 'keep'; drawnFrom: string | null },
    ): Promise<string> {
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
        if (previous?.cutoutPath) await this.removeFile(previous.cutoutPath);
        return imagePath;
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
