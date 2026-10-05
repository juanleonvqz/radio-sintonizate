import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type TestDb } from '../testing/sqlite-db'
import {
  createSession, findSession, deleteSession,
  sessionCookie, clearedSessionCookie, readSessionToken, SESSION_COOKIE,
} from './sessions'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-05T12:00:00.000Z')
const later = (days: number) => new Date(NOW.getTime() + days * DAY)

let db: TestDb
beforeEach(() => {
  db = createTestDb()
  db.raw.exec("INSERT INTO users (id, email, password_hash) VALUES ('u1', 'ofelia@example.com', 'h')")
})

describe('sessions', () => {
  it('signs the user in with the token that was handed out', async () => {
    const { token } = await createSession(db, 'u1', NOW)
    expect(await findSession(db, token, NOW)).toEqual({ user: { id: 'u1', email: 'ofelia@example.com' } })
  })

  it('knows nothing about a missing or made-up token', async () => {
    await createSession(db, 'u1', NOW)
    expect(await findSession(db, null, NOW)).toBeNull()
    expect(await findSession(db, 'made-up', NOW)).toBeNull()
  })

  it('stores a hash of the token, never the token', async () => {
    const { token } = await createSession(db, 'u1', NOW)
    const stored = db.raw.prepare('SELECT token_hash FROM sessions').get() as { token_hash: string }
    expect(stored.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(stored.token_hash).not.toContain(token)
    expect(await findSession(db, stored.token_hash, NOW)).toBeNull()
  })

  it('gives every session its own long random token', async () => {
    const a = await createSession(db, 'u1', NOW)
    const b = await createSession(db, 'u1', NOW)
    expect(a.token).not.toBe(b.token)
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('lasts 90 days, then stops working', async () => {
    const { token, expiresAt } = await createSession(db, 'u1', NOW)
    expect(expiresAt).toEqual(later(90))
    expect(await findSession(db, token, later(89.9))).not.toBeNull()

    const untouched = await createSession(db, 'u1', NOW)
    expect(await findSession(db, untouched.token, later(90.1))).toBeNull()
  })

  it('is pushed out again when used in its second half, so a device in use stays signed in', async () => {
    const { token } = await createSession(db, 'u1', NOW)

    expect((await findSession(db, token, later(10)))?.renewedUntil).toBeUndefined()

    const used = await findSession(db, token, later(50))
    expect(used?.renewedUntil).toEqual(later(140))
    expect(await findSession(db, token, later(130))).not.toBeNull()
  })

  it('ends on sign-out, for that device only', async () => {
    const phone  = await createSession(db, 'u1', NOW)
    const laptop = await createSession(db, 'u1', NOW)

    await deleteSession(db, phone.token)
    await deleteSession(db, null)

    expect(await findSession(db, phone.token, NOW)).toBeNull()
    expect(await findSession(db, laptop.token, NOW)).not.toBeNull()
  })

  it('ends when the account is removed', async () => {
    const { token } = await createSession(db, 'u1', NOW)
    db.raw.exec("DELETE FROM users WHERE id = 'u1'")
    expect(await findSession(db, token, NOW)).toBeNull()
  })
})

describe('the session cookie', () => {
  it('is hidden from page scripts, sent over HTTPS only, and only by this site', () => {
    const cookie = sessionCookie('tok', later(90))
    expect(cookie).toContain(`${SESSION_COOKIE}=tok;`)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain(`Expires=${later(90).toUTCString()}`)
  })

  it('is cleared by an expiry in the past', () => {
    expect(clearedSessionCookie()).toContain(`${SESSION_COOKIE}=;`)
    expect(clearedSessionCookie()).toContain('Expires=Thu, 01 Jan 1970')
  })

  it('is read back from a request, among other cookies', () => {
    const request = (cookie?: string) => new Request('https://radiosintonizate.com/', { headers: cookie ? { Cookie: cookie } : {} })
    expect(readSessionToken(request(`theme=dark; ${SESSION_COOKIE}=abc-123_x; other=1`))).toBe('abc-123_x')
    expect(readSessionToken(request('theme=dark'))).toBeNull()
    expect(readSessionToken(request())).toBeNull()
    expect(readSessionToken(request(`${SESSION_COOKIE}=`))).toBeNull()
  })
})
