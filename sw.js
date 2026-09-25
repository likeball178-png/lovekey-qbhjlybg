/* ============================================================
 * Service Worker —— 让 LOVEKEY 安装到手机桌面后永久离线可用
 * 策略：核心资源 CacheFirst（缓存优先），/api/ 请求永不缓存
 * ============================================================ */
const CACHE = 'lovekey-v10';
const CORE = [
  './index.html',
  './style.css',
  './app.js',
  './data/replies.js',
  './data/replies2.js',
  './data/replies3.js',
  './data/replies_sh.js',
  './data/replies_xy.js',
  './manifest.json',
  './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // AI 接口永不缓存（走网络；失败时由页面回退模板）
  if (url.pathname.startsWith('/api/')) return;
  // 只处理同源 GET 请求
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((resp) => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match('./index.html').then(h => h || caches.match('./')));
    })
  );
});
