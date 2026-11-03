import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { CharacterEntity } from './entities/character.entity.js';
import { RoleEntity } from './entities/role.entity.js';
import { SceneEntity } from './entities/scene.entity.js';
import { StartingBondEntity } from './entities/starting-bond.entity.js';
import { StoryEntity } from './entities/story.entity.js';

// Relations are opted into here only; nothing on the entities auto-loads.
const FULL_RELATIONS = { role: true, characters: true, startingBonds: true, scenes: true };

function byPosition<T extends { position: number; id: number }>(items: T[]): T[] {
    return [...items].sort((a, b) => a.position - b.position || a.id - b.id);
}

/** Puts a loaded Story's lists in their authored order. */
function sorted(story: StoryEntity): StoryEntity {
    story.characters = byPosition(story.characters);
    story.scenes = byPosition(story.scenes);
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

    saveStory(story: StoryEntity): Promise<StoryEntity> {
        return this.stories.save(story);
    }

    /** Bumps `updated_at`, so a change anywhere under the Story counts as saving it. */
    async touch(storyId: number): Promise<void> {
        await this.stories.update({ id: storyId }, { updatedAt: () => 'now()' });
    }

    async deleteStory(id: number): Promise<void> {
        // Role, Characters, StartingBonds and Scenes go with it through ON DELETE CASCADE.
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
}
