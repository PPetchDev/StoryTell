import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import {
    CastFullError,
    CharacterNotFoundError,
    DuplicateStartingBondError,
    InvalidOrderError,
    NoReferenceImageError,
    SceneNotFoundError,
    SelfStartingBondError,
    StartingBondNotFoundError,
    StoryNotFoundError,
} from '../../errors/story.errors.js';
import { ChatModelService } from '../../model/chat/chat.service.js';
import { LedgerModelService } from '../../model/ledger/ledger.service.js';
import { SnapshotModelService } from '../../model/snapshot/snapshot.service.js';
import { CharacterEntity, PortraitCrop } from '../../model/story/entities/character.entity.js';
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
import { parseReply, ReplyPart } from '../chat/turn/reply-parser.js';
import { storyHook } from '../excerpt.js';
import { MAX_CHARACTERS, playableStatus, PlayableStatus } from './playable.js';

/** A Story as the editor and the list read it: its fields plus the derived playable status. */
export type StoryDetail = StoryResponse & PlayableStatus;
/** A Story's most recently played Chat, as Home's Continue row and card sheet open it. */
export interface LatestChat {
    id: number;
    /** The Scene the Chat is on; null means free play. */
    sceneName: string | null;
}

/** A Story as Home's cards read it (spec: "Lists and Home"). */
export interface StoryListItem extends StorySummary, PlayableStatus {
    /** When its most recently played Chat was last played; null when it has no Chats. */
    lastPlayedAt: string | null;
    /** That Chat; null when it has no Chats. */
    latestChat: LatestChat | null;
    /** The newest Snapshot's image, relative to the image folder; null when it has none. */
    coverImagePath: string | null;
    /** The Setting's first sentence, cut to about 120 characters. */
    hook: string;
}

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
 * Cast and Scene changes reach the Story's existing Chats here (spec: "Cast and Scene
 * changes"); text edits need nothing, since Chats read the Story live.
 */
@Injectable()
export class StoryManagerService {
    private readonly logger = new Logger(StoryManagerService.name);

    constructor(
        private readonly storyModel: StoryModelService,
        private readonly chatModel: ChatModelService,
        private readonly ledger: LedgerModelService,
        private readonly imageStore: ImageStoreService,
        private readonly snapshotModel: SnapshotModelService,
    ) {}

    async listStories(): Promise<StoryListItem[]> {
        const [stories, newestChats, newestSnapshots] = await Promise.all([
            this.storyModel.findAllFull(),
            this.chatModel.findNewestPlayedPerStory(),
            this.snapshotModel.findNewestPerStory(),
        ]);
        const chatOf = new Map(newestChats.map((chat) => [chat.storyId, chat]));
        const coverOf = new Map(newestSnapshots.map((snapshot) => [snapshot.storyId, snapshot.imagePath]));
        return stories.map((story) => {
            const chat = chatOf.get(story.id);
            const scene = chat && story.scenes.find((candidate) => candidate.id === chat.currentSceneId);
            return {
                ...story.toSummary(),
                ...playableStatus(story),
                lastPlayedAt: chat ? chat.lastPlayedAt.toISOString() : null,
                latestChat: chat ? { id: chat.id, sceneName: scene?.name ?? null } : null,
                coverImagePath: coverOf.get(story.id) ?? null,
                hook: storyHook(story.setting),
            };
        });
    }

    async createStory(fields: StoryFields): Promise<StoryDetail> {
        const id = await this.storyModel.createWithRole(fields.title ?? '');
        const story = await this.load(id);
        return this.updateStory(story.id, fields);
    }

    async getStory(storyId: number): Promise<StoryDetail> {
        return this.detail(await this.load(storyId));
    }

    /**
     * The stored Opening split by the same parser a new Chat uses for its first Message, so the
     * editor can preview how every Chat begins. The guard is off: the author wrote the Opening.
     */
    async openingParts(storyId: number): Promise<ReplyPart[]> {
        const story = await this.load(storyId);
        return parseReply(story.opening, story.characters, story.role.name, { guard: false }).parts;
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

    /** Removes the Story and everything under it, Reference image and Gallery files included (spec: "Delete Story"). */
    async deleteStory(storyId: number): Promise<void> {
        const story = await this.load(storyId);
        // Read before the delete: the Gallery's records go with the Story through CASCADE.
        const galleryFiles = await this.snapshotModel.imagePathsByStory(storyId);
        await this.storyModel.deleteStory(storyId);
        for (const character of story.characters) await this.removeReferenceImageFile(character);
        for (const imagePath of galleryFiles) await this.removeFile(imagePath);
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
        await this.joinChats(storyId, character);
        return this.saved(storyId);
    }

    /**
     * Spec: "Add Character". The Character joins every Chat as a stranger: no Bonds are
     * seeded, and only its Arc directions are copied in.
     */
    private async joinChats(storyId: number, character: CharacterEntity): Promise<void> {
        await this.copyArcDirectionIntoChats(storyId, character);
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
        // The editor adds a Character blank and its Arc directions are typed afterwards, so the
        // first non-empty value fills each Chat that holds no copy yet. Chats with a copy keep it.
        if (fields.arcDirections !== undefined) await this.copyArcDirectionIntoChats(storyId, character);
        return this.saved(storyId);
    }

    /** Copies the Character's Arc directions, when it has any, into each Chat without a copy. */
    private async copyArcDirectionIntoChats(storyId: number, character: CharacterEntity): Promise<void> {
        const text = character.arcDirections ?? '';
        if (text.trim() === '') return;
        const chats = await this.chatModel.findByStory(storyId);
        await this.ledger.copyArcDirectionWhereMissing(
            chats.map((chat) => chat.id),
            { characterId: character.id, text },
        );
    }

    /**
     * Spec: "Remove Character". In every Chat its Bonds both ways with their history, its Arc
     * steps, its copied Arc directions and its Known-by entries go by ON DELETE CASCADE, and
     * speech parts keep its stamped name with their Character link cleared (SET NULL).
     * StartingBonds pointing at it cascade too; its Reference image file goes here.
     */
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
        character.portraitCrop = null;
        await this.storyModel.saveCharacter(character);
        if (previous) await this.removeFile(previous);
        return this.saved(storyId);
    }

    async removeReferenceImage(storyId: number, characterId: number): Promise<StoryDetail> {
        const story = await this.load(storyId);
        const character = this.findCharacter(story, characterId);
        const previous = character.referenceImagePath;
        character.referenceImagePath = null;
        character.portraitCrop = null;
        await this.storyModel.saveCharacter(character);
        if (previous) await this.removeFile(previous);
        return this.saved(storyId);
    }

    /** Sets or clears the square of the Reference image shown beside the Character's lines in a Chat. */
    async setPortraitCrop(storyId: number, characterId: number, crop: PortraitCrop | null): Promise<StoryDetail> {
        const story = await this.load(storyId);
        const character = this.findCharacter(story, characterId);
        if (crop && !character.referenceImagePath) throw new NoReferenceImageError();
        character.portraitCrop = crop ? { x: crop.x, y: crop.y, size: crop.size } : null;
        await this.storyModel.saveCharacter(character);
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
        await this.enterAddedScene(story, scene);
        return this.saved(storyId);
    }

    /**
     * Spec: "Add Scenes". A Chat in free play enters the new Scene when it is placed after the
     * last Scene the Chat finished (the one its latest SceneAdvance left). A Chat that never
     * finished a Scene, or whose last finished Scene is gone, enters it too. Chats on a Scene
     * stay there. `story` is as it was before the Scene was added.
     */
    private async enterAddedScene(story: StoryEntity, added: SceneEntity): Promise<void> {
        const entering: number[] = [];
        for (const chat of await this.chatModel.findByStory(story.id)) {
            if (chat.currentSceneId !== null) continue;
            const advance = await this.ledger.lastSceneAdvance(chat.id);
            const finished = story.scenes.find((scene) => scene.id === advance?.fromSceneId);
            if (!finished || finished.position < added.position) entering.push(chat.id);
        }
        await this.chatModel.setScene(entering, added.id);
    }

    async updateScene(storyId: number, sceneId: number, fields: SceneFields): Promise<StoryDetail> {
        const story = await this.load(storyId);
        const scene = this.findScene(story, sceneId);
        assignSent(scene, fields, ['name', 'situation', 'moveOnCondition']);
        await this.storyModel.saveScene(scene);
        return this.saved(storyId);
    }

    /**
     * Spec: "Remove Scene". A Chat on it moves to the next Scene by position, or to free play
     * if it was the last; no SceneAdvance is recorded, since the author moved it. SceneAdvances
     * that name the Scene keep their stamped names, their Scene link cleared (SET NULL).
     */
    async removeScene(storyId: number, sceneId: number): Promise<StoryDetail> {
        const story = await this.load(storyId);
        const scene = this.findScene(story, sceneId);
        const next = story.scenes.find((other) => other.position > scene.position);
        await this.chatModel.moveOffScene(scene.id, next?.id ?? null);
        await this.storyModel.removeScene(scene);
        const rest = story.scenes.filter((other) => other.id !== sceneId);
        await this.storyModel.setSceneOrder(rest.map((other) => other.id));
        return this.saved(storyId);
    }

    /** Spec: "Reorder Scenes". Each Chat stays on its Scene, which Chats hold by id. */
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
