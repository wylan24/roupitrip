// Hand-written service worker. The build prepends:
//   const VERSION = '<hash>'; const PRECACHE = [...app shell files...];
// Strategy:
//   app shell      -> precached at install, cache-first
//   rates.json     -> network-first, cached copy when offline (flagged by a header)
//   /tesseract/*   -> cache-first at runtime (large; cached the first time the camera is used)

const SHELL = `shell-${VERSION}`;
const RATES = 'rates';
const OCR = 'ocr-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  const path = url.pathname.slice(scope.length);

  if (path === 'rates.json') {
    event.respondWith(networkFirstRates(req));
  } else if (path.startsWith('tesseract/')) {
    event.respondWith(cacheFirst(req, OCR));
  } else if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(`${scope}index.html`, { ignoreSearch: true })));
  } else {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});

async function networkFirstRates(req) {
  const cache = await caches.open(RATES);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) await cache.put(req.url.split('?')[0], res.clone());
    return res;
  } catch {
    const hit = await cache.match(req.url.split('?')[0]);
    if (!hit) return Response.error();
    const headers = new Headers(hit.headers);
    headers.set('x-roupitrip-cache', 'offline');
    return new Response(await hit.blob(), { status: 200, headers });
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}
