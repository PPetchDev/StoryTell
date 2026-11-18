import webpush from 'web-push';

import { VapidConfig } from '../../config/app-config.js';
import { PUSH_TTL_SECONDS, PushOutcome, PushPayload, PushSender, PushTarget } from './push-sender.js';

/** Sends through the `web-push` package: payload encrypted for the subscription, signed with the VAPID pair. */
export class WebPushSender extends PushSender {
    constructor(private readonly vapid: VapidConfig) {
        super();
    }

    async send(target: PushTarget, payload: PushPayload): Promise<PushOutcome> {
        try {
            await webpush.sendNotification(
                { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
                JSON.stringify(payload),
                {
                    vapidDetails: this.vapid,
                    TTL: PUSH_TTL_SECONDS,
                    // So Android hands it over in Doze.
                    urgency: 'high',
                    timeout: 15_000,
                },
            );
            return { kind: 'sent' };
        } catch (error) {
            const status = error instanceof webpush.WebPushError ? error.statusCode : undefined;
            if (status === 404 || status === 410) return { kind: 'gone' };
            return { kind: 'failed', reason: status ? `push service answered ${status}` : error instanceof Error ? error.message : String(error) };
        }
    }
}
