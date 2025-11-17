const CACHE_NAME = 'aic-todo-cache-v1';
const DYNAMIC_CACHE_NAME = 'dynamic-cache-v1';
const APP_SHELL_URLS = [
    './', // Alias untuk index atau root
    'todo-pwa.html' // Halaman HTML utama
];
const API_ENDPOINT = 'https://script.google.com/macros/s/';

// 1. Install Event: Cache App Shell
self.addEventListener('install', event => {
    console.log('[SW] Install');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching App Shell');
                // Kita hanya meng-cache halaman HTML utama.
                // Aset dinamis (Tailwind, Font) akan di-cache saat diminta (di event 'fetch').
                return cache.addAll(APP_SHELL_URLS);
            })
    );
});

// 2. Activate Event: Clean up old caches
self.addEventListener('activate', event => {
    console.log('[SW] Activate');
    const cacheWhitelist = [CACHE_NAME, DYNAMIC_CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// 3. Fetch Event: Intercept network requests
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // --- Strategi 1: Network Only (untuk API Calls) ---
    // Jangan cache permintaan API (terutama POST).
    // Biarkan aplikasi (HTML/JS) menangani logika offline/online untuk API.
    if (url.href.startsWith(API_ENDPOINT) || event.request.method !== 'GET') {
        event.respondWith(fetch(event.request));
        return;
    }

    // --- Strategi 2: Cache First (untuk App Shell) ---
    // Coba ambil dari cache dulu. Jika tidak ada, baru ke network.
    // Ini bagus untuk file yang tidak berubah (todo-pwa.html).
    if (APP_SHELL_URLS.includes(url.pathname) || url.pathname === '/') {
        event.respondWith(
            caches.match(event.request)
                .then(response => {
                    return response || fetch(event.request);
                })
        );
        return;
    }

    // --- Strategi 3: Stale-While-Revalidate (untuk Aset Dinamis) ---
    // (Misal: Tailwind CSS, Google Fonts)
    // Ambil dari cache untuk kecepatan.
    // Sambil mengambil versi baru dari network untuk disimpan di cache untuk lain waktu.
    event.respondWith(
        caches.open(DYNAMIC_CACHE_NAME).then(cache => {
            return cache.match(event.request).then(response => {
                // 1. Ambil versi baru dari network
                const fetchPromise = fetch(event.request).then(networkResponse => {
                    // 2. Simpan di cache
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
                // 3. Kembalikan dari cache jika ada, ATAU tunggu network jika tidak ada
                return response || fetchPromise;
            });
        })
    );
});
