// Storytell AI service worker. The app is online-only: this worker caches no data and
// queues nothing. Its one job is to show the "can't connect" screen (offline.html) when a
// page can't be loaded at all, for example when the home PC is off.

const CACHE = 'storytell-shell-v1';
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
