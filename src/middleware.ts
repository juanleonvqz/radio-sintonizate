import { defineMiddleware } from 'astro:middleware'
import { edgeCache, serveCached } from './server/edge-cache'

// Public pages and answers are served from Cloudflare's edge cache for a few seconds
// (see src/server/edge-cache.ts). Everything else passes straight through.
export const onRequest = defineMiddleware((context, next) => {
  const runtime = (context.locals as { runtime?: { ctx?: { waitUntil?: (work: Promise<unknown>) => void } } }).runtime
  const waitUntil = runtime?.ctx?.waitUntil?.bind(runtime.ctx)
  return serveCached(context.request, edgeCache(), next, waitUntil)
})
