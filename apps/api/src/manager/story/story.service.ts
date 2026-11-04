import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import {
    CastFullError,
    CharacterNotFoundError,
    DuplicateStartingBondError,
    InvalidOrderError,
    SceneNotFoundError,
    SelfStartingBondError,
    StartingBondNotFoundError,
    StoryNotFoundError,
} from '../../errors/story.errors.js';
import { CharacterEntity } from '../../model/story/entities/character.entity.js';
import { SceneEntity } from '../../model/story/entities/scene.entity.js';
import { StartingBondEntity } from '../../model/story/entities/starting-bond.entity.js';
import {
    Pov,
    ReplyLength,
    StoryEntity,
    StoryResponse,
    StorySummary,
    Tense,
} from '../../model/story/entities/story.entity.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { ImageData } from '../../service/model-gateway/model-gateway.js';
import { ImageStoreService } from '../../store/image/image-store.service.js';
import { MAX_CHARACTERS, playableStatus, PlayableStatus } from './playable.js';

/** A Story as the editor and the list read it: its fields plus the derived playable status. */
export type StoryDetail = StoryResponse & PlayableStatus;
export type StoryListItem = StorySummary & { playable: boolean };

export interface StoryFields {
    title?: string;
    setting?: string;
    opening?: string;
    pov?: Pov;
    tense?: Tense;
    replyLength?: ReplyLength;
    imageStyle?: string;
}

export interface RoleFields {
    name?: string;
    description?: string;
}

export interface CharacterFields {
    name?: string;
    appearance?: string;
    personality?: string;
    voice?: string;
    exampleLines?: string[];
    background?: string;
    secrets?: string;
    arcDirections?: string;
}

export interface StartingBondFields {
    label?: string;
    description?: string;
}

export interface NewStartingBond extends StartingBondFields {
    fromCharacterId: number;
    /** `null` means toward the Role. */
    toCharacterId: number | null;
}

export interface SceneFields {
    name?: string;
    situation?: string;
    moveOnCondition?: string;
}

/** Copies the fields that were sent, one by one, onto the target. */
function assignSent<T extends object>(target: T, fields: Partial<T>, keys: (keyof T)[]): void {
    for (const key of keys) {
        if (fields[key] !== undefined) target[key] = fields[key] as T[typeof key];
    }
}

function isPermutation(ids: number[], items: { id: number }[]): boolean {
    const wanted = new Set(items.map((item) => item.id));
    return ids.length === wanted.size && ids.every((id) => wanted.delete(id));
}

/**
 * The Story authoring module (spec: "Story authoring module"). Every write answers with the
 * whole Story and its playable status, so the editor's autosave always shows the truth.
 */
@Injectable()
export class StoryManagerService {
    private readonly logger = new Logger(StoryManagerService.name);

    constructor(
        private readonly storyModel: StoryModelService,
        private readonly imageStore: ImageStoreService,
    ) {}

    async listStories(): Promise<StoryListItem[]> {
        const stories = await this.storyModel.findAllFull();
        return stories.map((story) => ({
            ...story.toSummary(),
            playable: playableStatus(story).playable,
        }));
    }

    async createStory(fields: StoryFields): Promise<StoryDetail> {
        const id = await this.storyModel.createWithRole(fields.title ?? '');
        const story = await this.load(id);
        return this.updateStory(story.id, fields);
    }

    async getStory(storyId: number): Promise<StoryDetail> {
        return this.detail(await this.load(storyId));
    }

    async updateStory(storyId: number, fields: StoryFields): Promise<StoryDetail> {
        const story = await this.load(storyId);
        assignSent(story, fields, [
            'title',
            'setting',
            'opening',
            'pov',
            'tense',
            'replyLength',
            'imageStyle',
        ]);
        await this.storyModel.saveStory(story);
        return this.reload(storyId);
    }

    /** Removes the Story and everything under it, Reference image files included (spec: "Delete Story"). */
    async deleteStory(storyId: number): Promise<void> {
        const story = await this.load(storyId);
        await this.storyModel.deleteStory(storyId);
        for (const character of story.characters) await this.removeReferenceImageFile(character);
    }

    async updateRole(storyId: number, fields: RoleFields): Promise<StoryDetail> {
        const story = await this.load(storyId);
        assignSent(story.role, fields, ['name', 'description']);
        await this.storyModel.saveRole(story.role);
        return this.saved(storyId);
    }

    async addCharacter(storyId: number, fields: CharacterFields): Promise<StoryDetail> {
        const story = await this.load(storyId);
        if (story.characters.length >= MAX_CHARACTERS) throw new CastFullError(MAX_CHARACTERS);
        const character = this.storyModel.createCharacter({
            storyId,
            position: story.characters.length,
        });
        this.assignCharacter(character, fields);
        await this.storyModel.saveCharacter(character);
        return this.saved(storyId);
    }

    async updateCharacter(
        storyId: number,
        characterId: number,
        fields: CharacterFields,
    ): Promise<StoryDetail> {
        const story = await this.load(storyId);
        const character = this.findCharacter(story, characterId);
        this.assignCharacter(character, fields);
        await this.storyModel.saveCharacter(character);
        return this.saved(storyId);
    }

    async removeCharacter(storyId: number, characterId: number): Promise<StoryDetail> {
        const story = await this.load(storyId);
        const character = this.findCharacter(story, characterId);
        await this.storyModel.removeCharacter(character);
        await this.removeReferenceImageFile(character);
        const rest = story.characters.filter((other) => other.id !== characterId);
        await this.storyModel.setCharacterOrder(rest.map((other) => other.id));
        return this.saved(storyId);
    }

    /**
     * Stores `image` as the Character's one Reference image (spec: "A new one replaces the old
     * one, and the old file is deleted"). The new file is written and recorded before the old
     * file goes, so a failure midway never leaves the Character pointing at nothing.
     */
    async replaceReferenceImage(storyId: number, characterId: number, image: ImageData): Promise<StoryDetail> {
        const story = await this.load(storyId);
        const character = this.findCharacter(story, characterId);
        const extension = ImageStoreService.extensionFor(image.mimeType) ?? 'jpg';
        const token = randomBytes(6).toString('hex');
        // A fresh name per pick, so a browser never shows the replaced image from its cache.
        const relativePath = `reference-images/story-${storyId}/character-${characterId}-${token}.${extension}`;
        await this.imageStore.write(relativePath, image.bytes);

        const previous = character.referenceImagePath;
        character.referenceImagePath = relativePath;
        await this.storyModel.saveCharacter(character);
        if (previous) await this.removeFile(previous);
        return this.saved(storyId);
    }

    async removeReferenceImage(storyId: number, characterId: number): Promise<StoryDetail> {
        const story = await this.load(storyId);
        const character = this.findCharacter(story, characterId);
        const previous = character.referenceImagePath;
        character.referenceImagePath = null;
        await this.storyModel.saveCharacter(character);
        if (previous) await this.removeFile(previous);
        return this.saved(storyId);
    }

    private async removeReferenceImageFile(character: CharacterEntity): Promise<void> {
        if (character.referenceImagePath) await this.removeFile(character.referenceImagePath);
    }

    /** The record is already gone or updated, so a file that can't be deleted is logged, not an error. */
    private async removeFile(relativePath: string): Promise<void> {
        try {
            await this.imageStore.remove(relativePath);
        } catch (error) {
            this.logger.warn(`Could not delete ${relativePath}: ${error instanceof Error ? error.message : error}`);
        }
    }

    async reorderCharacters(storyId: number, characterIds: number[]): Promise<StoryDetail> {
        const story = await this.load(storyId);
        if (!isPermutation(characterIds, story.characters)) throw new InvalidOrderError('Characters');
        await this.storyModel.setCharacterOrder(characterIds);
        return this.saved(storyId);
    }

    async addStartingBond(storyId: number, bond: NewStartingBond): Promise<StoryDetail> {
        const story = await this.load(storyId);
        this.findCharacter(story, bond.fromCharacterId);
        if (bond.toCharacterId !== null) this.findCharacter(story, bond.toCharacterId);
        if (bond.toCharacterId === bond.fromCharacterId) throw new SelfStartingBondError();
        const taken = story.startingBonds.some(
            (other) =>
                other.fromCharacterId === bond.fromCharacterId &&
                other.toCharacterId === bond.toCharacterId,
        );
        if (taken) throw new DuplicateStartingBondError();

        const entity = this.storyModel.createStartingBond({
            storyId,
            fromCharacterId: bond.fromCharacterId,
            toCharacterId: bond.toCharacterId,
        });
        assignSent(entity, bond, ['label', 'description']);
        await this.storyModel.saveStartingBond(entity);
        return this.saved(storyId);
    }

    async updateStartingBond(
        storyId: number,
        bondId: number,
        fields: StartingBondFields,
    ): Promise<StoryDetail> {
        const story = await this.load(storyId);
        const bond = this.findStartingBond(story, bondId);
        assignSent(bond, fields, ['label', 'description']);
        await this.storyModel.saveStartingBond(bond);
        return this.saved(storyId);
    }

    async removeStartingBond(storyId: number, bondId: number): Promise<StoryDetail> {
        const story = await this.load(storyId);
        await this.storyModel.removeStartingBond(this.findStartingBond(story, bondId));
        return this.saved(storyId);
    }

    async addScene(storyId: number, fields: SceneFields): Promise<StoryDetail> {
        const story = await this.load(storyId);
        const scene = this.storyModel.createScene({ storyId, position: story.scenes.length });
        assignSent(scene, fields, ['name', 'situation', 'moveOnCondition']);
        await this.storyModel.saveScene(scene);
        return this.saved(storyId);
    }

    async updateScene(storyId: number, sceneId: number, fields: SceneFields): Promise<StoryDetail> {
        const story = await this.load(storyId);
        const scene = this.findScene(story, sceneId);
        assignSent(scene, fields, ['name', 'situation', 'moveOnCondition']);
        await this.storyModel.saveScene(scene);
        return this.saved(storyId);
    }

    async removeScene(storyId: number, sceneId: number): Promise<StoryDetail> {
        const story = await this.load(storyId);
        await this.storyModel.removeScene(this.findScene(story, sceneId));
        const rest = story.scenes.filter((other) => other.id !== sceneId);
        await this.storyModel.setSceneOrder(rest.map((other) => other.id));
        return this.saved(storyId);
    }

    async reorderScenes(storyId: number, sceneIds: number[]): Promise<StoryDetail> {
        const story = await this.load(storyId);
        if (!isPermutation(sceneIds, story.scenes)) throw new InvalidOrderError('Scenes');
        await this.storyModel.setSceneOrder(sceneIds);
        return this.saved(storyId);
    }

    private assignCharacter(character: CharacterEntity, fields: CharacterFields): void {
        assignSent(character, fields, [
            'name',
            'appearance',
            'personality',
            'voice',
            'exampleLines',
            'background',
            'secrets',
            'arcDirections',
        ]);
    }

    private async load(storyId: number): Promise<StoryEntity> {
        const story = await this.storyModel.findFull(storyId);
        if (!story) throw new StoryNotFoundError();
        return story;
    }

    /** After a change under the Story: mark the Story saved, then answer with all of it. */
    private async saved(storyId: number): Promise<StoryDetail> {
        await this.storyModel.touch(storyId);
        return this.reload(storyId);
    }

    private async reload(storyId: number): Promise<StoryDetail> {
        return this.detail(await this.load(storyId));
    }

    private detail(story: StoryEntity): StoryDetail {
        return { ...story.toResponse(), ...playableStatus(story) };
    }

    private findCharacter(story: StoryEntity, characterId: number): CharacterEntity {
        const character = story.characters.find((other) => other.id === characterId);
        if (!character) throw new CharacterNotFoundError();
        return character;
    }

    private findStartingBond(story: StoryEntity, bondId: number): StartingBondEntity {
        const bond = story.startingBonds.find((other) => other.id === bondId);
        if (!bond) throw new StartingBondNotFoundError();
        return bond;
    }

    private findScene(story: StoryEntity, sceneId: number): SceneEntity {
        const scene = story.scenes.find((other) => other.id === sceneId);
        if (!scene) throw new SceneNotFoundError();
        return scene;
    }
}
