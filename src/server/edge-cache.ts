// A short-lived copy of public pages and answers at Cloudflare's edge, so most visits
// never reach the database. Only public GETs that look the same for everyone are kept,
// and for a few seconds; the page already asks again on its own.
//
// The cache is per Cloudflare location. A change made by an admin clears the copies at
// the location that served them, so the admin sees the change at once; elsewhere the
// copy ages out within the TTL, which is no slower than the page's own refresh.

export const TTL_SECONDS: [RegExp, number][] = [
  [/^\/$/,                      30],
  [/^\/api\/episodes$/,         30],
  [/^\/api\/settings\/[^/]+$/,  30],
  [/^\/feed\.xml$/,            300],
]

// What the episode endpoints and the settings endpoint clear after a change.
export const AFTER_EPISODE_CHANGE = ['/', '/api/episodes', '/feed.xml']
export const AFTER_SETTING_CHANGE = (key: string) => ['/', `/api/settings/${encodeURIComponent(key)}`]

export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
  delete(request: Request): Promise<boolean>
}

// Cloudflare's cache, where the code runs on Cloudflare; nothing elsewhere.
export function edgeCache(): EdgeCache | null {
  return (globalThis as { caches?: { default?: EdgeCache } }).caches?.default ?? null
}

export function ttlFor(url: URL): number | null {
  return TTL_SECONDS.find(([pattern]) => pattern.test(url.pathname))?.[1] ?? null
}

export async function serveCached(
  request: Request,
  cache: EdgeCache | null,
  render: () => Promise<Response>,
  waitUntil: (work: Promise<unknown>) => void = work => { void work },
): Promise<Response> {
  const url = new URL(request.url)
  const ttl = request.method === 'GET' ? ttlFor(url) : null
  if (!ttl || !cache) return render()

  // Keyed by the address alone: cookies and headers do not change what is served.
  const key = new Request(url.toString())
  const hit = await cache.match(key)
  if (hit) return withHeader(hit, 'X-Cache', 'hit')

  const response = await render()
  if (!response.ok) return response

  const copy = withHeader(response, 'Cache-Control', `public, s-maxage=${ttl}`)
  copy.headers.set('X-Cache', 'miss')
  waitUntil(cache.put(key, copy.clone()))
  return copy
}

export async function purge(cache: EdgeCache | null, origin: string, paths: string[]): Promise<void> {
  if (!cache) return
  await Promise.all(paths.map(path => cache.delete(new Request(origin + path)).catch(() => false)))
}

function withHeader(response: Response, name: string, value: string): Response {
  const copy = new Response(response.body, response)
  copy.headers.set(name, value)
  return copy
}
