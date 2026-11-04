import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, MoreThan, Repository } from 'typeorm';

import { ChatEntity } from './entities/chat.entity.js';
import { MessagePartEntity, MessagePartKind } from './entities/message-part.entity.js';
import { BackgroundStatus, MessageEntity, MessageKind } from './entities/message.entity.js';

/** A part of an AI Message as the parser produces it, before it is stored. */
export type NewMessagePart =
    | { kind: 'narration'; text: string }
    | { kind: 'speech'; characterId: number | null; speakerName: string; text: string };

function inOrder(chat: ChatEntity): ChatEntity {
    chat.messages = [...chat.messages].sort((a, b) => a.position - b.position);
    for (const message of chat.messages) {
        message.parts = [...(message.parts ?? [])].sort((a, b) => a.position - b.position);
    }
    return chat;
}

/** Repository wrapper for Chats, their Messages and the parts of AI Messages. No rules here. */
@Injectable()
export class ChatModelService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        @InjectRepository(ChatEntity) private readonly chats: Repository<ChatEntity>,
        @InjectRepository(MessageEntity) private readonly messages: Repository<MessageEntity>,
    ) {}

    /** A Story's Chats, most recently played first. */
    findByStory(storyId: number): Promise<ChatEntity[]> {
        return this.chats.find({ where: { storyId }, order: { lastPlayedAt: 'DESC', id: 'DESC' } });
    }

    async findWithMessages(chatId: number): Promise<ChatEntity | null> {
        const chat = await this.chats.findOne({
            where: { id: chatId },
            relations: { messages: { parts: true } },
        });
        return chat && inOrder(chat);
    }

    createChat(fields: Partial<ChatEntity>): ChatEntity {
        return this.chats.create(fields);
    }

    saveChat(chat: ChatEntity): Promise<ChatEntity> {
        return this.chats.save(chat);
    }

    /** Moves every Chat on one Scene to another, or to free play when `toSceneId` is null. */
    async moveOffScene(sceneId: number, toSceneId: number | null): Promise<void> {
        await this.chats.update({ currentSceneId: sceneId }, { currentSceneId: toSceneId });
    }

    async setScene(chatIds: number[], sceneId: number): Promise<void> {
        if (chatIds.length === 0) return;
        await this.chats.update({ id: In(chatIds) }, { currentSceneId: sceneId });
    }

    async touchPlayed(chatId: number): Promise<void> {
        await this.chats.update({ id: chatId }, { lastPlayedAt: () => 'now()' });
    }

    async deleteChat(chatId: number): Promise<void> {
        // Messages and their parts go through ON DELETE CASCADE.
        await this.chats.delete({ id: chatId });
    }

    addUserMessage(
        chatId: number,
        position: number,
        text: string,
        identityName: string,
    ): Promise<MessageEntity> {
        return this.messages.save(
            this.messages.create({ chatId, position, kind: MessageKind.User, text, identityName }),
        );
    }

    /**
     * Stores an AI Message with its parts in one transaction, so a partial one never exists.
     * `background` is the status of both background calls: pending for a reply the judge and
     * the extraction will look at, null for the Opening.
     */
    addAiMessage(
        chatId: number,
        position: number,
        model: string,
        parts: NewMessagePart[],
        background: BackgroundStatus | null,
    ): Promise<MessageEntity> {
        return this.dataSource.transaction(async (manager) => {
            const message = await manager.save(
                manager.create(MessageEntity, {
                    chatId,
                    position,
                    kind: MessageKind.Ai,
                    model,
                    judgeStatus: background,
                    judgeError: null,
                    memoryStatus: background,
                    memoryError: null,
                }),
            );
            message.parts = await manager.save(partEntities(manager, message.id, parts));
            return message;
        });
    }

    findMessage(messageId: number): Promise<MessageEntity | null> {
        return this.messages.findOne({ where: { id: messageId }, relations: { parts: true } });
    }

    async setJudgeStatus(messageId: number, status: BackgroundStatus, error: string | null = null): Promise<void> {
        await this.messages.update({ id: messageId }, { judgeStatus: status, judgeError: error });
    }

    async setMemoryStatus(messageId: number, status: BackgroundStatus, error: string | null = null): Promise<void> {
        await this.messages.update({ id: messageId }, { memoryStatus: status, memoryError: error });
    }

    /**
     * Overwrites a User Message's text and deletes every Message after it, in one transaction.
     * Nothing is kept of the old text or the deleted Messages.
     */
    rewriteUserMessage(message: MessageEntity, text: string): Promise<void> {
        return this.dataSource.transaction(async (manager) => {
            await deleteAfter(manager, message);
            await manager.update(MessageEntity, { id: message.id }, { text });
        });
    }

    /**
     * Replaces an AI Message's parts and deletes every Message after it, in one transaction.
     * The Message keeps its id, model and time.
     */
    rewriteAiMessage(message: MessageEntity, parts: NewMessagePart[]): Promise<void> {
        return this.dataSource.transaction(async (manager) => {
            await deleteAfter(manager, message);
            await manager.delete(MessagePartEntity, { messageId: message.id });
            await manager.save(partEntities(manager, message.id, parts));
        });
    }

    /** Deletes every Message of the Chat; their parts go through ON DELETE CASCADE. */
    async clearMessages(chatId: number): Promise<void> {
        await this.messages.delete({ chatId });
    }
}

function deleteAfter(manager: EntityManager, message: MessageEntity): Promise<unknown> {
    return manager.delete(MessageEntity, { chatId: message.chatId, position: MoreThan(message.position) });
}

function partEntities(manager: EntityManager, messageId: number, parts: NewMessagePart[]): MessagePartEntity[] {
    return parts.map((part, index) =>
        manager.create(MessagePartEntity, {
            messageId,
            position: index,
            kind: part.kind === 'speech' ? MessagePartKind.Speech : MessagePartKind.Narration,
            characterId: part.kind === 'speech' ? part.characterId : null,
            speakerName: part.kind === 'speech' ? part.speakerName : null,
            text: part.text,
        }),
    );
}
