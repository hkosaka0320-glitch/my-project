// Service Worker — アプリシェルをキャッシュしてオフライン動作を実現
// ※ Tesseract.js の日本語モデルは Tesseract が IndexedDB に自動キャッシュします

const CACHE_NAME = 'photo-inventory-v1';

const CACHE_URLS = [
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
];

// インストール: アプリシェルをキャッシュに追加
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// アクティベート: 古いキャッシュを削除
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// フェッチ: キャッシュ優先、なければネットワーク
self.addEventListener('fetch', event => {
    // Tesseract CDN や外部リソースはキャッシュしない
    if (!event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request).then(response => {
                // 成功したレスポンスのみキャッシュに追加
                if (response && response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            });
        })
    );
});
