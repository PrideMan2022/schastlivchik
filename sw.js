/* Service worker: игра открывается без сети после первого запуска.
   Стратегия — «сначала сеть, при отказе кэш»: так обновления доезжают сразу,
   а в метро игра всё равно работает. */
const CACHE = 'schastlivchik-v2';
const SHELL = [
  './', './index.html', './admin.html', './styles.css', './core.js',
  './manifest.json', './assets/logo.svg', './assets/icon-192.png', './assets/icon-512.png',
  './doc.css', './terms.html', './privacy.html', './refund.html', './game-rules.html'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});
