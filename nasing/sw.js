const CACHE_NAME = 'silsilah-pgn-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Cache CDN Eksternal agar tampilan tetap bagus saat offline
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.tailwindcss.com'
];

// 1. Install Service Worker & Cache Aset
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching files');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Activate & Hapus Cache Lama jika ada update
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// 3. Fetch Strategy: Cache First, Network Fallback
// (Cek cache dulu, kalau tidak ada baru ambil dari internet)
self.addEventListener('fetch', (event) => {
  // Jangan cache request ke Google Script (API) agar data selalu fresh
  if (event.request.url.includes('script.google.com')) {
    return; 
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).catch(() => {
        // Jika offline dan file tidak ada di cache (misal gambar baru)
        // Kita bisa return halaman offline custom jika mau, tapi di sini kita biarkan saja.
      });
    })
  );
});
