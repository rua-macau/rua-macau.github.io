/* sw.js — Service Worker */
const CACHE_NAME = 'rua-macau-95';
const CORE_ASSETS = [
  'rua-macau.github.io/',
  'rua-macau.github.io/index.html',
  'rua-macau.github.io/assets/css/style.css',
  'rua-macau.github.io/assets/js/main.js',
  'rua-macau.github.io/assets/js/sw.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(CORE_ASSETS)));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request));
    })
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
});

