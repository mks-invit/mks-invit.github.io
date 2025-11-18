/* eslint-disable no-restricted-globals */

const STATIC_CACHE_NAME = 'jws-static-cache-v1';
const DYNAMIC_CACHE_NAME = 'jws-dynamic-cache-v1';

// Daftar URL API yang menggunakan strategi Network-First
const API_ORIGINS = [
    'https://api.myquran.com', // Jadwal Sholat
    'https://api.quran.com'    // Data Surah & Ayat
];

// Asal (origin) CDN Audio yang akan di-cache saat diputar
const AUDIO_CDN_ORIGINS = [
    'https://cdn.islamic.network',
    'https://everyayah.com'
];

// [PERBAIKAN] Aset inti aplikasi (App Shell) yang HARUS di-cache saat instalasi.
// Ini diambil dari dependensi di index.html Anda.
const APP_SHELL_URLS = [
    '/', // start_url Anda (mewakili index.html)
    'manifest.json', // File manifest PWA
    'https://cdn.tailwindcss.com', // Dependensi CSS krusial
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap' // Dependensi Font
    // Catatan: Anda juga bisa menambahkan gambar ikon dari manifest.json di sini
    // 'images/icon-192.png',
    // 'images/icon-512.png'
];

/**
 * Event 'install': Dipanggil saat Service Worker pertama kali diinstal.
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Menginstal Service Worker...');
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Pre-caching App Shell');
                
                // [PERBAIKAN] Hapus .catch() dari cache.addAll().
                // Jika salah satu aset inti gagal di-cache (misalnya 404),
                // seluruh proses instalasi HARUS GAGAL agar browser mencobanya lagi nanti.
                return cache.addAll(APP_SHELL_URLS);
            })
            .then(() => {
                console.log('[SW] App Shell berhasil di-cache.');
            })
            .catch(err => {
                // Tangkap error di sini. Melemparkan error akan membatalkan instalasi.
                console.error('[SW] Gagal meng-cache App Shell, instalasi dibatalkan.', err);
                throw err;
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
                    return null;
                })
            );
        })
    );
    // Memastikan Service Worker baru mengambil alih kontrol halaman
    return self.clients.claim();
});

/**
 * Event 'fetch': Dipanggil setiap kali browser membuat permintaan jaringan.
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
                    return caches.match(request); // Kembalikan dari cache, atau null jika tidak ada
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
                        return cachedResponse;
                    }
                    // Jika tidak ada, ambil dari jaringan dan simpan
                    return fetch(request).then((networkResponse) => {
                        caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                            cache.put(request, networkResponse.clone());
                        });
                        return networkResponse;
                    });
                })
        );
    }

    // 3. Strategi Stale-While-Revalidate untuk Aset Lain (HTML, CSS, JS, Font, dll)
    else {
        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    // 1. Buat janji untuk mengambil data dari jaringan
                    const networkFetch = fetch(request)
                        .then((networkResponse) => {
                            // Simpan respons baru ke cache dinamis
                            caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                                cache.put(request, networkResponse.clone());
                            });
                            return networkResponse;
                        })
                        .catch(err => {
                            console.log(`[SW] Gagal mengambil dari jaringan (offline?): ${url.pathname}`, err);
                            // [PERBAIKAN] Lemparkan error agar ditangkap oleh .catch() di luar
                            throw err;
                        });

                    // 2. Kembalikan dari cache jika ada (Stale)
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    // 3. Jika tidak ada di cache, tunggu & kembalikan dari jaringan (Revalidate)
                    return networkFetch;
                })
                .catch(() => {
                    // [PERBAIKAN UTAMA] Ini adalah fallback jika offline DAN tidak ada di cache
                    console.log(`[SW] Gagal menyajikan (offline & tidak ada di cache): ${event.request.url}`);
                    
                    // Jika permintaan adalah navigasi halaman (mis. user me-reload)
                    if (request.mode === 'navigate') {
                        // Coba kembalikan halaman '/' utama dari STATIC CACHE sebagai fallback.
                        // Ini jauh lebih baik daripada halaman error.
                        return caches.match('/');
                    }
                    
                    // Untuk aset lain (gambar, dll), kembalikan respons error yang valid
                    return new Response(JSON.stringify({ error: 'Offline and resource not cached.' }), {
                        status: 503,
                        headers: { 'Content-Type': 'application/json' }
                    });
                })
        );
    }
});
