/** What one alert carries (.scratch/push-alerts/spec.md: "Payload"). Never story text. */
export interface PushPayload {
    title: string;
    body: string;
    /** The Chat to open, an app path. */
    url: string;
    /** A newer alert with the same tag replaces the older one. */
    tag: string;
}

export interface PushTarget {
    endpoint: string;
    p256dh: string;
    auth: string;
}

/**
 * How one send went: delivered to the push service, `gone` (404 or 410: the subscription is dead and
 * is deleted), or `failed` for anything else, which keeps the subscription.
 */
export type PushOutcome = { kind: 'sent' } | { kind: 'gone' } | { kind: 'failed'; reason: string };

/** The seam to the push services: Web Push with VAPID for real, a recorder in tests and e2e. Never throws. */
export abstract class PushSender {
    abstract send(target: PushTarget, payload: PushPayload): Promise<PushOutcome>;
}

/** A stale alert is worse than none. */
export const PUSH_TTL_SECONDS = 60 * 60;
