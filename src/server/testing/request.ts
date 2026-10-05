import type { APIRoute } from 'astro'
import type { Db } from '../db'
import { SESSION_COOKIE } from '../auth/sessions'

// Test-only: calls an endpoint the way Astro would, with the database a test supplies.

export const SITE = 'https://radiosintonizate.com'

export interface Call {
  db: Db | null
  method?: string
  path?: string
  params?: Record<string, string>
  body?: unknown
  // Session token of a signed-in admin; leave out for an anonymous visitor.
  token?: string
  // Origin header; null leaves it out, as a non-browser client would.
  origin?: string | null
}

export async function call(handler: APIRoute, { db, method = 'GET', path = '/api', params = {}, body, token, origin = SITE }: Call) {
  const headers: Record<string, string> = {}
  if (origin) headers.Origin = origin
  if (token) headers.Cookie = `${SESSION_COOKIE}=${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const request = new Request(SITE + path, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
  const context = { request, params, locals: { runtime: { env: db ? { DB: db } : {} } } }

  const response = await handler(context as never) as Response
  return { status: response.status, data: await response.json() as any }
}
