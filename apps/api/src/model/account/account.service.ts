import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppConfig } from '../../config/app-config.js';
import { AccountEntity, AccountRole } from './entities/account.entity.js';
import { requestScope } from './request-scope.js';

/** Repository wrapper for Accounts, and the Account the current work runs as. */
@Injectable()
export class AccountModelService implements OnModuleInit {
    private ownerAccount: AccountEntity | null = null;
    private readonly logger = new Logger(AccountModelService.name);

    constructor(
        @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
        private readonly config: AppConfig,
    ) {}

    /** The migration made the Owner; `OWNER_EMAIL` names it. */
    async onModuleInit(): Promise<void> {
        this.ownerAccount = await this.accounts.findOneByOrFail({ role: AccountRole.Owner });
        if (this.config.ownerEmail) await this.nameOwner(this.config.ownerEmail);
    }

    /**
     * Gives the Owner this email, unless another Account (even a removed one) holds it already:
     * then the Owner keeps theirs and the API still starts.
     */
    async nameOwner(email: string): Promise<void> {
        const wanted = email.trim().toLowerCase();
        const owner = this.owner;
        if (owner.email === wanted) return;
        const holder = await this.findByEmail(wanted);
        if (holder && holder.id !== owner.id) {
            this.logger.warn(`OWNER_EMAIL ${wanted} belongs to another Account; the Owner keeps ${owner.email}`);
            return;
        }
        owner.email = wanted;
        this.ownerAccount = await this.accounts.save(owner);
    }

    get owner(): AccountEntity {
        if (!this.ownerAccount) throw new Error('The Owner Account is read at start-up');
        return this.ownerAccount;
    }

    /**
     * The Account the current request runs as, or the Owner for work no request started (boot-time
     * backfills) and while sign-in is off.
     */
    current(): AccountEntity {
        return requestScope.getStore()?.account ?? this.owner;
    }

    currentId(): number {
        return this.current().id;
    }

    /**
     * The fields of a row about to be saved, owned by the current Account when it is a new row
     * that names no owner. An update (it has an id) is left alone, so saving never moves a row.
     */
    owned<T extends { id?: number; userId?: number }>(fields: T): T {
        if (fields.id !== undefined || fields.userId !== undefined) return fields;
        return { ...fields, userId: this.currentId() };
    }

    findById(id: number): Promise<AccountEntity | null> {
        return this.accounts.findOneBy({ id });
    }

    findByEmail(email: string): Promise<AccountEntity | null> {
        return this.accounts.findOneBy({ email: email.trim().toLowerCase() });
    }

    findBySupabaseId(supabaseId: string): Promise<AccountEntity | null> {
        return this.accounts.findOneBy({ supabaseId });
    }

    /** Every Account that isn't removed, the Owner first. */
    listPeople(): Promise<AccountEntity[]> {
        return this.accounts.find({ where: { removed: false }, order: { id: 'ASC' } });
    }

    save(account: Partial<AccountEntity>): Promise<AccountEntity> {
        return this.accounts.save(this.accounts.create({ ...account, email: account.email?.trim().toLowerCase() }));
    }
}
