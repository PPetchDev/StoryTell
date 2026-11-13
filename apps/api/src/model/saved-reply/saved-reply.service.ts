import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { AccountModelService } from '../account/account.service.js';
import { SavedReplyEntity } from './entities/saved-reply.entity.js';

/** Repository wrapper for Saved replies. `storyId` null is the app-wide scope. No rules here. */
@Injectable()
export class SavedReplyModelService {
    constructor(
        @InjectRepository(SavedReplyEntity) private readonly savedReplies: Repository<SavedReplyEntity>,
        private readonly accounts: AccountModelService,
    ) {}

    /** A scope's lines in add order. */
    findByScope(storyId: number | null): Promise<SavedReplyEntity[]> {
        return this.savedReplies.find({
            where: { storyId: storyId === null ? IsNull() : storyId, userId: this.accounts.currentId() },
            order: { position: 'ASC', id: 'ASC' },
        });
    }

    save(fields: Partial<SavedReplyEntity>): Promise<SavedReplyEntity> {
        return this.savedReplies.save(this.savedReplies.create(this.accounts.owned(fields)));
    }

    async remove(id: number): Promise<void> {
        await this.savedReplies.delete({ id });
    }
}
