import { Injectable } from '@nestjs/common';

import { CantChangeOwnerError, EmailAlreadyListedError, PersonNotFoundError } from '../../errors/auth.errors.js';
import { AccountModelService } from '../../model/account/account.service.js';
import { AccountEntity, AccountRole } from '../../model/account/entities/account.entity.js';
import { UsageRecordModelService } from '../../model/usage-record/usage-record.service.js';
import { startOfMonthUtc } from '../../service/model-gateway/spend-cap.js';

/** One row of Settings → People (.scratch/accounts/spec.md). */
export interface Person {
    id: number;
    email: string;
    role: AccountRole;
    /** Null for the Owner, who has no cap. */
    monthlyCapUsd: number | null;
    disabled: boolean;
    /** Spent since the first of this month, UTC. */
    spentThisMonthUsd: number;
    /** Whether they have signed in through Supabase at least once. */
    signedInBefore: boolean;
}

/** The People list, which only the Owner manages (.scratch/accounts/spec.md: "Owner-only"). */
@Injectable()
export class PeopleManagerService {
    constructor(
        private readonly accounts: AccountModelService,
        private readonly usage: UsageRecordModelService,
    ) {}

    async list(): Promise<Person[]> {
        const [people, spent] = await Promise.all([this.accounts.listPeople(), this.usage.spentByAccountSince(startOfMonthUtc())]);
        return people.map((account) => person(account, spent.get(account.id) ?? 0));
    }

    /** Adds a Member. An email removed before comes back as a Member with the new cap, as one who must sign in again. */
    async add(email: string, monthlyCapUsd: number): Promise<Person> {
        const existing = await this.accounts.findByEmail(email);
        if (existing && !existing.removed) throw new EmailAlreadyListedError();
        const account = existing
            ? await this.accounts.save({ ...existing, removed: false, disabled: false, role: AccountRole.Member, monthlyCapUsd, supabaseId: null })
            : await this.accounts.save({ email, role: AccountRole.Member, monthlyCapUsd });
        return this.one(account);
    }

    async update(id: number, changes: { monthlyCapUsd?: number; disabled?: boolean }): Promise<Person> {
        const account = await this.member(id, changes.disabled !== undefined);
        const saved = await this.accounts.save({
            ...account,
            ...(changes.monthlyCapUsd !== undefined && account.role === AccountRole.Member ? { monthlyCapUsd: changes.monthlyCapUsd } : {}),
            ...(changes.disabled !== undefined ? { disabled: changes.disabled } : {}),
        });
        return this.one(saved);
    }

    /** They can never sign in again; what they made stays, owned by an Account no one can use. */
    async remove(id: number): Promise<void> {
        const account = await this.member(id, true);
        await this.accounts.save({ ...account, removed: true });
    }

    /** A listed Account; with `changingAccess`, never the Owner, who can't be disabled or removed. */
    private async member(id: number, changingAccess: boolean): Promise<AccountEntity> {
        const account = await this.accounts.findById(id);
        if (!account || account.removed) throw new PersonNotFoundError();
        if (changingAccess && account.role === AccountRole.Owner) throw new CantChangeOwnerError();
        return account;
    }

    private async one(account: AccountEntity): Promise<Person> {
        return person(account, await this.usage.spentSince(account.id, startOfMonthUtc()));
    }
}

function person(account: AccountEntity, spentThisMonthUsd: number): Person {
    return {
        id: account.id,
        email: account.email,
        role: account.role,
        monthlyCapUsd: account.role === AccountRole.Owner ? null : account.monthlyCapUsd,
        disabled: account.disabled,
        spentThisMonthUsd,
        signedInBefore: account.supabaseId !== null,
    };
}
