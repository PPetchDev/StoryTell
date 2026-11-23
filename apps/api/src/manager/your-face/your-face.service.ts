import { randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { AppError } from '../../errors/app-error.js';
import { NotSeeThroughError, UnsupportedImageError } from '../../errors/image.errors.js';
import { OutOfCreditError } from '../../errors/model-gateway.errors.js';
import { ExpressionNotFoundError, NoReferenceImageToDrawError } from '../../errors/story.errors.js';
import { PersonaResponse } from '../../model/persona/entities/persona.entity.js';
import { FACE_EMOTIONS, FaceEmotion } from '../../model/story/emotion.js';
import { PortraitCrop } from '../../model/story/entities/character.entity.js';
import { ExpressionResponse } from '../../model/story/entities/character-expression.entity.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { FaceOwner } from '../../model/your-face/entities/identity-expression.entity.js';
import { YourFaceModelService } from '../../model/your-face/your-face.service.js';
import { CutoutMaker, ImageData, ModelGateway } from '../../service/model-gateway/model-gateway.js';
import { ImageStoreService } from '../../store/image/image-store.service.js';
import { ExpressionDrawing, emotionsToDraw } from '../expression/expression-drawing.service.js';
import { expressionPrompt } from '../expression/prompt.js';
import { PersonaManagerService } from '../persona/persona.service.js';
import { StoryDetail, StoryManagerService } from '../story/story.service.js';

/** The Story's Role, or one of the user's Personas, as the routes name them. */
export type FaceTarget = { storyId: number } | { personaId: number };

/** What drawing, uploading and answering need of the owner. */
interface Owner {
    key: string;
    owner: FaceOwner;
    name: string;
    /** The Role image or Persona image; what an Expression is drawn from. */
    picturePath: string | null;
    expressions: ExpressionResponse[];
    storyId: number | null;
    pathFor(emotion: FaceEmotion, extension: string): string;
}

interface Run extends ExpressionDrawing {
    target: FaceTarget;
}

const IDLE: ExpressionDrawing = { running: false, emotions: [], drawn: [], current: null, failed: null, stopped: false };
const UNEXPECTED = '500.000.000';
const token = () => randomBytes(6).toString('hex');

/**
 * Your faces (.scratch/your-faces/spec.md): the Role's and the Personas' Expressions, made as a
 * Character's are: drawn from the Role image or Persona image (the image model sees it), uploaded,
 * cropped, removed, cut out for the stage, and Draw all on the server. A Role write answers the
 * Story; a Persona write answers the Persona.
 */
@Injectable()
export class YourFaceManagerService {
    private readonly logger = new Logger(YourFaceManagerService.name);
    private readonly runs = new Map<string, Run>();

    constructor(
        private readonly storyManager: StoryManagerService,
        private readonly storyModel: StoryModelService,
        private readonly personas: PersonaManagerService,
        private readonly faces: YourFaceModelService,
        private readonly imageStore: ImageStoreService,
        private readonly gateway: ModelGateway,
    ) {}

    /** Draws the emotion's Expression from the owner's picture: one `expression_image` call, then its cut-out. */
    async draw(target: FaceTarget, emotion: FaceEmotion): Promise<StoryDetail | PersonaResponse> {
        const owner = await this.drawable(target);
        const drawnFrom = owner.picturePath!;
        const reference = await this.imageStore.read(drawnFrom);
        const result = await this.gateway.generateImage({
            kind: 'expression_image',
            prompt: expressionPrompt({ name: owner.name, appearance: '' }, emotion),
            referenceImages: [reference],
            ...(owner.storyId !== null ? { servedFor: { storyId: owner.storyId } } : {}),
        });
        const extension = ImageStoreService.extensionFor(result.image.mimeType) ?? 'jpg';
        const imagePath = await this.storeFile(owner, emotion, result.image.bytes, extension, { crop: 'keep', drawnFrom });
        await this.cutOutExpression(owner, emotion, imagePath, result.image);
        return this.answer(target);
    }

    /** Cuts out an Expression that is there: one `image_cutout` call; a failed call is the error. */
    async cutOut(target: FaceTarget, emotion: FaceEmotion, by?: CutoutMaker): Promise<StoryDetail | PersonaResponse> {
        const owner = await this.find(target);
        const expression = owner.expressions.find((one) => one.emotion === emotion);
        if (!expression) throw new ExpressionNotFoundError();
        // Only Venice's remover spends image credit; the app's own costs nothing (.scratch/own-cutout/spec.md).
        const paid = by === 'venice' || (by !== 'soft' && !this.gateway.ownCutoutAvailable());
        if (paid && (await this.imageCreditOut())) throw new OutOfCreditError('image');
        await this.cutOutExpression(owner, emotion, expression.imagePath, await this.imageStore.read(expression.imagePath), true, by);
        return this.answer(target);
    }

    /** Stores an uploaded picture as the emotion's Expression, with the centre square; the type is read from the bytes. */
    async upload(target: FaceTarget, emotion: FaceEmotion, bytes: Buffer): Promise<StoryDetail | PersonaResponse> {
        const owner = await this.find(target);
        const mimeType = ImageStoreService.sniffMimeType(bytes);
        if (!mimeType) throw new UnsupportedImageError();
        await this.storeFile(owner, emotion, bytes, ImageStoreService.extensionFor(mimeType)!, { crop: null, drawnFrom: null });
        return this.answer(target);
    }

    /**
     * Keeps an uploaded see-through picture as the Expression's cut-out (.scratch/stage-pictures/spec.md,
     * "Upload a cut-out"), replacing any there; the Expression's own picture stays. No model call.
     */
    async uploadCutout(target: FaceTarget, emotion: FaceEmotion, bytes: Buffer): Promise<StoryDetail | PersonaResponse> {
        const owner = await this.find(target);
        const expression = owner.expressions.find((one) => one.emotion === emotion);
        if (!expression) throw new ExpressionNotFoundError();
        if (!ImageStoreService.sniffMimeType(bytes)) throw new UnsupportedImageError();
        const extension = await ImageStoreService.seeThroughExtension(bytes);
        if (!extension) throw new NotSeeThroughError();
        const cutoutPath = owner.pathFor(emotion, extension).replace(/\.(png|webp)$/, '-cutout.$1');
        await this.imageStore.write(cutoutPath, bytes);
        let previous: string | null | false;
        try {
            previous = await this.faces.setCutout(owner.owner, emotion, expression.imagePath, cutoutPath);
        } catch (error) {
            await this.removeFile(cutoutPath);
            throw error;
        }
        // Redrawn, uploaded or removed meanwhile: this cut-out belongs to no Expression.
        if (previous === false) {
            await this.removeFile(cutoutPath);
            throw new ExpressionNotFoundError();
        }
        if (previous) await this.removeFile(previous);
        return this.answer(target);
    }

    async setCrop(target: FaceTarget, emotion: FaceEmotion, crop: PortraitCrop | null): Promise<StoryDetail | PersonaResponse> {
        const owner = await this.find(target);
        const square = crop ? { x: crop.x, y: crop.y, size: crop.size } : null;
        if (!(await this.faces.setCrop(owner.owner, emotion, square))) throw new ExpressionNotFoundError();
        return this.answer(target);
    }

    /** Deletes the Expression and its files; its emotion shows the picture again. */
    async remove(target: FaceTarget, emotion: FaceEmotion): Promise<StoryDetail | PersonaResponse> {
        const owner = await this.find(target);
        const removed = await this.faces.remove(owner.owner, emotion);
        if (!removed) throw new ExpressionNotFoundError();
        await this.removeFile(removed.imagePath);
        if (removed.cutoutPath) await this.removeFile(removed.cutoutPath);
        return this.answer(target);
    }

    /** Starts a Draw all run for the owner, or answers the one going; refused before it starts as a single drawing is. */
    async startDrawing(target: FaceTarget, redraw: boolean): Promise<ExpressionDrawing> {
        const owner = await this.find(target);
        const going = this.runs.get(owner.key);
        if (going?.running) return view(going);
        await this.drawable(target);
        const emotions = emotionsToDraw(owner, redraw, FACE_EMOTIONS);
        if (emotions.length === 0) {
            this.runs.delete(owner.key);
            return { ...IDLE };
        }
        const run: Run = { target, running: true, emotions, drawn: [], current: null, failed: null, stopped: false };
        this.runs.set(owner.key, run);
        void this.drawAll(run, owner.key);
        return view(run);
    }

    /** The running or last Draw all run of the owner, or an idle one. */
    async drawing(target: FaceTarget): Promise<ExpressionDrawing> {
        const owner = await this.find(target);
        const run = this.runs.get(owner.key);
        return run ? view(run) : { ...IDLE };
    }

    /** Asks the owner's running run to stop after the drawing under way (docs/ui-audit-2026-11-21.md, M4). */
    async stopDrawing(target: FaceTarget): Promise<ExpressionDrawing> {
        const owner = await this.find(target);
        const run = this.runs.get(owner.key);
        if (!run) return { ...IDLE };
        if (run.running) run.stopped = true;
        return view(run);
    }

    private async drawAll(run: Run, key: string): Promise<void> {
        try {
            for (const emotion of run.emotions) {
                if (run.stopped) break;
                run.current = emotion;
                await this.draw(run.target, emotion);
                run.drawn.push(emotion);
            }
        } catch (error) {
            run.failed = error instanceof AppError ? { code: error.code, message: error.message } : { code: UNEXPECTED, message: 'Something went wrong.' };
            if (!(error instanceof AppError)) this.logger.error(`${key}: Draw all stopped`, error instanceof Error ? error.stack : String(error));
        } finally {
            run.current = null;
            run.running = false;
        }
    }

    /** The owner when an Expression can be drawn for it now: it has a picture, and the Venice pool isn't known to be used up. */
    private async drawable(target: FaceTarget): Promise<Owner> {
        const owner = await this.find(target);
        if (!owner.picturePath) throw new NoReferenceImageToDrawError();
        if (await this.imageCreditOut()) throw new OutOfCreditError('image');
        return owner;
    }

    private async find(target: FaceTarget): Promise<Owner> {
        if ('storyId' in target) {
            const story = await this.storyManager.getStory(target.storyId);
            const { role } = story;
            return {
                key: `role-${role.id}`,
                owner: { roleId: role.id },
                name: role.name,
                picturePath: role.imagePath,
                expressions: role.expressions,
                storyId: story.id,
                pathFor: (emotion, extension) => `expressions/story-${story.id}/role-${emotion}-${token()}.${extension}`,
            };
        }
        const persona = await this.personas.get(target.personaId);
        return {
            key: `persona-${persona.id}`,
            owner: { personaId: persona.id },
            name: persona.name,
            picturePath: persona.imagePath,
            expressions: persona.expressions,
            storyId: null,
            pathFor: (emotion, extension) => `personas/persona-${persona.id}/expression-${emotion}-${token()}.${extension}`,
        };
    }

    private async answer(target: FaceTarget): Promise<StoryDetail | PersonaResponse> {
        if ('storyId' in target) {
            await this.storyModel.touch(target.storyId);
            return this.storyManager.getStory(target.storyId);
        }
        return this.personas.get(target.personaId);
    }

    /** Writes the file, then the row; a failure before the row deletes the new file. Deletes the replaced files after. */
    private async storeFile(owner: Owner, emotion: FaceEmotion, bytes: Buffer, extension: string, fields: { crop: PortraitCrop | null | 'keep'; drawnFrom: string | null }): Promise<string> {
        const imagePath = owner.pathFor(emotion, extension);
        await this.imageStore.write(imagePath, bytes);
        let previous;
        try {
            previous = await this.faces.put(owner.owner, { emotion, imagePath, ...fields });
        } catch (error) {
            await this.removeFile(imagePath);
            throw error;
        }
        if (previous && previous.imagePath !== imagePath) await this.removeFile(previous.imagePath);
        if (previous?.cutoutPath) await this.removeFile(previous.cutoutPath);
        return imagePath;
    }

    /** Cuts out the picture now at `imagePath` and keeps it as that Expression's cut-out. Swallows a failure unless `rethrow`. */
    private async cutOutExpression(owner: Owner, emotion: FaceEmotion, imagePath: string, image: ImageData | Buffer, rethrow = false, by?: CutoutMaker): Promise<void> {
        let cutoutPath: string | null = null;
        try {
            const source: ImageData = Buffer.isBuffer(image) ? { bytes: image, mimeType: ImageStoreService.sniffMimeType(image) ?? 'image/jpeg' } : image;
            const cut = await this.gateway.generateImage({
                kind: 'image_cutout',
                prompt: '',
                referenceImages: [source],
                ...(by ? { cutoutBy: by } : {}),
                ...(owner.storyId !== null ? { servedFor: { storyId: owner.storyId } } : {}),
            });
            cutoutPath = owner.pathFor(emotion, 'png').replace(/\.png$/, '-cutout.png');
            await this.imageStore.write(cutoutPath, cut.image.bytes);
            const previous = await this.faces.setCutout(owner.owner, emotion, imagePath, cutoutPath);
            if (previous === false) await this.removeFile(cutoutPath);
            else if (previous) await this.removeFile(previous);
        } catch (error) {
            if (cutoutPath) await this.removeFile(cutoutPath);
            this.logger.warn(`${owner.key}: no cut-out for ${emotion} (${error instanceof Error ? error.message : error})`);
            if (rethrow) throw error;
        }
    }

    private async imageCreditOut(): Promise<boolean> {
        const remaining = (await this.gateway.remainingCredit()).image.remainingUsd;
        return remaining !== null && remaining <= 0;
    }

    private async removeFile(relativePath: string): Promise<void> {
        try {
            await this.imageStore.remove(relativePath);
        } catch (error) {
            this.logger.warn(`Could not delete ${relativePath}: ${error instanceof Error ? error.message : error}`);
        }
    }
}

function view({ running, emotions, drawn, current, failed, stopped }: Run): ExpressionDrawing {
    return { running, emotions: [...emotions], drawn: [...drawn], current, failed, stopped };
}

