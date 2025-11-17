const CACHE_NAME = 'todo-app-shell-v1';
// Daftar file inti yang diperlukan agar aplikasi bisa dimuat.
// Sesuaikan nama file HTML jika Anda mengubahnya.
const FILES_TO_CACHE = [
    './', // Ini akan menangani request ke root
    './todo ok.html', // File HTML utama
    'https://cdn.tailwindcss.com', // Script Tailwind
    'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap' // Font Inter
];

// Event 'install': Dipanggil saat Service Worker pertama kali di-install.
self.addEventListener('install', (evt) => {
    console.log('[ServiceWorker] Install');
    // Buka cache dan tambahkan file-file inti.
    evt.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Pre-caching app shell');
            return cache.addAll(FILES_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Event 'activate': Dipanggil setelah install, untuk membersihkan cache lama.
self.addEventListener('activate', (evt) => {
    console.log('[ServiceWorker] Activate');
    // Hapus cache lama yang tidak sesuai dengan CACHE_NAME
    evt.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[ServiceWorker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

// Event 'fetch': Dipanggil setiap kali ada permintaan jaringan (gambar, script, API).
self.addEventListener('fetch', (evt) => {
    // Kita gunakan strategi "Cache First" untuk aset aplikasi.
    // Ini berarti kita cek cache dulu, jika ada, langsung berikan.
    // Jika tidak ada di cache, baru ambil dari jaringan.
    
    // Jangan cache permintaan API (POST ke Apps Script)
    if (evt.request.method === 'POST' || evt.request.url.includes('script.google.com')) {
        // Untuk API, selalu gunakan jaringan (atau biarkan logika offline aplikasi yang menangani)
        evt.respondWith(fetch(evt.request));
        return;
    }

    evt.respondWith(
        caches.match(evt.request).then((response) => {
            // Jika file ada di cache, kembalikan dari cache.
            // Jika tidak, ambil dari jaringan.
            return response || fetch(evt.request);
        })
    );
});
