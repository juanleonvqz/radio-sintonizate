// Service worker: makes the site installable and keeps its shell available offline.
//
// What it never touches: the API (always live) and the audio (big, and played through
// partial requests that must reach the server). Covers, fonts, logos, icons and the
// hashed script bundles never change under the same name, so they are served from the
// cache once seen. Pages go to the network first and fall back to the cached copy.

const CACHE = 'rs-v3'
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

// Which handling a request gets. Kept as one function so it can be tested.
function strategyFor(request) {
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return 'ignore'
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/audio/') || url.pathname === '/feed.xml') return 'ignore'
  if (/^\/(media\/covers|_astro|fonts|logos|icons)\//.test(url.pathname)) return 'cache-first'
  return 'network-first'
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const strategy = strategyFor(event.request)
  if (strategy === 'cache-first') event.respondWith(cacheFirst(event.request))
  else if (strategy === 'network-first') event.respondWith(networkFirst(event.request))
})

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) (await caches.open(CACHE)).put(request, response.clone())
  return response
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) (await caches.open(CACHE)).put(request, response.clone())
    return response
  } catch (error) {
    // Offline: the page as last seen, or the home page for any other page.
    const cached = (await caches.match(request)) || (request.mode === 'navigate' && await caches.match('/'))
    if (cached) return cached
    throw error
  }
}

self.strategyFor = strategyFor
