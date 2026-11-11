import { Injectable } from '@nestjs/common';

import { BeliefNotFoundError, ChatNotFoundError, EmptyBeliefError, MemoryNotFoundError } from '../../../errors/chat.errors.js';
import { CharacterNotFoundError, StoryNotFoundError } from '../../../errors/story.errors.js';
import { ChatModelService } from '../../../model/chat/chat.service.js';
import { ChatEntity } from '../../../model/chat/entities/chat.entity.js';
import { BeliefModelService } from '../../../model/memory/belief.service.js';
import { BeliefAuthor, BeliefEntity, BeliefResponse } from '../../../model/memory/entities/belief.entity.js';
import { MemoryModelService } from '../../../model/memory/memory.service.js';
import { StoryEntity } from '../../../model/story/entities/story.entity.js';
import { StoryModelService } from '../../../model/story/story.service.js';
import { beliefResponses } from './beliefs.js';

export interface NewBeliefFields {
    characterId: number;
    text: string;
    contradictsMemoryId?: number | null;
}

export interface BeliefFields {
    characterId?: number;
    text?: string;
    /** null takes the link off; left out, it stays. */
    contradictsMemoryId?: number | null;
}

/**
 * The user's own Belief actions (.scratch/memory-by-meaning/spec.md, "In the Memory drawer"): add,
 * edit and delete. Like the user's Memory actions they are tied to no Message, so no rollback
 * undoes them; the extraction's changes are the ledger's business. New text is the user's.
 */
@Injectable()
export class BeliefManagerService {
    constructor(
        private readonly storyModel: StoryModelService,
        private readonly chatModel: ChatModelService,
        private readonly memoryModel: MemoryModelService,
        private readonly beliefModel: BeliefModelService,
    ) {}

    async add(storyId: number, chatId: number, fields: NewBeliefFields): Promise<BeliefResponse> {
        const text = fields.text.trim();
        if (text === '') throw new EmptyBeliefError();
        const { story, chat } = await this.load(storyId, chatId);
        this.requireCast(story, fields.characterId);
        const contradicts = await this.contradicts(chat, fields.contradictsMemoryId ?? null);
        const belief = await this.beliefModel.create({
            chatId: chat.id,
            characterId: fields.characterId,
            text,
            contradictsMemoryId: contradicts,
            writtenBy: BeliefAuthor.User,
            messageId: null,
        });
        return this.respond(chat, belief.id);
    }

    async edit(storyId: number, chatId: number, beliefId: number, fields: BeliefFields): Promise<BeliefResponse> {
        const { story, chat } = await this.load(storyId, chatId);
        const belief = await this.find(chat, beliefId);
        const text = fields.text === undefined ? belief.text : fields.text.trim();
        if (text === '') throw new EmptyBeliefError();
        if (fields.characterId !== undefined) this.requireCast(story, fields.characterId);
        const contradicts = fields.contradictsMemoryId === undefined ? belief.contradictsMemoryId : await this.contradicts(chat, fields.contradictsMemoryId);
        await this.beliefModel.update(belief.id, {
            characterId: fields.characterId ?? belief.characterId,
            text,
            contradictsMemoryId: contradicts,
            writtenBy: text === belief.text ? belief.writtenBy : BeliefAuthor.User,
        });
        return this.respond(chat, belief.id);
    }

    async remove(storyId: number, chatId: number, beliefId: number): Promise<void> {
        const { chat } = await this.load(storyId, chatId);
        await this.beliefModel.remove((await this.find(chat, beliefId)).id);
    }

    private async respond(chat: ChatEntity, beliefId: number): Promise<BeliefResponse> {
        return beliefResponses([await this.find(chat, beliefId)], chat)[0];
    }

    private async find(chat: ChatEntity, beliefId: number): Promise<BeliefEntity> {
        const belief = await this.beliefModel.findOne(chat.id, beliefId);
        if (!belief) throw new BeliefNotFoundError();
        return belief;
    }

    /** A Belief is held by one of this Story's Characters. */
    private requireCast(story: StoryEntity, characterId: number): void {
        if (!story.characters.some((character) => character.id === characterId)) throw new CharacterNotFoundError();
    }

    /** The Memory a Belief contradicts must be one of this Chat's; null for none. */
    private async contradicts(chat: ChatEntity, memoryId: number | null): Promise<number | null> {
        if (memoryId === null) return null;
        if (!(await this.memoryModel.findOne(chat.id, memoryId))) throw new MemoryNotFoundError();
        return memoryId;
    }

    private async load(storyId: number, chatId: number): Promise<{ story: StoryEntity; chat: ChatEntity }> {
        const story = await this.storyModel.findFull(storyId);
        if (!story) throw new StoryNotFoundError();
        const chat = await this.chatModel.findWithMessages(chatId);
        if (!chat || chat.storyId !== storyId) throw new ChatNotFoundError();
        return { story, chat };
    }
}
