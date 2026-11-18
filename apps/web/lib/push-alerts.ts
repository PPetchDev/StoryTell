import { apiFetch, apiSend } from '@/lib/api';

/** Reply alerts (.scratch/push-alerts/spec.md): this device's Web Push subscription. */

export interface PushConfig {
    /** The VAPID public key, or null while alerts are off on this server (the card then hides). */
    publicKey: string | null;
}

/** This browser can take Web Push at all: a service worker, the Push API and notifications. */
export function pushSupported(): boolean {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function fetchPushConfig(): Promise<PushConfig> {
    return apiFetch<PushConfig>('/push');
}

/** The base64url key as the bytes `pushManager.subscribe` takes. */
function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
    const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const bytes = new Uint8Array(new ArrayBuffer(raw.length));
    for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
    return bytes;
}

function registration(): Promise<ServiceWorkerRegistration> {
    return navigator.serviceWorker.ready;
}

/** What the API stores: the endpoint and the two keys. */
function subscriptionBody(subscription: PushSubscription): object {
    const json = subscription.toJSON();
    return { endpoint: json.endpoint ?? subscription.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } };
}

/** This browser's subscription, if alerts are on here. */
export async function currentSubscription(): Promise<PushSubscription | null> {
    return (await registration()).pushManager.getSubscription();
}

/** Tells the API about a subscription again: after it dropped one, or another Account used this device. */
export async function storeSubscription(subscription: PushSubscription): Promise<void> {
    await apiSend<void>('PUT', '/push/subscription', subscriptionBody(subscription));
}

export type TurnOnResult = 'on' | 'denied';

/** Asks for permission, subscribes with the server's key and stores the subscription. */
export async function turnOnAlerts(publicKey: string): Promise<TurnOnResult> {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
    const { pushManager } = await registration();
    const subscription = (await pushManager.getSubscription()) ?? (await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
    try {
        await storeSubscription(subscription);
    } catch (error) {
        // Not stored: don't leave a subscription the server will never send to.
        await subscription.unsubscribe().catch(() => {});
        throw error;
    }
    return 'on';
}

/** Removes this device on the server, then in the browser. */
export async function turnOffAlerts(): Promise<void> {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await apiSend<void>('DELETE', '/push/subscription', { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
}
