import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum AccountRole {
    Owner = 'owner',
    Member = 'member',
}

/**
 * One person who can sign in (.scratch/accounts/spec.md: "Account table"). Exactly one Owner. A
 * removed Member keeps the row, so what they made stays owned, but can never sign in again.
 */
@Entity('app_user')
export class AccountEntity {
    @PrimaryGeneratedColumn()
    id: number;

    /** Stored lowercase; the People list is matched on it. */
    @Column({ type: 'text', unique: true })
    email: string;

    /** The Supabase user id, bound at the first Supabase sign-in. */
    @Column({ name: 'supabase_id', type: 'uuid', nullable: true, unique: true })
    supabaseId: string | null;

    @Column({ type: 'text' })
    role: AccountRole;

    /** A Member's Monthly cap in USD; null for the Owner, who has none. */
    @Column({ name: 'monthly_cap_usd', type: 'real', nullable: true })
    monthlyCapUsd: number | null;

    @Column({ type: 'boolean', default: false })
    disabled: boolean;

    @Column({ type: 'boolean', default: false })
    removed: boolean;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    /** Whether it may sign in and be used for a request. */
    get active(): boolean {
        return !this.disabled && !this.removed;
    }
}
