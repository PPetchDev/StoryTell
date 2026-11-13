import { MonthlyCapReachedError, TooManyCallsAtOnceError } from '../../errors/auth.errors.js';
import type { AccountModelService } from '../../model/account/account.service.js';
import { AccountRole } from '../../model/account/entities/account.entity.js';
import type { UsageRecordModelService } from '../../model/usage-record/usage-record.service.js';
import type { CallKind } from './model-gateway.js';

/**
 * The calls a turn already sent makes on its own (.scratch/accounts/spec.md: "Monthly cap"): the
 * Judge, Memory, Story so far and the searches that build its prompt. Never refused, so a Chat
 * never breaks halfway; the next send is refused instead.
 */
export const BACKGROUND_KINDS: ReadonlySet<CallKind> = new Set<CallKind>([
    'judge',
    'memory_extraction',
    'story_summary',
    'memory_embedding',
    'context_search',
    'document_search',
]);

/** The first moment of the next calendar month, UTC: when a Monthly cap starts again. */
export function startOfNextMonthUtc(now = new Date()): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** The first moment of the current calendar month, UTC: where a Monthly cap starts counting. */
export function startOfMonthUtc(now = new Date()): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * A turn's own call. Every send, retry, continue and regenerate checks the cap before the user's
 * Message is saved (`requireSendable`), so the call is let through here: refusing it would leave a
 * saved Message with no reply.
 */
const CHECKED_AT_THE_SEND: ReadonlySet<CallKind> = new Set<CallKind>(['turn']);

/**
 * A Member's paid calls running at once. Spend is recorded when a call finishes, so without a limit
 * many requests fired together would all pass the cap check. A Reference image round draws 3 at once.
 */
export const MEMBER_CALLS_AT_ONCE = 4;

/** Whether the current Account may make another paid call (.scratch/accounts/spec.md: "Monthly cap"). */
export class SpendCap {
    /** Paid calls running now, per Member. */
    private readonly running = new Map<number, number>();

    constructor(
        private readonly accounts: AccountModelService,
        private readonly usage: UsageRecordModelService,
    ) {}

    /**
     * Runs a paid call as the current Account: a Member's is refused at their cap, or when too many
     * of theirs already run. Background calls and a turn's own call skip the cap, never the count.
     */
    async run<T>(kind: CallKind, call: () => Promise<T>): Promise<T> {
        const account = this.accounts.current();
        if (account.role === AccountRole.Owner || account.monthlyCapUsd === null) return call();
        const background = BACKGROUND_KINDS.has(kind);
        if (!background && !CHECKED_AT_THE_SEND.has(kind)) await this.assertUnderCap();
        if (background) return call();
        const now = this.running.get(account.id) ?? 0;
        if (now >= MEMBER_CALLS_AT_ONCE) throw new TooManyCallsAtOnceError();
        this.running.set(account.id, now + 1);
        try {
            return await call();
        } finally {
            const left = (this.running.get(account.id) ?? 1) - 1;
            if (left <= 0) this.running.delete(account.id);
            else this.running.set(account.id, left);
        }
    }

    /** Throws `MonthlyCapReachedError` when the current Account is a Member at or past their cap. The Owner has none. */
    async assertUnderCap(now = new Date()): Promise<void> {
        const account = this.accounts.current();
        if (account.role === AccountRole.Owner || account.monthlyCapUsd === null) return;
        const spent = await this.usage.spentSince(account.id, startOfMonthUtc(now));
        if (spent >= account.monthlyCapUsd) throw new MonthlyCapReachedError(account.monthlyCapUsd, startOfNextMonthUtc(now));
    }

}
