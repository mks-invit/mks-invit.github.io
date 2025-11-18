/* eslint-disable no-restricted-globals */

const STATIC_CACHE_NAME = 'jws-static-cache-v1';
const DYNAMIC_CACHE_NAME = 'jws-dynamic-cache-v1';

// Daftar URL API yang menggunakan strategi Network-First
const API_ORIGINS = [
    'https://api.myquran.com', // Jadwal Sholat
    'https://api.quran.com'    // Data Surah & Ayat
];

// Aset inti aplikasi (App Shell) yang akan di-cache saat instalasi
const APP_SHELL_URLS = [
    '/',
    'index.html' // Ganti ini jika nama file HTML Anda berbeda
];

// Asal (origin) CDN Audio yang akan di-cache saat diputar
const AUDIO_CDN_ORIGINS = [
    'https://cdn.islamic.network',
    'https://everyayah.com'
];

/**
 * Event 'install': Dipanggil saat Service Worker pertama kali diinstal.
 * Ini adalah tempat kita meng-cache App Shell.
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Menginstal Service Worker...');
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Pre-caching App Shell');
                // Kita abaikan kegagalan addAll (misalnya 404) agar tidak membatalkan instalasi
                return cache.addAll(APP_SHELL_URLS).catch(err => {
                    console.warn('[SW] Gagal meng-cache beberapa App Shell (mungkin tidak apa-apa):', err);
                });
            })
            .then(() => self.skipWaiting()) // Aktifkan SW baru segera
    );
});

/**
 * Event 'activate': Dipanggil saat Service Worker diaktifkan.
 * Ini adalah tempat kita membersihkan cache lama.
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Mengaktifkan Service Worker...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== STATIC_CACHE_NAME && name !== DYNAMIC_CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        }).then(() => self.clients.claim()) // Ambil alih kontrol halaman
    );
});

/**
 * Helper: Memeriksa apakah URL berasal dari API yang ditentukan.
 */
function isApiUrl(url) {
    return API_ORIGINS.some(origin => url.startsWith(origin));
}

/**
 * Helper: Memeriksa apakah URL berasal dari CDN Audio yang ditentukan.
 */
function isAudioUrl(url) {
    return AUDIO_CDN_ORIGINS.some(origin => url.startsWith(origin));
}


/**
 * Event 'fetch': Dipanggil setiap kali halaman membuat permintaan jaringan.
 * Ini adalah inti dari strategi offline.
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // 1. Strategi untuk API (Network-First, then Cache)
    if (isApiUrl(url.href)) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    // Jika sukses, simpan di cache dinamis
                    caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                        cache.put(request, networkResponse.clone());
                    });
                    return networkResponse;
                })
                .catch(() => {
                    // Jika gagal (offline), coba ambil dari cache
                    console.log(`[SW] Offline, menyajikan dari cache untuk: ${url.pathname}`);
                    return caches.match(request);
                })
        );
    }
    // 2. Strategi untuk Audio (Cache-First, on-demand)
    // Kita biarkan aplikasi memutarnya, dan jika masuk ke cache,
    // browser akan mengambilnya dari cache. Caching ditangani oleh
    // strategi 'Stale-While-Revalidate' di bawah ini.
    // Permintaan audio (range requests) bisa rumit, jadi SWR adalah yang paling aman.

    // 3. Strategi untuk Aset Lain (Stale-While-Revalidate)
    // (HTML, CSS, JS, Font, Gambar, dan juga Audio)
    else {
        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    // 1. Buat janji untuk mengambil data dari jaringan
                    const networkFetch = fetch(request)
                        .then((networkResponse) => {
                            // Simpan respons baru ke cache dinamis
                            caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                                // Put akan menimpa cache lama dengan yang baru
                                cache.put(request, networkResponse.clone());
                            });
                            return networkResponse;
                        })
                        .catch(err => {
                            console.log(`[SW] Gagal mengambil dari jaringan: ${url.pathname}`, err);
                            // Ini terjadi jika kita offline dan item tidak ada di cache
                        });

                    // 2. Kembalikan dari cache jika ada (Stale)
                    if (cachedResponse) {
                        console.log(`[SW] Menyajikan dari cache: ${url.pathname}`);
                        return cachedResponse;
                    }

                    // 3. Jika tidak ada di cache, tunggu & kembalikan dari jaringan (Revalidate)
                    return networkFetch;
                })
        );
    }
});
