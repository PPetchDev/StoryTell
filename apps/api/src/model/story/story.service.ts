import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { copyDocuments } from '../document/document.service.js';
import { ReplaceRuleEntity } from '../replace-rule/entities/replace-rule.entity.js';
import { SavedReplyEntity } from '../saved-reply/entities/saved-reply.entity.js';
import { ExpressionEmotion } from './emotion.js';
import { CharacterExpressionEntity } from './entities/character-expression.entity.js';
import { CharacterEntity, PortraitCrop } from './entities/character.entity.js';
import { LoreEntryEntity } from './entities/lore-entry.entity.js';
import { RoleEntity } from './entities/role.entity.js';
import { SceneBondGateEntity } from './entities/scene-bond-gate.entity.js';
import { SceneEntity } from './entities/scene.entity.js';
import { StartingBondEntity } from './entities/starting-bond.entity.js';
import { CoverFocus, StoryEntity } from './entities/story.entity.js';

// Relations are opted into here only; nothing on the entities auto-loads.
const FULL_RELATIONS = {
    role: true,
    characters: { expressions: true },
    startingBonds: true,
    scenes: { gates: true },
    lore: true,
    documents: true,
    savedReplies: true,
    replaceRules: true,
    coverSnapshot: true,
};

/** What one Expression row holds besides its id (.scratch/expressions/spec.md, "Storage"). */
export interface ExpressionColumns {
    characterId: number;
    emotion: ExpressionEmotion;
    imagePath: string;
    crop: PortraitCrop | null;
    drawnFrom: string | null;
}

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
    for (const scene of story.scenes) scene.gates = [...(scene.gates ?? [])].sort((a, b) => a.id - b.id);
    story.lore = byPosition(story.lore);
    story.documents = byPosition(story.documents);
    story.savedReplies = byPosition(story.savedReplies);
    story.replaceRules = byPosition(story.replaceRules);
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
        @InjectRepository(CharacterExpressionEntity) private readonly expressions: Repository<CharacterExpressionEntity>,
    ) {}

    /** Every Story with its relations, most recently saved first. */
    async findAllFull(): Promise<StoryEntity[]> {
        const stories = await this.stories.find({
            relations: FULL_RELATIONS,
            order: { updatedAt: 'DESC', id: 'DESC' },
        });
        return stories.map(sorted);
    }

    exists(id: number): Promise<boolean> {
        return this.stories.existsBy({ id });
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
     * its text and style, Role, Characters, StartingBonds, Scenes, Lore, Documents, Saved replies and Replace rules, in one transaction. Reference
     * images (with their Portrait crops) and the Cover are left empty for the caller, who copies the files. Answers the new
     * Story's id and each source Character's id mapped to its copy's.
     */
    async duplicate(source: StoryEntity, title: string): Promise<{ storyId: number; characterIds: Map<number, number> }> {
        return this.dataSource.transaction(async (manager) => {
            const { setting, opening, pov, tense, replyLength, imageStyle, narrationVoice, backdrop } = source;
            const story = await manager.save(
                manager.create(StoryEntity, { title, setting, opening, pov, tense, replyLength, imageStyle, narrationVoice, backdrop }),
            );
            await manager.save(
                manager.create(RoleEntity, { storyId: story.id, name: source.role.name, description: source.role.description }),
            );
            const characterIds = new Map<number, number>();
            for (const character of source.characters) {
                const { name, appearance, personality, voice, exampleLines, background, secrets, arcDirections, speakingVoice } = character;
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
                        speakingVoice,
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
                        // Its starting levels too (.scratch/bond-axes/spec.md, "Copying").
                        ...bond.levels(),
                    }),
                );
            }
            for (const scene of source.scenes) {
                const { position, name, situation, moveOnCondition } = scene;
                const copy = await manager.save(manager.create(SceneEntity, { storyId: story.id, position, name, situation, moveOnCondition }));
                // Its Bond gates, onto the copy's Scene and Characters (.scratch/bond-axes/spec.md, "Copying").
                for (const gate of scene.gates ?? []) {
                    await manager.save(
                        manager.create(SceneBondGateEntity, {
                            sceneId: copy.id,
                            fromCharacterId: characterIds.get(gate.fromCharacterId)!,
                            toCharacterId: gate.toCharacterId === null ? null : characterIds.get(gate.toCharacterId)!,
                            axis: gate.axis,
                            atLeast: gate.atLeast,
                        }),
                    );
                }
            }
            for (const entry of source.lore) {
                // Every field the entry answers with, its trigger settings included (.scratch/lore-triggers/spec.md).
                const { id: _id, ...fields } = entry.toResponse();
                await manager.save(manager.create(LoreEntryEntity, { ...fields, storyId: story.id, position: entry.position }));
            }
            // With their passages and vectors, so the copy is complete and costs nothing (.scratch/documents/spec.md).
            await copyDocuments(manager, source.id, story.id);
            // Saved replies go with the Story (.scratch/saved-replies-and-replace-rules/spec.md).
            for (const line of source.savedReplies) {
                await manager.save(manager.create(SavedReplyEntity, { storyId: story.id, text: line.text, position: line.position }));
            }
            // So do its Replace rules, so the copy reads the same.
            for (const rule of source.replaceRules) {
                const { id: _id, ...fields } = rule.toResponse();
                await manager.save(manager.create(ReplaceRuleEntity, { ...fields, storyId: story.id, position: rule.position }));
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
        const { title, setting, opening, pov, tense, replyLength, imageStyle, narrationVoice, backdrop } = story;
        await this.stories.update(
            { id: story.id },
            { title, setting, opening, pov, tense, replyLength, imageStyle, narrationVoice, backdrop, updatedAt: () => 'now()' },
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

    /**
     * Inserts the Character's Expression for that emotion, or replaces the one there (a new row id
     * either way). `crop: 'keep'` keeps the replaced row's square (a drawing again). Answers the
     * replaced row's columns, so the caller can delete its file; null when there was none.
     */
    async putExpression(columns: Omit<ExpressionColumns, 'crop'> & { crop: PortraitCrop | null | 'keep' }): Promise<ExpressionColumns | null> {
        return this.dataSource.transaction(async (manager) => {
            const previous = await manager.findOne(CharacterExpressionEntity, {
                where: { characterId: columns.characterId, emotion: columns.emotion },
                lock: { mode: 'pessimistic_write' },
            });
            if (previous) await manager.delete(CharacterExpressionEntity, { id: previous.id });
            const crop = columns.crop === 'keep' ? (previous?.crop ?? null) : columns.crop;
            await manager.insert(CharacterExpressionEntity, { ...columns, crop });
            return previous
                ? { characterId: previous.characterId, emotion: previous.emotion, imagePath: previous.imagePath, crop: previous.crop, drawnFrom: previous.drawnFrom }
                : null;
        });
    }

    /** Copies Expressions onto other Characters (Duplicate Story), each with its file already written. */
    async insertExpressions(rows: ExpressionColumns[]): Promise<void> {
        if (rows.length > 0) await this.expressions.insert(rows.map((row) => ({ ...row })));
    }

    /** Sets or clears its own square; answers whether the Expression was there. */
    async setExpressionCrop(characterId: number, emotion: ExpressionEmotion, crop: PortraitCrop | null): Promise<boolean> {
        const result = await this.expressions.update({ characterId, emotion }, { crop });
        return (result.affected ?? 0) > 0;
    }

    /** Deletes the row; answers its image path, or null when there was none. */
    async removeExpression(characterId: number, emotion: ExpressionEmotion): Promise<string | null> {
        const expression = await this.expressions.findOneBy({ characterId, emotion });
        if (!expression) return null;
        await this.expressions.delete({ id: expression.id });
        return expression.imagePath;
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

    /** Replaces a Scene's Bond gates with these, in one transaction, keeping their order. */
    async replaceSceneGates(sceneId: number, gates: Array<Pick<SceneBondGateEntity, 'fromCharacterId' | 'toCharacterId' | 'axis' | 'atLeast'>>): Promise<void> {
        await this.dataSource.transaction(async (manager) => {
            await manager.delete(SceneBondGateEntity, { sceneId });
            for (const gate of gates) {
                const { fromCharacterId, toCharacterId, axis, atLeast } = gate;
                await manager.save(manager.create(SceneBondGateEntity, { sceneId, fromCharacterId, toCharacterId, axis, atLeast }));
            }
        });
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
