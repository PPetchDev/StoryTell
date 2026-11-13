import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';

import { AccountModelService } from '../account/account.service.js';
import { ReplaceRuleEntity } from './entities/replace-rule.entity.js';

/** Repository wrapper for Replace rules. `storyId` null is the app-wide scope. No rules here. */
@Injectable()
export class ReplaceRuleModelService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        @InjectRepository(ReplaceRuleEntity) private readonly rules: Repository<ReplaceRuleEntity>,
        private readonly accounts: AccountModelService,
    ) {}

    /** A scope's rules in order. */
    findByScope(storyId: number | null): Promise<ReplaceRuleEntity[]> {
        return this.rules.find({
            where: { storyId: storyId === null ? IsNull() : storyId, userId: this.accounts.currentId() },
            order: { position: 'ASC', id: 'ASC' },
        });
    }

    save(fields: Partial<ReplaceRuleEntity>): Promise<ReplaceRuleEntity> {
        return this.rules.save(this.rules.create(this.accounts.owned(fields)));
    }

    async remove(id: number): Promise<void> {
        await this.rules.delete({ id });
    }

    /** Writes positions 0..n-1 in the given order, in one transaction. */
    async setOrder(ids: number[]): Promise<void> {
        await this.dataSource.transaction(async (manager) => {
            for (const [position, id] of ids.entries()) {
                await manager.update(ReplaceRuleEntity, { id }, { position });
            }
        });
    }
}
