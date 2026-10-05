import type { APIRoute } from 'astro'
import { findSession, readSessionToken, sessionCookie } from '../../../server/auth/sessions'
import { database, json, notConfigured } from '../../../server/http'

// GET /api/auth/session  ->  { user } or { user: null }
export const GET: APIRoute = async (context) => {
  const db = database(context)
  if (!db) return notConfigured()

  const token   = readSessionToken(context.request)
  const session = await findSession(db, token)
  if (!session) return json({ user: null })

  const headers = session.renewedUntil ? { 'Set-Cookie': sessionCookie(token!, session.renewedUntil) } : {}
  return json({ user: session.user }, 200, headers)
}
