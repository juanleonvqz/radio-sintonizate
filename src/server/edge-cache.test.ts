import { describe, it, expect } from 'vitest'
import { serveCached, purge, ttlFor, AFTER_EPISODE_CHANGE, type EdgeCache } from './edge-cache'

const SITE = 'https://radiosintonizate.com'

function fakeCache(): EdgeCache & { store: Map<string, Response> } {
  const store = new Map<string, Response>()
  return {
    store,
    match: async request => store.get(request.url)?.clone(),
    put:   async (request, response) => { store.set(request.url, response) },
    delete: async request => store.delete(request.url),
  }
}

let renders = 0
const render = async () => new Response(`render ${++renders}`, { status: 200, headers: { 'Cache-Control': 'no-store' } })
const get = (path: string, init: RequestInit = {}) => new Request(SITE + path, init)

describe('the edge cache', () => {
  it('keeps the public pages and answers for a short while', () => {
    expect(ttlFor(new URL(SITE + '/'))).toBe(30)
    expect(ttlFor(new URL(SITE + '/api/episodes'))).toBe(30)
    expect(ttlFor(new URL(SITE + '/api/settings/site_description'))).toBe(30)
    expect(ttlFor(new URL(SITE + '/feed.xml'))).toBe(300)
    for (const path of ['/api/auth/session', '/api/comments/pending', '/api/episodes/abc', '/media/audio/a.mp3', '/sw.js']) {
      expect(ttlFor(new URL(SITE + path)), path).toBeNull()
    }
  })

  it('renders once, then serves the copy', async () => {
    const cache = fakeCache(); renders = 0
    const first  = await serveCached(get('/'), cache, render)
    const second = await serveCached(get('/'), cache, render)
    expect(await first.text()).toBe('render 1')
    expect(first.headers.get('X-Cache')).toBe('miss')
    expect(first.headers.get('Cache-Control')).toBe('public, s-maxage=30')
    expect(await second.text()).toBe('render 1')
    expect(second.headers.get('X-Cache')).toBe('hit')
    expect(renders).toBe(1)
  })

  it('ignores cookies and headers when looking up a copy, since the answer is the same for everyone', async () => {
    const cache = fakeCache(); renders = 0
    await serveCached(get('/', { headers: { Cookie: 'rs_session=abc' } }), cache, render)
    const other = await serveCached(get('/', { headers: { Cookie: 'rs_session=xyz' } }), cache, render)
    expect(other.headers.get('X-Cache')).toBe('hit')
  })

  it('never caches what is not on the list, writes, failures, or where there is no cache', async () => {
    const cache = fakeCache(); renders = 0
    await serveCached(get('/api/auth/session'), cache, render)
    await serveCached(get('/api/episodes', { method: 'POST' }), cache, render)
    await serveCached(get('/api/episodes'), cache, async () => new Response('down', { status: 503 }))
    await serveCached(get('/'), null, render)
    expect(cache.store.size).toBe(0)
    expect(renders).toBe(3)
  })

  it('forgets the page, the list and the feed after an episode changes', async () => {
    const cache = fakeCache(); renders = 0
    for (const path of ['/', '/api/episodes', '/feed.xml', '/api/settings/banner_visible']) await serveCached(get(path), cache, render)
    expect(cache.store.size).toBe(4)

    await purge(cache, SITE, AFTER_EPISODE_CHANGE)
    expect([...cache.store.keys()]).toEqual([SITE + '/api/settings/banner_visible'])
    expect((await serveCached(get('/api/episodes'), cache, render)).headers.get('X-Cache')).toBe('miss')
  })
})
