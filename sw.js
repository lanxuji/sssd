/* 狮山实达数据统计 —— 离线缓存
 * 策略说明（重要）：
 *   旧版是「缓存优先」，导致每次刷新先显示缓存里的旧页面，后台才更新，
 *   表现为「刷新后仍闪现旧版界面」。
 *   现改为：页面/脚本走「网络优先」——先拿最新的，网络不通时才用缓存（离线仍可打开）。
 *   图片/图标走「缓存优先」，加快加载。
 */
const CACHE = 'sclh-v13';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/style.css',
  './js/config.js', './js/store.js', './js/poster.js', './js/jersey.js', './js/app.js',
  './vendor/supabase.js',
  './icons/icon-192.png', './icons/icon-512.png'
];

/* 需要保持最新的资源：网络优先 */
const FRESH = ['.html', '.css', '.js', '.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => { })).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* 网络优先：先试网络，成功则更新缓存；失败（离线）才用缓存 */
function networkFirst(req) {
  return fetch(req).then(res => {
    if (res && res.status === 200 && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req).then(hit => hit || Response.error()));
}

/* 缓存优先：先用缓存，同时后台更新 */
function staleWhileRevalidate(req) {
  return caches.match(req).then(hit => {
    const net = fetch(req).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit);
    return hit || net;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  /* 跨域（Supabase API / 外链图片）不缓存，直接走网络 */
  if (url.origin !== self.location.origin) return;

  const p = url.pathname;
  /* 首页路径 / 或 /xxx 这类导航请求，一律视为页面 */
  const isPage = req.mode === 'navigate' || p.endsWith('/') || p.endsWith('.html');
  const isFresh = FRESH.some(ext => p.endsWith(ext));

  e.respondWith((isPage || isFresh) ? networkFirst(req) : staleWhileRevalidate(req));
});

/* 支持页面主动触发更新 */
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
