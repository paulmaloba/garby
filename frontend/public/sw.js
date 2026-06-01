/**
 * Garby Service Worker
 * Strategy:
 *   - App shell (HTML, JS, CSS, fonts): Cache First — instant loads
 *   - API calls (/api/*): Network First — always fresh data, cache as fallback
 *   - Images (R2 CDN): Stale-While-Revalidate — show cached, update in background
 *   - Scan uploads: Network Only — never cache user data
 */

const CACHE_VERSION = 'garby-v1'
const SHELL_CACHE   = `${CACHE_VERSION}-shell`
const API_CACHE     = `${CACHE_VERSION}-api`
const IMAGE_CACHE   = `${CACHE_VERSION}-images`

// App shell assets to precache on install
const SHELL_ASSETS = [
  '/',
  '/scan',
  '/offline.html',
]

// ── Install: precache shell ───────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  )
})

// ── Activate: clean old caches ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('garby-') && k !== SHELL_CACHE && k !== API_CACHE && k !== IMAGE_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

// ── Fetch: route by strategy ──────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Never intercept: POST requests (scan uploads), auth, chrome-extension
  if (request.method !== 'GET') return
  if (url.protocol === 'chrome-extension:') return

  // API calls — Network First with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(request, API_CACHE, 60 * 1000))
    return
  }

  // R2 CDN images — Stale While Revalidate
  if (url.hostname.includes('r2.dev') || url.hostname.includes('cloudflare')) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE))
    return
  }

  // App shell (HTML, JS, CSS) — Cache First
  event.respondWith(cacheFirstWithNetwork(request, SHELL_CACHE))
})

// ── Strategies ────────────────────────────────────────────────────────────────

async function cacheFirstWithNetwork(request, cacheName) {
  const cache  = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch {
    // Offline fallback for navigation requests
    if (request.mode === 'navigate') {
      const offline = await caches.match('/offline.html')
      if (offline) return offline
    }
    return new Response('Offline', { status: 503 })
  }
}

async function networkFirstWithCache(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName)

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const response = await fetch(request, { signal: controller.signal })
    clearTimeout(timer)

    if (response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await cache.match(request)
    return cached ?? new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    })
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName)
  const cached = await cache.match(request)

  // Fetch in background, update cache
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone())
    return response
  }).catch(() => null)

  return cached ?? (await fetchPromise) ?? new Response('Not found', { status: 404 })
}

// ── Background sync for queued scans (future) ─────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'garby-scan-queue') {
    event.waitUntil(processScanQueue())
  }
})

async function processScanQueue() {
  // Placeholder — will process queued scans when connection restored
  console.log('[SW] Processing scan queue')
}
