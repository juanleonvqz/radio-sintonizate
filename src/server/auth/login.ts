import { timestamp, type Db } from '../db'
import { hashPassword, verifyPassword } from './password'
import { createSession, sha256, type SessionUser } from './sessions'

// Logging in with an email and password.
//
// The answer for a wrong password and for an email that has no account is the same, and
// both cost a password check, so the endpoint does not reveal which emails exist.
//
// Guessing is slowed per address: after MAX_FAILURES failed tries inside WINDOW_MS, that
// address is refused until the window has passed. It is per address, never per account,
// so nobody can lock an admin out by guessing at their email from somewhere else.

export const MAX_FAILURES = 10
export const WINDOW_MS    = 15 * 60 * 1000

export type LoginResult =
  | { ok: true; user: SessionUser; token: string; expiresAt: Date }
  | { ok: false; reason: 'invalid' | 'throttled' }

// Checked when the email has no account, so that case takes as long as a real one.
// Made on first use: Cloudflare does not allow random values outside a request.
let noAccountHash: Promise<string> | undefined

export async function login(db: Db, email: string, password: string, ip: string, now = new Date()): Promise<LoginResult> {
  const ipHash      = await sha256(ip)
  const windowStart = timestamp(new Date(now.getTime() - WINDOW_MS))

  await db.prepare('DELETE FROM login_failures WHERE failed_at <= ?').bind(windowStart).run()
  const recent = await db
    .prepare('SELECT count(*) AS n FROM login_failures WHERE ip_hash = ? AND failed_at > ?')
    .bind(ipHash, windowStart)
    .first<{ n: number }>()
  if ((recent?.n ?? 0) >= MAX_FAILURES) return { ok: false, reason: 'throttled' }

  const user = await db
    .prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
    .bind(email.trim().toLowerCase())
    .first<{ id: string; email: string; password_hash: string }>()

  noAccountHash ??= hashPassword('no account uses this password')
  const check = await verifyPassword(password, user?.password_hash ?? await noAccountHash)
  if (!user || !check.ok) {
    await db.prepare('INSERT INTO login_failures (ip_hash, failed_at) VALUES (?, ?)').bind(ipHash, timestamp(now)).run()
    return { ok: false, reason: 'invalid' }
  }

  // A password that was still in the format Supabase stored moves to the cheap one now.
  await db
    .prepare('UPDATE users SET password_hash = ?, last_sign_in_at = ? WHERE id = ?')
    .bind(check.upgradedHash ?? user.password_hash, timestamp(now), user.id)
    .run()
  await db.prepare('DELETE FROM login_failures WHERE ip_hash = ?').bind(ipHash).run()

  const session = await createSession(db, user.id, now)
  return { ok: true, user: { id: user.id, email: user.email }, ...session }
}
