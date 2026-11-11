import { Injectable } from '@nestjs/common';

import { ChatNotFoundError, EmptyMemoryError, MemoryNotFoundError } from '../../../errors/chat.errors.js';
import { StoryNotFoundError } from '../../../errors/story.errors.js';
import { ChatModelService } from '../../../model/chat/chat.service.js';
import { ChatEntity } from '../../../model/chat/entities/chat.entity.js';
import { MemoriesUsed, MessageKind } from '../../../model/chat/entities/message.entity.js';
import { MemoryAuthor, MemoryEntity, MemoryResponse } from '../../../model/memory/entities/memory.entity.js';
import { BeliefModelService } from '../../../model/memory/belief.service.js';
import { BeliefResponse } from '../../../model/memory/entities/belief.entity.js';
import { MemoryModelService } from '../../../model/memory/memory.service.js';
import { beliefResponses } from './beliefs.js';
import { StoryEntity } from '../../../model/story/entities/story.entity.js';
import { StoryModelService } from '../../../model/story/story.service.js';
import { wornIdentity } from '../identity.js';
import { MemoryEmbeddingManagerService } from './memory-embedding.service.js';
import { choiceMemories, memoriesInPlayOf } from './chat-memory-choice.js';
import { lockedOverHalf } from './memory-choice.js';
import { presentCharacters } from './present.js';

/** The Memory drawer's data: every Memory, plus what it needs to render and add one. */
export interface MemoryList {
    chatId: number;
    storyId: number;
    /** The worn identity's name, which the client renders `{user}` as. */
    identityName: string;
    /** The cast, in order, for Known-by chips and the add form. */
    cast: Array<{ id: number; name: string }>;
    /**
     * The Characters present in the latest exchange: a hand-added Memory is known by these. Never
     * one sitting out (.scratch/speaker-controls/spec.md), though the user may still tick them.
     */
    present: number[];
    /** Active and archived, oldest first. */
    memories: MemoryResponse[];
    /** Every Belief, given-up ones included, oldest first (.scratch/memory-by-meaning/spec.md, "In the Memory drawer"). */
    beliefs: BeliefResponse[];
    /** What the last turn sent (.scratch/memory-by-meaning/spec.md: "Used last turn"), shown as "In play". */
    inPlay: MemoriesUsed;
    /** Spec: "The locked warning": the locked Memories alone take more than half the Memory budget. */
    lockedWarning: boolean;
}

/**
 * The user's own Memory actions (spec: "User actions"), none tied to a Message and none
 * rolled back by an edit: add (known by the Characters present), edit (which locks), delete,
 * and restore from Archived (which locks). Extraction's changes are the ledger's business.
 */
@Injectable()
export class MemoryManagerService {
    constructor(
        private readonly storyModel: StoryModelService,
        private readonly chatModel: ChatModelService,
        private readonly memoryModel: MemoryModelService,
        private readonly memoryEmbedding: MemoryEmbeddingManagerService,
        private readonly beliefModel: BeliefModelService,
    ) {}

    async list(storyId: number, chatId: number): Promise<MemoryList> {
        const { story, chat } = await this.load(storyId, chatId);
        return this.listOf(story, chat);
    }

    /** Spec: "add, known by the Characters present at the time". A hand-written Memory is locked. */
    async add(storyId: number, chatId: number, text: string, knownBy?: number[]): Promise<MemoryResponse> {
        if (text.trim() === '') throw new EmptyMemoryError();
        const { story, chat } = await this.load(storyId, chatId);
        const memory = await this.memoryModel.create({
            chatId: chat.id,
            text: text.trim(),
            knownBy: knownBy ? this.castIds(story, knownBy) : present(story, chat),
            writtenBy: MemoryAuthor.User,
            locked: true,
            archived: false,
            messageId: null,
        });
        // Found by meaning from the next turn on (.scratch/memory-by-meaning/spec.md); a failure leaves it unembedded.
        await this.memoryEmbedding.embedSaved(story.id, chat.id, [memory.id]);
        return memory.toResponse(castOrder(story));
    }

    /** Spec: "edit, which locks". The text and the Known-by set can both be changed; new text is the user's. */
    async edit(storyId: number, chatId: number, memoryId: number, fields: { text?: string; knownBy?: number[] }): Promise<MemoryResponse> {
        const { story, chat } = await this.load(storyId, chatId);
        const memory = await this.find(chat, memoryId);
        const text = fields.text === undefined ? memory.text : fields.text.trim();
        if (text === '') throw new EmptyMemoryError();
        await this.memoryModel.update(memory, {
            text,
            knownBy: fields.knownBy ? this.castIds(story, fields.knownBy) : memory.knownByIds(),
            writtenBy: text === memory.text ? memory.writtenBy : MemoryAuthor.User,
            locked: true,
            archived: memory.archived,
        });
        if (text !== memory.text) await this.memoryEmbedding.embedSaved(story.id, chat.id, [memory.id]);
        return (await this.find(chat, memoryId)).toResponse(castOrder(story));
    }

    async remove(storyId: number, chatId: number, memoryId: number): Promise<void> {
        const { chat } = await this.load(storyId, chatId);
        const memory = await this.find(chat, memoryId);
        await this.memoryModel.remove(memory.id);
    }

    /** Spec: "restore from Archived, which locks". */
    async restore(storyId: number, chatId: number, memoryId: number): Promise<MemoryResponse> {
        const { story, chat } = await this.load(storyId, chatId);
        const memory = await this.find(chat, memoryId);
        await this.memoryModel.update(memory, {
            text: memory.text,
            knownBy: memory.knownByIds(),
            writtenBy: memory.writtenBy,
            locked: true,
            archived: false,
        });
        return (await this.find(chat, memoryId)).toResponse(castOrder(story));
    }

    /** The locked warning's "Unlock some you no longer need" (.scratch/memory-by-meaning/spec.md): the AI may change it again. */
    async unlock(storyId: number, chatId: number, memoryId: number): Promise<MemoryResponse> {
        const { story, chat } = await this.load(storyId, chatId);
        const memory = await this.find(chat, memoryId);
        await this.memoryModel.update(memory, {
            text: memory.text,
            knownBy: memory.knownByIds(),
            writtenBy: memory.writtenBy,
            locked: false,
            archived: memory.archived,
        });
        return (await this.find(chat, memoryId)).toResponse(castOrder(story));
    }

    private async listOf(story: StoryEntity, chat: ChatEntity): Promise<MemoryList> {
        const [memories, beliefs] = await Promise.all([this.memoryModel.findByChat(chat.id), this.beliefModel.findByChat(chat.id)]);
        return {
            chatId: chat.id,
            storyId: story.id,
            identityName: wornIdentity(story, chat).name,
            cast: story.characters.map((character) => ({ id: character.id, name: character.name })),
            present: present(story, chat),
            memories: memories.map((memory) => memory.toResponse(castOrder(story))),
            beliefs: beliefResponses(beliefs, chat),
            inPlay: memoriesInPlayOf(chat),
            lockedWarning: lockedOverHalf(choiceMemories(story, memories)),
        };
    }

    private async find(chat: ChatEntity, memoryId: number): Promise<MemoryEntity> {
        const memory = await this.memoryModel.findOne(chat.id, memoryId);
        if (!memory) throw new MemoryNotFoundError();
        return memory;
    }

    /** Only ids of this Story's cast; the rest are dropped. */
    private castIds(story: StoryEntity, ids: number[]): number[] {
        return story.characters.filter((character) => ids.includes(character.id)).map((character) => character.id);
    }

    private async load(storyId: number, chatId: number): Promise<{ story: StoryEntity; chat: ChatEntity }> {
        const story = await this.storyModel.findFull(storyId);
        if (!story) throw new StoryNotFoundError();
        const chat = await this.chatModel.findWithMessages(chatId);
        if (!chat || chat.storyId !== storyId) throw new ChatNotFoundError();
        return { story, chat };
    }
}

function castOrder(story: StoryEntity): number[] {
    return story.characters.map((character) => character.id);
}

/**
 * The Characters present in the latest exchange: the last User Message and the reply after it, if
 * any. Those sitting out are never present, the "everyone" fallback included.
 */
function present(story: StoryEntity, chat: ChatEntity): number[] {
    const sittingOut = chat.sittingOutIds();
    const cast = story.characters
        .filter((character) => !sittingOut.includes(character.id))
        .map((character) => ({ id: character.id, name: character.name }));
    const last = chat.messages[chat.messages.length - 1];
    if (!last) return cast.map((member) => member.id);
    const reply = last.kind === MessageKind.Ai ? last : null;
    const user = reply ? chat.messages[chat.messages.length - 2] : last;
    const userText = user?.kind === MessageKind.User ? (user.text ?? '') : '';
    return presentCharacters(cast, userText, reply ? reply.parts.map((part) => part.toResponse()) : []).map((member) => member.id);
}
