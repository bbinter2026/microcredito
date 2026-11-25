/* MicroCrédito · service worker
   - A página abre mesmo sem internet (usa a última versão guardada).
   - Com internet, a página é sempre pedida ao servidor primeiro, por isso as atualizações chegam logo.
   - Os pedidos à base de dados (supabase.co) nunca passam pela cache. */
const V = 'mc-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'logo-180.png'];
const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
const STATIC_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await Promise.all(SHELL.map(u => c.add(u).catch(() => {})));
    try { await c.add(new Request(CDN, { mode: 'cors' })); } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.hostname.endsWith('supabase.co')) return;               // dados: sempre pela rede

  if (req.mode === 'navigate') {                                // página: rede primeiro, cache como reserva
    e.respondWith((async () => {
      const cached = await caches.match('index.html');
      try {
        const r = await (cached ? timeout(fetch(req), 4000) : fetch(req));
        if (r && r.ok && r.type === 'basic') { const cp = r.clone(); caches.open(V).then(c => c.put('index.html', cp)); }
        return r;
      } catch (_) {
        return cached || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  if (u.origin === location.origin || STATIC_HOSTS.includes(u.hostname)) {   // ficheiros: cache + atualização em segundo plano
    e.respondWith((async () => {
      const hit = await caches.match(req);
      const net = fetch(req).then(r => {
        if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(V).then(c => c.put(req, cp)); }
        return r;
      }).catch(() => hit);
      return hit || (await net) || Response.error();
    })());
  }
});
