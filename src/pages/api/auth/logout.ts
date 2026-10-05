import type { APIRoute } from 'astro'
import { clearedSessionCookie, deleteSession, readSessionToken } from '../../../server/auth/sessions'
import { database, fromThisSite, json, notConfigured } from '../../../server/http'

// POST /api/auth/logout
export const POST: APIRoute = async (context) => {
  const db = database(context)
  if (!db) return notConfigured()
  if (!fromThisSite(context.request)) return json({ error: 'forbidden' }, 403)

  await deleteSession(db, readSessionToken(context.request))
  return json({ user: null }, 200, { 'Set-Cookie': clearedSessionCookie() })
}
