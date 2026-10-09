const CACHE = 'qc-react-v3'
const APP_SHELL = ['/react/', '/react/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('qc-react-') && key !== CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  )
})

async function networkFirst(request, fallbackKey) {
  try {
    const response = await fetch(request, { cache: 'no-store' })
    if (response.ok) {
      const copy = response.clone()
      caches.open(CACHE).then((cache) => cache.put(fallbackKey || request, copy))
    }
    return response
  } catch {
    const cached = await caches.match(fallbackKey || request)
    if (cached) return cached
    throw new Error('offline')
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/react/')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/react/'))
    return
  }

  if (url.pathname.startsWith('/react/assets/') || url.pathname === '/react/manifest.webmanifest') {
    event.respondWith(networkFirst(request))
    return
  }

  event.respondWith(
    caches.match(request).then((cached) =>
      cached || fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()))
        return response
      })
    )
  )
})
