import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, In, Repository } from 'typeorm';

import { ChatEntity } from '../chat/entities/chat.entity.js';
import { MessageEntity } from '../chat/entities/message.entity.js';
import { StoryEntity } from '../story/entities/story.entity.js';
import { SnapshotCharacterEntity } from './entities/snapshot-character.entity.js';
import { SnapshotEntity } from './entities/snapshot.entity.js';

export interface NewSnapshot {
    storyId: number;
    chatId: number | null;
    messageId: number | null;
    imagePath: string;
    prompt: string;
    hint: string;
    imageModel: string;
    costUsd: number;
    /** In frame order. */
    characters: Array<{ characterId: number | null; name: string }>;
}

/** Repository wrapper for Snapshots and the Characters drawn in them. No rules here. */
@Injectable()
export class SnapshotModelService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        @InjectRepository(SnapshotEntity) private readonly snapshots: Repository<SnapshotEntity>,
    ) {}

    /**
     * Stores a Snapshot with its Characters in one transaction. A Chat or Message that went
     * while the image was made is stored as no link, the way it would have been cleared had
     * the Snapshot been there first. Null when the Story itself is gone.
     */
    create(fields: NewSnapshot): Promise<SnapshotEntity | null> {
        return this.dataSource.transaction(async (manager) => {
            if (!(await manager.existsBy(StoryEntity, { id: fields.storyId }))) return null;
            const chatId =
                fields.chatId !== null && (await manager.existsBy(ChatEntity, { id: fields.chatId })) ? fields.chatId : null;
            const messageId =
                chatId !== null &&
                fields.messageId !== null &&
                (await manager.existsBy(MessageEntity, { id: fields.messageId, chatId }))
                    ? fields.messageId
                    : null;
            const snapshot = await manager.save(
                manager.create(SnapshotEntity, {
                    storyId: fields.storyId,
                    chatId,
                    messageId,
                    imagePath: fields.imagePath,
                    prompt: fields.prompt,
                    hint: fields.hint,
                    imageModel: fields.imageModel,
                    costUsd: fields.costUsd,
                }),
            );
            snapshot.characters = await manager.save(
                fields.characters.map((character, position) =>
                    manager.create(SnapshotCharacterEntity, {
                        snapshotId: snapshot.id,
                        position,
                        characterId: character.characterId,
                        characterName: character.name,
                    }),
                ),
            );
            return snapshot;
        });
    }

    /** A Story's Gallery, newest first; only one Chat's when `chatId` is given. */
    findByStory(storyId: number, chatId?: number): Promise<SnapshotEntity[]> {
        const where: FindOptionsWhere<SnapshotEntity> = chatId === undefined ? { storyId } : { storyId, chatId };
        return this.snapshots.find({ where, relations: { characters: true }, order: { createdAt: 'DESC', id: 'DESC' } });
    }

    /** The Snapshots still under a Message of the Chat, oldest first, as the timeline shows them. */
    findLinkedByChat(chatId: number, messageIds: number[]): Promise<SnapshotEntity[]> {
        if (messageIds.length === 0) return Promise.resolve([]);
        return this.snapshots.find({
            where: { chatId, messageId: In(messageIds) },
            relations: { characters: true },
            order: { createdAt: 'ASC', id: 'ASC' },
        });
    }

    findOne(storyId: number, snapshotId: number): Promise<SnapshotEntity | null> {
        return this.snapshots.findOne({ where: { id: snapshotId, storyId }, relations: { characters: true } });
    }

    async remove(snapshotId: number): Promise<void> {
        await this.snapshots.delete({ id: snapshotId });
    }

    /** Every image file of a Story's Gallery, so they can be deleted with the Story. */
    async imagePathsByStory(storyId: number): Promise<string[]> {
        const rows = await this.snapshots.find({ where: { storyId }, select: { id: true, imagePath: true } });
        return rows.map((row) => row.imagePath);
    }

    /** The Snapshots stay in the Gallery, marked "from an earlier version of this Chat". */
    async clearMessageLinks(messageIds: number[]): Promise<void> {
        if (messageIds.length === 0) return;
        await this.snapshots.update({ messageId: In(messageIds) }, { messageId: null });
    }
}
