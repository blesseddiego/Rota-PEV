// Service Worker do Rota PEV — permite abrir o app mesmo sem internet,
// usando o que já foi carregado antes. Não interfere em chamadas de rede
// "vivas" (geocodificação, cálculo de rota) — essas continuam exigindo internet,
// e o próprio app já sabe lidar com a falta delas.

const CACHE_VERSION = 'rota-pev-v1';

const PRECACHE_URLS = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// Domínios cuja resposta NUNCA deve ser servida do cache — são dados vivos,
// não parte do "esqueleto" do app.
const NEVER_CACHE_HOSTS = [
  'api.geoapify.com',
  'router.project-osrm.org',
  'nominatim.openstreetmap.org'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { mode: 'no-cors' })).catch(() => {})
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  if (NEVER_CACHE_HOSTS.includes(url.hostname)) {
    return; // deixa passar direto pra rede, sem interceptar
  }

  const isNavigation = req.mode === 'navigate';

  if (isNavigation) {
    // Página principal: tenta rede primeiro (pra sempre pegar a versão mais nova),
    // cai pro cache só se estiver offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./')))
    );
    return;
  }

  // Demais recursos (CSS/JS de CDN, fontes, tiles do mapa): cache primeiro,
  // busca na rede e guarda pra próxima se não tiver no cache ainda.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
    })
  );
});
