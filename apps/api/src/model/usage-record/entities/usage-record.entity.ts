import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { decimalColumn } from '../../../store/db/decimal.js';

import type { CallKind, CreditPool } from '../../../service/model-gateway/model-gateway.js';

/**
 * One row per model call the gateway made (spec: "UsageRecord"). `storyId` and `chatId` are
 * plain references, not foreign keys: a record outlives the Story or Chat it served, and
 * the monthly spend must still count it.
 */
@Entity('usage_record')
export class UsageRecordEntity {
    @PrimaryGeneratedColumn()
    id: number;

    /** The Account it belongs to (.scratch/accounts/spec.md: "Ownership"). */
    @Column({ name: 'user_id', type: 'integer' })
    userId: number;

    @Index()
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @Column({ type: 'text' })
    kind: CallKind;

    @Column({ type: 'text' })
    pool: CreditPool;

    @Column({ type: 'text' })
    model: string;

    @Column({ type: 'text' })
    host: string;

    @Column({ name: 'prompt_tokens', type: 'integer', nullable: true })
    promptTokens: number | null;

    @Column({ name: 'completion_tokens', type: 'integer', nullable: true })
    completionTokens: number | null;

    @Column({ type: 'integer', nullable: true })
    images: number | null;

    /** Characters sent, for speech (Read aloud and voice samples); null for every other kind. */
    @Column({ type: 'integer', nullable: true })
    characters: number | null;

    @Column({ name: 'cost_usd', ...decimalColumn(12, 6) })
    costUsd: number;

    @Column({ name: 'story_id', type: 'integer', nullable: true })
    storyId: number | null;

    @Column({ name: 'chat_id', type: 'integer', nullable: true })
    chatId: number | null;
}
