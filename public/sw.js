const CACHE_NAME = 'fotos-carpetas-v5';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];
const JSZIP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const FIGTREE_CSS_URL = 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;800&display=swap';

async function precacheExternal(cache) {
  try {
    const jszipRes = await fetch(JSZIP_URL, { mode: 'cors' });
    if (jszipRes && (jszipRes.ok || jszipRes.type === 'opaque')) {
      await cache.put(JSZIP_URL, jszipRes.clone());
    }
  } catch (e) {}

  try {
    const cssRes = await fetch(FIGTREE_CSS_URL, { mode: 'cors' });
    if (cssRes && cssRes.ok) {
      await cache.put(FIGTREE_CSS_URL, cssRes.clone());
      const cssText = await cssRes.text();
      const fontUrls = [...cssText.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]);
      await Promise.allSettled(
        fontUrls.map(async url => {
          const fRes = await fetch(url, { mode: 'cors' });
          if (fRes && (fRes.ok || fRes.type === 'opaque')) {
            await cache.put(url, fRes);
          }
        })
      );
    }
  } catch (e) {}
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await cache.addAll(CORE_ASSETS);
      await precacheExternal(cache);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const isExternalCdn =
    url.origin === 'https://cdnjs.cloudflare.com' ||
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com';

  if (isExternalCdn) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res && (res.status === 200 || res.type === 'opaque')) {
          cache.put(req, res.clone());
        }
        return res;
      })
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
        const networkPromise = fetch(req).then(res => {
          if (res && res.status === 200) {
            cache.put(req, res.clone());
          }
          return res;
        }).catch(() => null);

        if (cached) {
          event.waitUntil(networkPromise);
          return cached;
        }

        const netRes = await networkPromise;
        if (netRes) return netRes;

        if (req.mode === 'navigate') {
          return (await cache.match('./index.html')) || (await cache.match('./'));
        }
        return Response.error();
      })
    );
  }
});
