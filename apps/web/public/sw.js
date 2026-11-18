// Storytell AI service worker. The app is online-only: this worker caches no data and
// queues nothing. It shows the "can't connect" screen (offline.html) when a page can't be
// loaded at all, and the reply alerts the API pushes (.scratch/push-alerts/spec.md).

// v2: the new app icon (icon-192 is cached for the offline page).
// v3: offline.html no longer says the app runs on a home PC (live runs on a server).
const CACHE = 'storytell-shell-v3';
const OFFLINE_URL = '/offline.html';
const OFFLINE_ASSETS = [OFFLINE_URL, '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE)
            .then((cache) => cache.addAll(OFFLINE_ASSETS))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                // A gateway error means Tailscale serve is up but the app behind it is not.
                .then((response) => (response.status >= 502 && response.status <= 504 ? offline() : response))
                .catch(offline),
        );
        return;
    }
    if (OFFLINE_ASSETS.includes(new URL(request.url).pathname)) {
        event.respondWith(fetch(request).catch(() => caches.match(request)));
    }
    // Everything else, API calls included, goes straight to the network.
});

function offline() {
    return caches.match(OFFLINE_URL);
}

// Reply alerts: the API pushes { title, body, url, tag } when a reply or a Snapshot is ready.
// Nothing shows while a window of the app is visible on this device: the user can see it there.
// (Chrome asks for a notification per push only while no page of the site is visible.)
self.addEventListener('push', (event) => {
    event.waitUntil(showAlert(event));
});

async function showAlert(event) {
    let alert;
    try {
        alert = event.data ? event.data.json() : null;
    } catch {
        alert = null;
    }
    if (!alert || typeof alert.body !== 'string') return;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.some((client) => client.visibilityState === 'visible')) return;
    await self.registration.showNotification(alert.title || 'Storytell', {
        body: alert.body,
        tag: alert.tag,
        // A newer alert for the same Chat replaces the older one, and still buzzes.
        renotify: Boolean(alert.tag),
        icon: '/icons/icon-192.png',
        data: { url: sameOriginPath(alert.url) },
    });
}

/** Only a path of this app is opened, whatever the payload says. */
function sameOriginPath(url) {
    try {
        const target = new URL(url, self.location.origin);
        return target.origin === self.location.origin ? target.pathname + target.search : '/';
    } catch {
        return '/';
    }
}

// Tapping an alert opens its Chat: in a window of the app already open, or a new one.
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const path = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(openChat(path));
});

async function openChat(path) {
    const url = new URL(path, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (open) {
        const focused = await open.focus();
        if (focused.url !== url && 'navigate' in focused) await focused.navigate(url).catch(() => self.clients.openWindow(url));
        return;
    }
    await self.clients.openWindow(url);
}
