import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PushSubscriptionEntity } from './entities/push-subscription.entity.js';

/** The most devices one Account keeps alerts on for; past it, the oldest goes. */
export const PUSH_SUBSCRIPTIONS_MAX = 20;

export interface PushSubscriptionFields {
    endpoint: string;
    p256dh: string;
    auth: string;
}

/** Repository wrapper for push subscriptions. The Account is always passed in: alerts are sent from background work. */
@Injectable()
export class PushSubscriptionModelService {
    constructor(@InjectRepository(PushSubscriptionEntity) private readonly subscriptions: Repository<PushSubscriptionEntity>) {}

    /** Stores the endpoint for the Account, moving it from another Account if one held it. */
    async upsert(userId: number, fields: PushSubscriptionFields): Promise<void> {
        await this.subscriptions.upsert({ userId, ...fields, updatedAt: new Date() }, { conflictPaths: ['endpoint'] });
        const held = await this.subscriptions.find({ where: { userId }, order: { updatedAt: 'DESC', id: 'DESC' }, select: { id: true } });
        const extra = held.slice(PUSH_SUBSCRIPTIONS_MAX).map((row) => row.id);
        if (extra.length > 0) await this.subscriptions.delete(extra);
    }

    async removeForAccount(userId: number, endpoint: string): Promise<void> {
        await this.subscriptions.delete({ userId, endpoint });
    }

    findByAccount(userId: number): Promise<PushSubscriptionEntity[]> {
        return this.subscriptions.find({ where: { userId }, order: { id: 'ASC' } });
    }

    async remove(id: number): Promise<void> {
        await this.subscriptions.delete({ id });
    }
}
