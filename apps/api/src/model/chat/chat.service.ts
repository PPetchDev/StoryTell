import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { ChatEntity } from './entities/chat.entity.js';
import { MessagePartEntity, MessagePartKind } from './entities/message-part.entity.js';
import { MessageEntity, MessageKind } from './entities/message.entity.js';

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

    /** Stores an AI Message with its parts in one transaction, so a partial one never exists. */
    addAiMessage(
        chatId: number,
        position: number,
        model: string,
        parts: NewMessagePart[],
    ): Promise<MessageEntity> {
        return this.dataSource.transaction(async (manager) => {
            const message = await manager.save(
                manager.create(MessageEntity, { chatId, position, kind: MessageKind.Ai, model }),
            );
            message.parts = await manager.save(
                parts.map((part, index) =>
                    manager.create(MessagePartEntity, {
                        messageId: message.id,
                        position: index,
                        kind: part.kind === 'speech' ? MessagePartKind.Speech : MessagePartKind.Narration,
                        characterId: part.kind === 'speech' ? part.characterId : null,
                        speakerName: part.kind === 'speech' ? part.speakerName : null,
                        text: part.text,
                    }),
                ),
            );
            return message;
        });
    }
}
