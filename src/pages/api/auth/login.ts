import type { APIRoute } from 'astro'
import { login } from '../../../server/auth/login'
import { sessionCookie } from '../../../server/auth/sessions'
import { clientAddress, database, fromThisSite, json, notConfigured } from '../../../server/http'

// POST /api/auth/login  { email, password }
export const POST: APIRoute = async (context) => {
  const db = database(context)
  if (!db) return notConfigured()
  if (!fromThisSite(context.request)) return json({ error: 'forbidden' }, 403)

  const body = await context.request.json().catch(() => null) as { email?: unknown; password?: unknown } | null
  if (typeof body?.email !== 'string' || typeof body?.password !== 'string') {
    return json({ error: 'invalid' }, 401)
  }

  const result = await login(db, body.email, body.password, clientAddress(context.request))
  if (!result.ok) return json({ error: result.reason }, result.reason === 'throttled' ? 429 : 401)

  return json({ user: result.user }, 200, { 'Set-Cookie': sessionCookie(result.token, result.expiresAt) })
}
