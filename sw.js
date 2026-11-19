// PronoClub — service worker : l'appli s'ouvre même sans réseau (dernière version connue)
const CACHE = 'pronoclub-v54';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Réseau d'abord (pour avoir les derniers matchs et résultats), cache en secours.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, polices… : pas de cache
  // La page elle-même est toujours redemandée au serveur, pour que les mises à jour arrivent tout de suite.
  const page = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  e.respondWith(
    (page ? fetch(req.url, {cache: 'no-cache', credentials: 'same-origin'}) : fetch(req)).then(res => {
      if (res.ok) {
        const copy = res.clone();
        const key = url.pathname.includes('/fixtures/') ? url.origin + url.pathname : req;
        caches.open(CACHE).then(c => c.put(key, copy));
      }
      return res;
    }).catch(() => caches.match(url.pathname.includes('/fixtures/') ? url.origin + url.pathname : req, {ignoreSearch: true})
      .then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});

// Notifications reçues même quand l'appli est fermée
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'PronoClub', {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/favicon.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
        return c.focus().then(w => (w && 'navigate' in w) ? w.navigate(url) : w);
      }
    }
    return clients.openWindow(url);
  }));
});
