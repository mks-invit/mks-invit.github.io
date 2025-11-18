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
                cacheNames.map((cacheName) => {
                    // Hapus cache lama (baik statis maupun dinamis)
                    if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
                        console.log(`[SW] Menghapus cache lama: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                    return null; // Tambahkan return null untuk konsistensi
                })
            );
        })
    );
    // Memastikan Service Worker baru mengambil alih kontrol halaman dengan cepat
    return self.clients.claim();
});

/**
 * Event 'fetch': Dipanggil setiap kali browser membuat permintaan jaringan.
 * Ini adalah inti dari strategi caching kita.
 */
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // 1. Strategi Network-First untuk API
    if (API_ORIGINS.includes(url.origin)) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    // Jika berhasil dari jaringan, simpan ke cache dinamis
                    caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                        cache.put(request, networkResponse.clone());
                    });
                    return networkResponse;
                })
                .catch((err) => {
                    // Jika jaringan gagal, coba ambil dari cache
                    console.log(`[SW] Jaringan gagal untuk API, menyajikan dari cache: ${url.pathname}`, err);
                    return caches.match(request).then((cachedResponse) => {
                        // Jika tidak ada di cache, kembalikan null (browser akan handle)
                        return cachedResponse || null;
                    });
                })
        );
    }

    // 2. Strategi Cache-First untuk Audio CDN (setelah diputar)
    else if (AUDIO_CDN_ORIGINS.includes(url.origin) && request.destination === 'audio') {
        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    // Jika ada di cache, langsung kembalikan
                    if (cachedResponse) {
                        console.log(`[SW] Menyajikan audio dari cache: ${url.pathname}`);
                        return cachedResponse;
                    }

                    // Jika tidak ada, ambil dari jaringan
                    return fetch(request).then((networkResponse) => {
                        // Simpan audio ke cache dinamis saat diambil
                        caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                            cache.put(request, networkResponse.clone());
                        });
                        return networkResponse;
                    });
                })
        );
    }

    // 3. Strategi Stale-While-Revalidate untuk Aset Lain
    // (HTML, CSS, JS, Font, Gambar, dll)
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
                            // [PERBAIKAN 1] Lemparkan error agar ditangkap oleh .catch() di luar
                            throw err;
                        });

                    // 2. Kembalikan dari cache jika ada (Stale)
                    if (cachedResponse) {
                        console.log(`[SW] Menyajikan dari cache: ${url.pathname}`);
                        return cachedResponse;
                    }

                    // 3. Jika tidak ada di cache, tunggu & kembalikan dari jaringan (Revalidate)
                    return networkFetch;
                })
                // [PERBAIKAN 2] Tambahkan .catch() di akhir rantai
                .catch(() => {
                    // Ini adalah fallback jika offline DAN tidak ada di cache
                    console.log(`[SW] Gagal menyajikan (offline & tidak ada di cache): ${event.request.url}`);
                    
                    // Anda bisa mengembalikan halaman fallback jika ada
                    // if (event.request.mode === 'navigate') {
                    //     return caches.match('/offline.html'); // Pastikan Anda sudah meng-cache offline.html
                    // }
                    
                    // Atau kembalikan respons Error generik yang valid
                    return new Response(JSON.stringify({ error: 'Offline and resource not cached.' }), {
                        status: 503, // Service Unavailable
                        headers: { 'Content-Type': 'application/json' }
                    });
                })
        );
    }
});
