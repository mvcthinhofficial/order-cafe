// Simple Service Worker for PWA installation support
const CACHE_NAME = 'th-pos-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/vite.svg',
    '/logo.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Let the browser handle standard requests, this is just to satisfy PWA criteria
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});
