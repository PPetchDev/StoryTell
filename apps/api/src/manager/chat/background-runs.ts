/** What one try of a background call came to: done, or failed with the reason to record. */
export type Attempt = { ok: true } | { ok: false; reason: string };

/** A retry waiting out its delay; `now` starts it at once, `cancel` drops it. */
interface WaitingRetry {
    now(): void;
    cancel(): void;
}

/**
 * The runs of one kind of background call (the judge, or Memory extraction), one per Chat at
 * a time (.scratch/background-retry/spec.md). A failed first try is tried once more after
 * `retryMs`, and only a failed retry is recorded; meanwhile the call reads as pending, and the
 * run a send waits on covers both tries. A send or a write that settles first runs a waiting
 * retry at once (`hurry`); a new run for the Chat drops it.
 */
export class BackgroundRuns {
    private readonly running = new Map<number, Promise<void>>();
    private readonly waiting = new Map<number, WaitingRetry>();

    constructor(private readonly retryMs: number) {}

    /**
     * Runs `attempt` and resolves once it is done or its failure recorded, through `fail`.
     * Never rejects. With `autoRetry`, a failed first try waits and runs once more first.
     */
    run(chatId: number, attempt: () => Promise<Attempt>, fail: (reason: string) => Promise<void>, autoRetry: boolean): Promise<void> {
        this.waiting.get(chatId)?.cancel();
        const work = this.tries(chatId, attempt, fail, autoRetry).finally(() => {
            if (this.running.get(chatId) === work) this.running.delete(chatId);
        });
        this.running.set(chatId, work);
        return work;
    }

    /** The run under way for the Chat, both tries included; undefined when none is. */
    current(chatId: number): Promise<void> | undefined {
        return this.running.get(chatId);
    }

    /** Starts the Chat's waiting retry now, if one is waiting. */
    hurry(chatId: number): void {
        this.waiting.get(chatId)?.now();
    }

    private async tries(chatId: number, attempt: () => Promise<Attempt>, fail: (reason: string) => Promise<void>, autoRetry: boolean): Promise<void> {
        let result = await attempt();
        if (!result.ok && autoRetry) {
            if (!(await this.waitToRetry(chatId))) return;
            result = await attempt();
        }
        if (!result.ok) await fail(result.reason);
    }

    /** Resolves true once the retry may run, or false when a new run dropped it. */
    private waitToRetry(chatId: number): Promise<boolean> {
        return new Promise((resolve) => {
            const settle = (go: boolean) => {
                clearTimeout(timer);
                if (this.waiting.get(chatId) === entry) this.waiting.delete(chatId);
                resolve(go);
            };
            const timer = setTimeout(() => settle(true), this.retryMs);
            // A waiting retry must not keep the process alive on its own.
            timer.unref?.();
            const entry: WaitingRetry = { now: () => settle(true), cancel: () => settle(false) };
            this.waiting.set(chatId, entry);
        });
    }
}
