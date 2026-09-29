const CACHE = 'nexora-shell-v1';
const SHELL = ['/', '/static/style.css', '/static/script.js', '/static/nexora-logo.png', '/static/favicon.png', '/static/manifest.webmanifest'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/') || url.pathname.startsWith('/admin')) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
