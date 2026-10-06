import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import vm from 'node:vm'

// Loads public/sw.js with a stand-in for the worker's global scope, then asks its
// routing function what it would do with each kind of request.

const SITE = 'https://radiosintonizate.com'
const listeners: Record<string, Function> = {}
const self = { location: new URL(SITE + '/sw.js'), addEventListener: (name: string, fn: Function) => { listeners[name] = fn } } as any
vm.runInNewContext(fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, caches: {}, fetch, URL, Request })
const strategyFor = self.strategyFor as (request: Request) => string
const get = (path: string, init: RequestInit = {}) => strategyFor(new Request(SITE + path, init))

describe('the service worker', () => {
  it('registers for install, activate and fetch', () => {
    expect(Object.keys(listeners).sort()).toEqual(['activate', 'fetch', 'install'])
  })

  it('leaves the API, the audio and the feed alone, so they are always live', () => {
    expect(get('/api/episodes')).toBe('ignore')
    expect(get('/api/auth/session')).toBe('ignore')
    expect(get('/media/audio/1782205259493-dia.mp3', { headers: { Range: 'bytes=0-1' } })).toBe('ignore')
    expect(get('/feed.xml')).toBe('ignore')
  })

  it('never touches anything that changes something or lives elsewhere', () => {
    expect(get('/api/episodes', { method: 'POST' })).toBe('ignore')
    expect(strategyFor(new Request('https://fonts.gstatic.com/x.woff2'))).toBe('ignore')
  })

  it('serves files that never change under the same name from the cache', () => {
    for (const path of ['/media/covers/1782205259493-cover.webp', '/_astro/index.CdY0RyqS.js', '/fonts/Karla-Regular.woff2', '/logos/Logo_radio_sintonizate_White.jpg', '/icons/icon-192.png']) {
      expect(get(path), path).toBe('cache-first')
    }
  })

  it('tries the network first for pages, with the cache as the offline fallback', () => {
    expect(get('/')).toBe('network-first')
    expect(get('/?ep=abc')).toBe('network-first')
    expect(get('/manifest.webmanifest')).toBe('network-first')
  })
})
