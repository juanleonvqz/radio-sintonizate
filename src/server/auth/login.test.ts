import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type TestDb } from '../testing/sqlite-db'
import { login, MAX_FAILURES, WINDOW_MS } from './login'
import { findSession } from './sessions'

// An account as it arrives from Supabase: bcrypt hash, published test vector.
const EMAIL    = 'ofelia@example.com'
const PASSWORD = 'allmine'
const SUPABASE_HASH = '$2a$10$XajjQvNhvvRt5GSeFk1xFeyqRrsxkhBkUiQeg0dt.wU1qD4aFDcga'

const NOW = new Date('2026-10-05T12:00:00.000Z')
const IP  = '203.0.113.7'
const minutesLater = (m: number) => new Date(NOW.getTime() + m * 60 * 1000)

let db: TestDb
const storedHash = () => (db.raw.prepare('SELECT password_hash FROM users WHERE id = ?').get('u1') as { password_hash: string }).password_hash
const failures   = () => (db.raw.prepare('SELECT count(*) AS n FROM login_failures').get() as { n: number }).n

beforeEach(() => {
  db = createTestDb()
  db.raw.prepare('INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)').run('u1', EMAIL, SUPABASE_HASH)
})

describe('logging in with an account carried over from Supabase', () => {
  it('accepts the same email and password as before and opens a session', async () => {
    const result = await login(db, EMAIL, PASSWORD, IP, NOW)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.user).toEqual({ id: 'u1', email: EMAIL })
    expect((await findSession(db, result.token, NOW))?.user).toEqual({ id: 'u1', email: EMAIL })
  })

  it('moves the stored password to the cheap format on that first login, and it still works after', async () => {
    expect(storedHash()).toBe(SUPABASE_HASH)

    expect((await login(db, EMAIL, PASSWORD, IP, NOW)).ok).toBe(true)
    expect(storedHash()).toMatch(/^pbkdf2-sha256\$100000\$/)

    const upgraded = storedHash()
    expect((await login(db, EMAIL, PASSWORD, IP, NOW)).ok).toBe(true)
    expect(storedHash()).toBe(upgraded)
    expect((await login(db, EMAIL, 'wrong', IP, NOW)).ok).toBe(false)
  })

  it('does not care about capitals or stray spaces in the email', async () => {
    expect((await login(db, '  Ofelia@Example.COM ', PASSWORD, IP, NOW)).ok).toBe(true)
  })

  it('records when the account last signed in', async () => {
    await login(db, EMAIL, PASSWORD, IP, NOW)
    const row = db.raw.prepare('SELECT last_sign_in_at FROM users WHERE id = ?').get('u1') as { last_sign_in_at: string }
    expect(row.last_sign_in_at).toBe(NOW.toISOString())
  })
})

describe('refusing a login', () => {
  it('gives the same answer for a wrong password and for an email with no account', async () => {
    const wrongPassword = await login(db, EMAIL, 'wrong', IP, NOW)
    const noAccount     = await login(db, 'nobody@example.com', PASSWORD, IP, NOW)

    expect(wrongPassword).toEqual({ ok: false, reason: 'invalid' })
    expect(noAccount).toEqual({ ok: false, reason: 'invalid' })
    expect(storedHash()).toBe(SUPABASE_HASH)
    expect((db.raw.prepare('SELECT count(*) AS n FROM sessions').get() as { n: number }).n).toBe(0)
  })

  it('refuses an empty password', async () => {
    expect(await login(db, EMAIL, '', IP, NOW)).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('slowing down guessing', () => {
  const failTimes = async (n: number, ip = IP, at = NOW) => {
    for (let i = 0; i < n; i++) await login(db, 'nobody@example.com', 'guess', ip, at)
  }

  it(`refuses an address after ${MAX_FAILURES} failed tries, even with the right password`, async () => {
    await failTimes(MAX_FAILURES - 1)
    expect((await login(db, EMAIL, 'wrong', IP, NOW)).ok).toBe(false)

    expect(await login(db, EMAIL, PASSWORD, IP, NOW)).toEqual({ ok: false, reason: 'throttled' })
  })

  it('does not lock the admin out when the guessing comes from somewhere else', async () => {
    await failTimes(MAX_FAILURES, '198.51.100.9')
    expect((await login(db, EMAIL, PASSWORD, IP, NOW)).ok).toBe(true)
  })

  it('lets the address try again once the window has passed', async () => {
    await failTimes(MAX_FAILURES)
    expect((await login(db, EMAIL, PASSWORD, IP, minutesLater(14))).ok).toBe(false)
    expect((await login(db, EMAIL, PASSWORD, IP, new Date(NOW.getTime() + WINDOW_MS))).ok).toBe(true)
  })

  it('forgets earlier slips after a successful login', async () => {
    await failTimes(3)
    expect(failures()).toBe(3)

    await login(db, EMAIL, PASSWORD, IP, NOW)
    expect(failures()).toBe(0)
  })

  it('stores the address as a hash and drops old entries', async () => {
    await failTimes(2)
    const rows = db.raw.prepare('SELECT ip_hash FROM login_failures').all() as { ip_hash: string }[]
    expect(rows.every(r => /^[0-9a-f]{64}$/.test(r.ip_hash) && !r.ip_hash.includes(IP))).toBe(true)

    await login(db, 'nobody@example.com', 'guess', '198.51.100.9', minutesLater(20))
    expect(failures()).toBe(1)
  })
})
