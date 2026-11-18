import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ChatRecapEntity } from './entities/chat-recap.entity.js';

export interface NewRecap {
    chatId: number;
    messageId: number;
    fingerprint: string;
    text: string;
}

/** The Chats' "Previously on…" Recaps (.scratch/previously-on/spec.md): one row per Chat at most. */
@Injectable()
export class RecapModelService {
    constructor(@InjectRepository(ChatRecapEntity) private readonly recaps: Repository<ChatRecapEntity>) {}

    findByChat(chatId: number): Promise<ChatRecapEntity | null> {
        return this.recaps.findOne({ where: { chatId } });
    }

    /** Stores the Chat's Recap in place of any before it, not dismissed. */
    async save(recap: NewRecap): Promise<ChatRecapEntity> {
        await this.recaps.upsert(
            { chatId: recap.chatId, messageId: recap.messageId, fingerprint: recap.fingerprint, text: recap.text, dismissedAt: null, createdAt: new Date() },
            { conflictPaths: ['chatId'] },
        );
        return (await this.findByChat(recap.chatId))!;
    }

    async dismiss(id: number): Promise<void> {
        await this.recaps.update({ id }, { dismissedAt: new Date() });
    }

    async delete(id: number): Promise<void> {
        await this.recaps.delete({ id });
    }
}
