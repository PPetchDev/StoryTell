import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { CharacterEntity, PortraitCrop } from './entities/character.entity.js';
import { LoreEntryEntity } from './entities/lore-entry.entity.js';
import { RoleEntity } from './entities/role.entity.js';
import { SceneEntity } from './entities/scene.entity.js';
import { StartingBondEntity } from './entities/starting-bond.entity.js';
import { CoverFocus, StoryEntity } from './entities/story.entity.js';

// Relations are opted into here only; nothing on the entities auto-loads.
const FULL_RELATIONS = { role: true, characters: true, startingBonds: true, scenes: true, lore: true, coverSnapshot: true };

/** A Story's Cover columns: at most one of the three pointers set, and where to look. */
export interface CoverColumns {
    snapshotId: number | null;
    characterId: number | null;
    imagePath: string | null;
    focus: CoverFocus | null;
}

function byPosition<T extends { position: number; id: number }>(items: T[]): T[] {
    return [...items].sort((a, b) => a.position - b.position || a.id - b.id);
}

/** Puts a loaded Story's lists in their authored order. */
function sorted(story: StoryEntity): StoryEntity {
    story.characters = byPosition(story.characters);
    story.scenes = byPosition(story.scenes);
    story.lore = byPosition(story.lore);
    story.startingBonds = [...story.startingBonds].sort((a, b) => a.id - b.id);
    return story;
}

/** Repository wrapper for a Story and everything under it. No business rules live here. */
@Injectable()
export class StoryModelService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        @InjectRepository(StoryEntity) private readonly stories: Repository<StoryEntity>,
        @InjectRepository(RoleEntity) private readonly roles: Repository<RoleEntity>,
        @InjectRepository(CharacterEntity) private readonly characters: Repository<CharacterEntity>,
        @InjectRepository(StartingBondEntity) private readonly bonds: Repository<StartingBondEntity>,
        @InjectRepository(SceneEntity) private readonly scenes: Repository<SceneEntity>,
        @InjectRepository(LoreEntryEntity) private readonly lore: Repository<LoreEntryEntity>,
    ) {}

    /** Every Story with its relations, most recently saved first. */
    async findAllFull(): Promise<StoryEntity[]> {
        const stories = await this.stories.find({
            relations: FULL_RELATIONS,
            order: { updatedAt: 'DESC', id: 'DESC' },
        });
        return stories.map(sorted);
    }

    async findFull(id: number): Promise<StoryEntity | null> {
        const story = await this.stories.findOne({ where: { id }, relations: FULL_RELATIONS });
        return story && sorted(story);
    }

    /** A Story is born with its Role, so "exactly one Role" holds from the first read. */
    async createWithRole(title: string): Promise<number> {
        return this.dataSource.transaction(async (manager) => {
            const story = await manager.save(manager.create(StoryEntity, { title }));
            await manager.save(manager.create(RoleEntity, { storyId: story.id }));
            return story.id;
        });
    }

    /**
     * A new Story holding a copy of everything authored under `source` (loaded by `findFull`):
     * its text and style, Role, Characters, StartingBonds, Scenes and Lore, in one transaction. Reference
     * images (with their Portrait crops) and the Cover are left empty for the caller, who copies the files. Answers the new
     * Story's id and each source Character's id mapped to its copy's.
     */
    async duplicate(source: StoryEntity, title: string): Promise<{ storyId: number; characterIds: Map<number, number> }> {
        return this.dataSource.transaction(async (manager) => {
            const { setting, opening, pov, tense, replyLength, imageStyle } = source;
            const story = await manager.save(manager.create(StoryEntity, { title, setting, opening, pov, tense, replyLength, imageStyle }));
            await manager.save(
                manager.create(RoleEntity, { storyId: story.id, name: source.role.name, description: source.role.description }),
            );
            const characterIds = new Map<number, number>();
            for (const character of source.characters) {
                const { name, appearance, personality, voice, exampleLines, background, secrets, arcDirections } = character;
                const copy = await manager.save(
                    manager.create(CharacterEntity, {
                        storyId: story.id,
                        position: character.position,
                        name,
                        appearance,
                        personality,
                        voice,
                        exampleLines: [...exampleLines],
                        background,
                        secrets,
                        arcDirections,
                        referenceImagePath: null,
                        portraitCrop: null,
                    }),
                );
                characterIds.set(character.id, copy.id);
            }
            for (const bond of source.startingBonds) {
                await manager.save(
                    manager.create(StartingBondEntity, {
                        storyId: story.id,
                        fromCharacterId: characterIds.get(bond.fromCharacterId)!,
                        toCharacterId: bond.toCharacterId === null ? null : characterIds.get(bond.toCharacterId)!,
                        label: bond.label,
                        description: bond.description,
                    }),
                );
            }
            for (const scene of source.scenes) {
                const { position, name, situation, moveOnCondition } = scene;
                await manager.save(manager.create(SceneEntity, { storyId: story.id, position, name, situation, moveOnCondition }));
            }
            for (const entry of source.lore) {
                const { position, name, keywords, text, alwaysOn } = entry;
                await manager.save(manager.create(LoreEntryEntity, { storyId: story.id, position, name, keywords: [...keywords], text, alwaysOn }));
            }
            return { storyId: story.id, characterIds };
        });
    }

    /** Points Characters at their Reference image files, each with its Portrait crop, without marking the Story saved. */
    async setReferenceImages(images: Map<number, { path: string; portraitCrop: PortraitCrop | null }>): Promise<void> {
        for (const [id, image] of images) {
            await this.characters.update({ id }, { referenceImagePath: image.path, portraitCrop: image.portraitCrop });
        }
    }

    /**
     * Writes the Story's authored fields and marks it saved. Only these: the Cover has its own
     * writer, and a whole-entity save from an older read would put an older Cover back.
     */
    async saveStory(story: StoryEntity): Promise<void> {
        const { title, setting, opening, pov, tense, replyLength, imageStyle } = story;
        await this.stories.update(
            { id: story.id },
            { title, setting, opening, pov, tense, replyLength, imageStyle, updatedAt: () => 'now()' },
        );
    }

    /** Bumps `updated_at`, so a change anywhere under the Story counts as saving it. */
    async touch(storyId: number): Promise<void> {
        await this.stories.update({ id: storyId }, { updatedAt: () => 'now()' });
    }

    /** Writes all four Cover columns at once and marks the Story saved. */
    async setCover(storyId: number, cover: CoverColumns): Promise<void> {
        await this.stories.update(
            { id: storyId },
            {
                coverSnapshotId: cover.snapshotId,
                coverCharacterId: cover.characterId,
                coverImagePath: cover.imagePath,
                coverFocus: cover.focus,
                updatedAt: () => 'now()',
            },
        );
    }

    /** Moves the focus point only; the picture stays as it is. */
    async setCoverFocus(storyId: number, focus: CoverFocus | null): Promise<void> {
        await this.stories.update({ id: storyId }, { coverFocus: focus, updatedAt: () => 'now()' });
    }

    async deleteStory(id: number): Promise<void> {
        // Role, Characters, StartingBonds, Scenes and Lore go with it through ON DELETE CASCADE.
        await this.stories.delete({ id });
    }

    saveRole(role: RoleEntity): Promise<RoleEntity> {
        return this.roles.save(role);
    }

    createCharacter(fields: Partial<CharacterEntity>): CharacterEntity {
        return this.characters.create(fields);
    }

    saveCharacter(character: CharacterEntity): Promise<CharacterEntity> {
        return this.characters.save(character);
    }

    async removeCharacter(character: CharacterEntity): Promise<void> {
        // StartingBonds from and toward it go through ON DELETE CASCADE.
        await this.characters.delete({ id: character.id });
    }

    /** Writes positions 0..n-1 in the given order, in one transaction. */
    async setCharacterOrder(ids: number[]): Promise<void> {
        await this.dataSource.transaction(async (manager) => {
            for (const [position, id] of ids.entries()) {
                await manager.update(CharacterEntity, { id }, { position });
            }
        });
    }

    createStartingBond(fields: Partial<StartingBondEntity>): StartingBondEntity {
        return this.bonds.create(fields);
    }

    saveStartingBond(bond: StartingBondEntity): Promise<StartingBondEntity> {
        return this.bonds.save(bond);
    }

    async removeStartingBond(bond: StartingBondEntity): Promise<void> {
        await this.bonds.delete({ id: bond.id });
    }

    createScene(fields: Partial<SceneEntity>): SceneEntity {
        return this.scenes.create(fields);
    }

    saveScene(scene: SceneEntity): Promise<SceneEntity> {
        return this.scenes.save(scene);
    }

    async removeScene(scene: SceneEntity): Promise<void> {
        await this.scenes.delete({ id: scene.id });
    }

    async setSceneOrder(ids: number[]): Promise<void> {
        await this.dataSource.transaction(async (manager) => {
            for (const [position, id] of ids.entries()) {
                await manager.update(SceneEntity, { id }, { position });
            }
        });
    }

    createLoreEntry(fields: Partial<LoreEntryEntity>): LoreEntryEntity {
        return this.lore.create(fields);
    }

    saveLoreEntry(entry: LoreEntryEntity): Promise<LoreEntryEntity> {
        return this.lore.save(entry);
    }

    async removeLoreEntry(entry: LoreEntryEntity): Promise<void> {
        await this.lore.delete({ id: entry.id });
    }
}
