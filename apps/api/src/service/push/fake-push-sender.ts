import { PushOutcome, PushPayload, PushSender, PushTarget } from './push-sender.js';

export interface FakePushSend {
    endpoint: string;
    payload: PushPayload;
    outcome: PushOutcome['kind'];
}

/**
 * Records each send and reaches no network: tests and e2e (`MODEL_GATEWAY=fake`). An endpoint can be
 * scripted to answer `gone` or `failed`; every other send is `sent`.
 */
export class FakePushSender extends PushSender {
    readonly sends: FakePushSend[] = [];
    private readonly scripted = new Map<string, PushOutcome>();
    private waiters: Array<{ count: number; resolve: () => void }> = [];

    async send(target: PushTarget, payload: PushPayload): Promise<PushOutcome> {
        const outcome = this.scripted.get(target.endpoint) ?? { kind: 'sent' };
        this.sends.push({ endpoint: target.endpoint, payload, outcome: outcome.kind });
        this.waiters = this.waiters.filter((waiter) => {
            if (this.sends.length < waiter.count) return true;
            waiter.resolve();
            return false;
        });
        return outcome;
    }

    answer(endpoint: string, outcome: PushOutcome): void {
        this.scripted.set(endpoint, outcome);
    }

    /** Resolves once at least `count` sends were made. */
    sent(count: number): Promise<void> {
        if (this.sends.length >= count) return Promise.resolve();
        return new Promise((resolve) => this.waiters.push({ count, resolve }));
    }

    reset(): void {
        this.sends.length = 0;
        this.scripted.clear();
    }
}
