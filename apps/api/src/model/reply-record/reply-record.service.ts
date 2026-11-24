import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ReplacedReplyEntity } from './entities/replaced-reply.entity.js';
import { RepairKind, RepairRecordEntity } from './entities/repair-record.entity.js';

/** One repair made or refused, before it has a Message to be recorded against. */
export interface RepairOutcome {
    kind: RepairKind;
    made: boolean;
}

/** The repairs of one kind and play model: how many were made, and how many weighed and refused. */
export interface RepairCount {
    kind: RepairKind;
    /** The play model that wrote the replies; null when the counts are of every model together. */
    model: string | null;
    made: number;
    refused: number;
}

/** What is kept of a replaced reply: counts only. */
export interface ReplacedReplyCounts {
    noSpeechLine: boolean;
    unknownSpeaker: boolean;
    stageDirection: boolean;
    sharedPhrase: boolean;
    words: number;
    overused: number;
}

/** The records kept about replies: the repairs the app made, and the replies the user replaced. */
@Injectable()
export class ReplyRecordModelService {
    constructor(
        @InjectRepository(RepairRecordEntity) private readonly repairs: Repository<RepairRecordEntity>,
        @InjectRepository(ReplacedReplyEntity) private readonly replaced: Repository<ReplacedReplyEntity>,
    ) {}

    /** Records a reply's repairs against the Message it became. */
    async recordRepairs(reply: { userId: number; chatId: number; messageId: number; model: string }, outcomes: readonly RepairOutcome[]): Promise<void> {
        if (outcomes.length === 0) return;
        await this.repairs.save(outcomes.map((outcome) => this.repairs.create({ ...reply, ...outcome })));
    }

    /** The repairs since `from`, by kind and play model, in that order; one Account's when `userId` is given. */
    async repairCountsSince(from: Date, userId?: number): Promise<RepairCount[]> {
        const query = this.repairs
            .createQueryBuilder('repair')
            .select('repair.kind', 'kind')
            .addSelect('repair.model', 'model')
            .addSelect('COUNT(*) FILTER (WHERE repair.made)', 'made')
            .addSelect('COUNT(*) FILTER (WHERE NOT repair.made)', 'refused')
            .where('repair.created_at >= :from', { from });
        if (userId !== undefined) query.andWhere('repair.user_id = :userId', { userId });
        const rows = await query.groupBy('repair.kind').addGroupBy('repair.model').orderBy('repair.kind').addOrderBy('repair.model').getRawMany<{ kind: RepairKind; model: string; made: string; refused: string }>();
        return rows.map((row) => ({ kind: row.kind, model: row.model, made: Number(row.made), refused: Number(row.refused) }));
    }

    /** Records what a replaced reply came to, before the reply itself is put away. */
    async recordReplaced(reply: { userId: number; chatId: number; messageId: number; model: string; writtenAt: Date }, counts: ReplacedReplyCounts): Promise<void> {
        await this.replaced.save(this.replaced.create({ ...reply, ...counts }));
    }
}
