import type { APIContext } from 'astro'
import type { Db } from './db'
import type { Bucket } from './media/bucket'

// Small helpers shared by the API endpoints.

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  })
}

// The database binding, or null where the Pages project has none yet. Endpoints answer
// 503 in that case instead of crashing.
export function database(context: APIContext): Db | null {
  const runtime = (context.locals as { runtime?: { env?: { DB?: Db } } }).runtime
  return runtime?.env?.DB ?? null
}

// The file bucket binding, or null where the Pages project has none yet.
export function mediaBucket(context: APIContext): Bucket | null {
  const runtime = (context.locals as { runtime?: { env?: { MEDIA?: Bucket } } }).runtime
  return runtime?.env?.MEDIA ?? null
}

export const notConfigured = () => json({ error: 'not_configured' }, 503)

// Requests that change something must come from this site's own pages. Browsers always
// send Origin on such requests, so a missing or foreign one is refused.
export function fromThisSite(request: Request): boolean {
  const origin = request.headers.get('Origin')
  return origin !== null && origin === new URL(request.url).origin
}

export function clientAddress(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown'
}
