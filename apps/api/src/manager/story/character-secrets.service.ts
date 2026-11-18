import { Injectable } from '@nestjs/common';

import { CharacterNotFoundError, StoryNotFoundError } from '../../errors/story.errors.js';
import { InvalidSecretError, SecretLimitError, SecretNotFoundError } from '../../errors/secret.errors.js';
import { BondAxis } from '../../model/ledger/bond-axes.js';
import { CharacterEntity } from '../../model/story/entities/character.entity.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { MAX_SECRETS, SECRET_TEXT_MAX, secretLevelProblem } from '../chat/secrets/secrets.js';
import { StoryDetail, StoryManagerService } from './story.service.js';

/** A change to one Secret: the fields sent change; `axis: null` clears its level. */
export interface SecretFields {
    text?: string;
    axis?: BondAxis | null;
    atLeast?: number | null;
}

/**
 * A Character's Secrets one by one, each with the Bond level it needs before the Character will
 * tell it, or none (.scratch/secret-reveals/spec.md, "API"). Each change answers the whole Story.
 */
@Injectable()
export class CharacterSecretsManagerService {
    constructor(
        private readonly storyModel: StoryModelService,
        private readonly storyManager: StoryManagerService,
    ) {}

    /** A blank Secret with no level at the end of the Character's list. */
    async add(storyId: number, characterId: number): Promise<StoryDetail> {
        const character = await this.character(storyId, characterId);
        const list = character.secretList ?? [];
        if (list.length >= MAX_SECRETS) throw new SecretLimitError(MAX_SECRETS);
        await this.storyModel.addSecret(character.id, Math.max(-1, ...list.map((secret) => secret.position)) + 1);
        return this.saved(storyId);
    }

    /** Its text, its level, or both; a level needs a feeling and a least level within its scale. */
    async update(storyId: number, characterId: number, secretId: number, fields: SecretFields): Promise<StoryDetail> {
        const character = await this.character(storyId, characterId);
        const secret = (character.secretList ?? []).find((candidate) => candidate.id === secretId);
        if (!secret) throw new SecretNotFoundError();
        if (fields.text !== undefined) {
            if (fields.text.length > SECRET_TEXT_MAX) throw new InvalidSecretError(`it is longer than ${SECRET_TEXT_MAX} characters.`);
            secret.text = fields.text;
        }
        if (fields.axis !== undefined || fields.atLeast !== undefined) {
            // Clearing the feeling clears the level with it.
            const axis = fields.axis !== undefined ? fields.axis : secret.axis;
            const atLeast = axis === null ? null : fields.atLeast !== undefined ? fields.atLeast : secret.atLeast;
            const problem = secretLevelProblem(axis, atLeast);
            if (problem) throw new InvalidSecretError(problem);
            secret.axis = axis;
            secret.atLeast = atLeast;
        }
        await this.storyModel.saveSecret(secret);
        return this.saved(storyId);
    }

    /** Removes it, and with it its reveals in every Chat of the Story. */
    async remove(storyId: number, characterId: number, secretId: number): Promise<StoryDetail> {
        const character = await this.character(storyId, characterId);
        if (!(character.secretList ?? []).some((secret) => secret.id === secretId)) throw new SecretNotFoundError();
        await this.storyModel.removeSecret(secretId);
        return this.saved(storyId);
    }

    private async character(storyId: number, characterId: number): Promise<CharacterEntity> {
        const story = await this.storyModel.findFull(storyId);
        if (!story) throw new StoryNotFoundError();
        const character = story.characters.find((candidate) => candidate.id === characterId);
        if (!character) throw new CharacterNotFoundError();
        return character;
    }

    private async saved(storyId: number): Promise<StoryDetail> {
        await this.storyModel.touch(storyId);
        return this.storyManager.getStory(storyId);
    }
}
