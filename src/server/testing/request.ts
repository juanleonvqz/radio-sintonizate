import type { APIRoute } from 'astro'
import type { Db } from '../db'
import type { Bucket } from '../media/bucket'
import { SESSION_COOKIE } from '../auth/sessions'

// Test-only: calls an endpoint the way Astro would, with the database and file bucket
// a test supplies.

export const SITE = 'https://radiosintonizate.com'

export interface Call {
  db: Db | null
  media?: Bucket | null
  method?: string
  path?: string
  params?: Record<string, string>
  // Sent as JSON.
  body?: unknown
  // Sent as is, with its length, the way a browser uploads a file.
  bytes?: Uint8Array
  headers?: Record<string, string>
  // Session token of a signed-in admin; leave out for an anonymous visitor.
  token?: string
  // Origin header; null leaves it out, as a non-browser client would.
  origin?: string | null
}

// The raw response, for endpoints that do not answer in JSON.
export async function send(handler: APIRoute, { db, media, method = 'GET', path = '/api', params = {}, body, bytes, headers = {}, token, origin = SITE }: Call): Promise<Response> {
  const all: Record<string, string> = { ...headers }
  if (origin) all.Origin = origin
  if (token) all.Cookie = `${SESSION_COOKIE}=${token}`
  if (body !== undefined) all['Content-Type'] ??= 'application/json'
  if (bytes) all['Content-Length'] ??= String(bytes.length)

  const request = new Request(SITE + path, {
    method,
    headers: all,
    body: bytes ?? (body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)),
    ...(bytes ? { duplex: 'half' } : {}),
  } as RequestInit)
  const env = { ...(db ? { DB: db } : {}), ...(media ? { MEDIA: media } : {}) }

  return await handler({ request, params, locals: { runtime: { env } } } as never) as Response
}

export async function call(handler: APIRoute, options: Call) {
  const response = await send(handler, options)
  return { status: response.status, data: await response.json() as any }
}
