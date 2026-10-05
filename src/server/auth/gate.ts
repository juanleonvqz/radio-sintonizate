import type { APIContext } from 'astro'
import type { Db } from '../db'
import { database, fromThisSite, json, notConfigured } from '../http'
import { findSession, readSessionToken, type SessionUser } from './sessions'

// The one place every API endpoint passes through before it touches the database.
//
// It carries the rules that were row-level security policies in Supabase:
//   admin:   the Supabase rule said "authenticated". Here: a signed-in admin, or 401.
//   changes: the request alters something, so it must come from this site's own pages.
// An endpoint with neither is open to everyone, like the "public read" policies.

export interface Rule {
  admin?: boolean
  changes?: boolean
}

export interface Entry {
  db: Db
  user: SessionUser | null
}

export async function enter(context: APIContext, rule: Rule = {}): Promise<Entry | Response> {
  const db = database(context)
  if (!db) return notConfigured()
  if (rule.changes && !fromThisSite(context.request)) return json({ error: 'forbidden' }, 403)

  const user = rule.admin ? (await findSession(db, readSessionToken(context.request)))?.user ?? null : null
  if (rule.admin && !user) return json({ error: 'unauthorized' }, 401)

  return { db, user }
}

// The request body as an object, or an empty one when it is missing or not JSON.
export async function body(request: Request): Promise<Record<string, unknown>> {
  const parsed = await request.json().catch(() => null)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
}
