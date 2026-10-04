// Service worker do Boxer Requisições — cache do app shell.
// Não guarda chamadas de API nem nada de outros domínios: dados sempre ao vivo.
const VERSAO = 'boxer-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // API e externos: direto na rede
  if (url.pathname.startsWith('/api/')) return;

  // Navegação: rede primeiro (sempre a versão nova), cache só se estiver offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put('/index.html', copia)); return r; })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Arquivos do build (nome com hash, nunca mudam): cache primeiro
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); }
        return r;
      }))
    );
    return;
  }

  // Ícones / manifest: cache com atualização em segundo plano
  if (SHELL.includes(url.pathname)) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const rede = fetch(req).then((r) => { if (r.ok) { const c2 = r.clone(); caches.open(VERSAO).then((c) => c.put(req, c2)); } return r; }).catch(() => hit);
        return hit || rede;
      })
    );
  }
});
