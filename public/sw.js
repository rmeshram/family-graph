// Family Graph Service Worker — Cache-first for shell, network-first for API

const CACHE_NAME = 'family-graph-v1'
const SHELL_ASSETS = [
  '/',
  '/dashboard',
  '/manifest.json',
]

// Install: cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  )
  self.skipWaiting()
})

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch strategy:
//   - Supabase / API calls → network-only (never cache auth tokens)
//   - _next/static, fonts, images → cache-first
//   - Everything else → network with cache fallback
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Never intercept non-GET or Supabase/auth requests
  if (request.method !== 'GET') return
  if (url.hostname.includes('supabase.co')) return
  if (url.pathname.startsWith('/auth/')) return
  if (url.pathname.startsWith('/api/')) return

  // Static assets: cache-first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.match(/\.(woff2?|png|jpg|jpeg|svg|ico)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          return response
        })
      })
    )
    return
  }

  // Navigation: network with cache fallback (offline shell)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/dashboard') ?? caches.match('/'))
    )
    return
  }
})
