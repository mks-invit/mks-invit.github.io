/* eslint-disable no-restricted-globals */

// [PENTING] Ubah versi cache setiap kali Anda mengubah file aset agar browser mengambil yang baru
const STATIC_CACHE_NAME = 'jws-static-cache-v2'; // Ubah v1 ke v2
const DYNAMIC_CACHE_NAME = 'jws-dynamic-cache-v2';

// Daftar URL API yang menggunakan strategi Network-First
// (Data diutamakan update dari internet, jika offline baru ambil cache)
const API_ORIGINS = [
    'https://api.myquran.com', // Jadwal Sholat
    'https://api.quran.com'    // Data Surah & Ayat
];

// Aset inti aplikasi (App Shell) yang akan di-cache saat instalasi
// [PERBAIKAN] Aset eksternal (Tailwind & Font) ditambahkan agar tampilan tidak rusak saat offline
const APP_SHELL_URLS = [
    '/',
    'index.html',
    'manifest.json',
    'images/icon-192.png', // Pastikan path sesuai dengan folder Anda
    'images/icon-512.png', 
    // Aset Eksternal (Penting untuk UI)
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap'
];

// Asal (origin) CDN Audio yang akan di-cache saat diputar
const AUDIO_CDN_ORIGINS = [
    'https://cdn.islamic.network',
    'https://everyayah.com'
];

/**
 * Event 'install': Dipanggil saat Service Worker pertama kali diinstal.
 * Mengunduh dan menyimpan aset inti (App Shell).
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Menginstal Service Worker...');
    self.skipWaiting(); // Memaksa SW baru untuk segera aktif
    
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Pre-caching App Shell');
                return cache.addAll(APP_SHELL_URLS);
            })
            .catch(err => {
                console.warn('[SW] Gagal meng-cache beberapa App Shell:', err);
            })
    );
});

/**
 * Event 'activate': Membersihkan cache lama yang tidak digunakan lagi.
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Mengaktifkan Service Worker...');
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                // Hapus cache yang namanya berbeda dengan versi saat ini
                if (key !== STATIC_CACHE_NAME && key !== DYNAMIC_CACHE_NAME) {
                    console.log('[SW] Menghapus cache lama:', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    return self.clients.claim();
});

/**
 * Event 'fetch': Mengatur strategi caching.
 */
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // --- STRATEGI 1: Network-First (Untuk API) ---
    // Coba ambil data terbaru dari internet. Jika gagal (offline), ambil dari cache.
    if (API_ORIGINS.some(origin => url.href.startsWith(origin))) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    return caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                        cache.put(request, networkResponse.clone());
                        return networkResponse;
                    });
                })
                .catch(() => {
                    // Jika offline, kembalikan dari cache (jika ada)
                    return caches.match(request);
                })
        );
        return;
    }

    // --- STRATEGI 2: Stale-While-Revalidate (Untuk Aset UI, Gambar, Audio) ---
    // Tampilkan cache SEGERA (agar loading cepat/offline jalan), 
    // lalu update cache di background untuk kunjungan berikutnya.
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            // Proses fetch ke jaringan (untuk update cache)
            const networkFetch = fetch(request)
                .then((networkResponse) => {
                    caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
                        cache.put(request, networkResponse.clone());
                    });
                    return networkResponse;
                })
                .catch((err) => {
                    // Log error jika offline (tidak masalah jika sudah ada cachedResponse)
                    // console.log(`[SW] Mode Offline: Menggunakan aset lokal untuk ${url.pathname}`);
                });

            // 1. Jika ada di cache, kembalikan LANGSUNG (User senang, aplikasi cepat terbuka)
            if (cachedResponse) {
                return cachedResponse;
            }

            // 2. Jika tidak ada di cache, tunggu jaringan (Loading biasa)
            return networkFetch;
        })
    );
});
