import { Injectable, Logger } from '@nestjs/common';

import { AppConfig } from '../../config/app-config.js';
import { AlertsOffError, UnknownPushServiceError } from '../../errors/push.errors.js';
import { AccountModelService } from '../../model/account/account.service.js';
import { PushSubscriptionFields, PushSubscriptionModelService } from '../../model/push/push.service.js';
import { PushPayload, PushSender } from '../../service/push/push-sender.js';
import type { ReplyPart } from '../chat/turn/reply-parser.js';

/** The longest alert line; a long Chat title is cut. */
export const ALERT_BODY_MAX = 120;

/**
 * The push services the API will post to (.scratch/push-alerts/spec.md: "Endpoint check"). The API
 * itself sends to a subscription's endpoint, so any other address would let a Member make the server
 * call it.
 */
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com'];
const PUSH_HOST_SUFFIXES = ['.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com'];

export function isKnownPushEndpoint(endpoint: string): boolean {
    let url: URL;
    try {
        url = new URL(endpoint);
    } catch {
        return false;
    }
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return false;
    const host = url.hostname.toLowerCase();
    return PUSH_HOSTS.includes(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** A finished turn: its Chat, and the first Character who speaks in it (null for narration alone). */
export interface ReplyAlert {
    storyId: number;
    chatId: number;
    chatTitle: string;
    speakerName: string | null;
}

export interface SnapshotAlert {
    storyId: number;
    chatId: number;
    chatTitle: string;
}

/** The name an alert gives a reply: its first speaker's, or null when it is narration alone. */
export function firstSpeakerName(parts: readonly ReplyPart[]): string | null {
    for (const part of parts) if (part.kind === 'speech') return part.speakerName;
    return null;
}

function cut(text: string): string {
    const line = text.replace(/\s+/g, ' ').trim();
    return line.length <= ALERT_BODY_MAX ? line : `${line.slice(0, ALERT_BODY_MAX - 1)}…`;
}

/** "Nara replied · Chat 2", or "New reply · Chat 2" for narration alone. */
export function replyAlertBody(speakerName: string | null, chatTitle: string): string {
    return cut(`${speakerName ? `${speakerName} replied` : 'New reply'} · ${chatTitle}`);
}

export function snapshotAlertBody(chatTitle: string): string {
    return cut(`Snapshot ready · ${chatTitle}`);
}

function chatPayload(storyId: number, chatId: number, body: string): PushPayload {
    return { title: 'Storytell', body, url: `/stories/${storyId}/chats/${chatId}`, tag: `chat-${chatId}` };
}

/**
 * Reply alerts (.scratch/push-alerts/spec.md): this device's subscription for the current Account,
 * and the alert sent to each of that Account's devices when a turn or a Snapshot finishes. Sending
 * never throws into the work that finished, and is skipped while alerts are off.
 */
@Injectable()
export class PushAlertsManagerService {
    private readonly logger = new Logger(PushAlertsManagerService.name);
    private readonly pending = new Set<Promise<void>>();

    constructor(
        private readonly config: AppConfig,
        private readonly accounts: AccountModelService,
        private readonly subscriptions: PushSubscriptionModelService,
        private readonly sender: PushSender,
    ) {}

    /** The key a browser subscribes with, or null while alerts are off (the Settings card then hides). */
    publicKey(): string | null {
        return this.config.vapid?.publicKey ?? null;
    }

    async subscribe(fields: PushSubscriptionFields): Promise<void> {
        if (!this.config.vapid) throw new AlertsOffError();
        if (!isKnownPushEndpoint(fields.endpoint)) throw new UnknownPushServiceError();
        await this.subscriptions.upsert(this.accounts.currentId(), fields);
    }

    async unsubscribe(endpoint: string): Promise<void> {
        await this.subscriptions.removeForAccount(this.accounts.currentId(), endpoint);
    }

    /** A turn's AI Message is stored. Returns at once; the sending goes on by itself. */
    replyReady(alert: ReplyAlert): void {
        this.alert(chatPayload(alert.storyId, alert.chatId, replyAlertBody(alert.speakerName, alert.chatTitle)));
    }

    /** A Snapshot is stored. Returns at once. */
    snapshotReady(alert: SnapshotAlert): void {
        this.alert(chatPayload(alert.storyId, alert.chatId, snapshotAlertBody(alert.chatTitle)));
    }

    /** Resolves once every alert started so far is sent or given up: for tests. */
    async idle(): Promise<void> {
        while (this.pending.size > 0) await Promise.all([...this.pending]);
    }

    private alert(payload: PushPayload): void {
        if (!this.config.vapid) return;
        // Read now: the request scope names the Account whose work finished.
        const userId = this.accounts.currentId();
        // Started on the next tick, so nothing in it can throw into the turn or the Snapshot.
        const sending: Promise<void> = Promise.resolve()
            .then(() => this.sendAll(userId, payload))
            .catch((error: unknown) => this.logger.warn(`Alert for Account ${userId} failed: ${error instanceof Error ? error.message : error}`))
            .finally(() => this.pending.delete(sending));
        this.pending.add(sending);
    }

    private async sendAll(userId: number, payload: PushPayload): Promise<void> {
        const devices = await this.subscriptions.findByAccount(userId);
        await Promise.all(
            devices.map(async (device) => {
                const outcome = await this.sender.send(device, payload);
                if (outcome.kind === 'gone') {
                    await this.subscriptions.remove(device.id);
                    this.logger.log(`Account ${userId}: a device's push subscription has expired; removed it`);
                } else if (outcome.kind === 'failed') {
                    this.logger.warn(`Account ${userId}: alert not delivered: ${outcome.reason}`);
                }
            }),
        );
    }
}
