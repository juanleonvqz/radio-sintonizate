import { timestamp, type Db } from '../db'

// Signed-in sessions.
//
// Logging in puts a random token in an HttpOnly cookie, so page scripts cannot read it.
// The database keeps only the token's SHA-256, so the table alone signs nobody in.
//
// Supabase kept an admin signed in on a device until they signed out. The closest safe
// match: a session lasts 90 days and is pushed out again whenever it is used, so a
// device in regular use stays signed in.

export const SESSION_COOKIE = 'rs_session'

const DAY_MS         = 24 * 60 * 60 * 1000
const LIFETIME_MS    = 90 * DAY_MS
const RENEW_BELOW_MS = LIFETIME_MS / 2

export interface SessionUser {
  id: string
  email: string
}

export interface ActiveSession {
  user: SessionUser
  // Set when the session was just pushed out and the cookie should be sent again.
  renewedUntil?: Date
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export async function createSession(db: Db, userId: string, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const token     = randomToken()
  const expiresAt = new Date(now.getTime() + LIFETIME_MS)

  await db
    .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, timestamp(now), timestamp(expiresAt))
    .run()

  return { token, expiresAt }
}

export async function findSession(db: Db, token: string | null, now = new Date()): Promise<ActiveSession | null> {
  if (!token) return null

  const tokenHash = await sha256(token)
  const row = await db
    .prepare(`SELECT u.id, u.email, s.expires_at
              FROM sessions s JOIN users u ON u.id = s.user_id
              WHERE s.token_hash = ? AND s.expires_at > ?`)
    .bind(tokenHash, timestamp(now))
    .first<{ id: string; email: string; expires_at: string }>()
  if (!row) return null

  const session: ActiveSession = { user: { id: row.id, email: row.email } }

  if (new Date(row.expires_at).getTime() - now.getTime() < RENEW_BELOW_MS) {
    const renewedUntil = new Date(now.getTime() + LIFETIME_MS)
    await db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(timestamp(renewedUntil), tokenHash).run()
    session.renewedUntil = renewedUntil
  }
  return session
}

export async function deleteSession(db: Db, token: string | null): Promise<void> {
  if (!token) return
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
}

// ── Cookie ────────────────────────────────────────────────────────────────────

// SameSite=Strict: the cookie is only ever sent by this site's own pages, which is all
// the admin panel needs, and it keeps other sites from acting with an admin's session.
export function sessionCookie(token: string, expiresAt: Date): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Expires=${expiresAt.toUTCString()}; HttpOnly; Secure; SameSite=Strict`
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict`
}

export function readSessionToken(request: Request): string | null {
  const header = request.headers.get('Cookie') ?? ''
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === SESSION_COOKIE) return value.join('=') || null
  }
  return null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}
