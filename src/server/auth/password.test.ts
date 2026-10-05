import { describe, it, expect } from 'vitest'
import bcrypt from 'bcryptjs'
import { hashPassword, verifyPassword } from './password'

// Published test vectors, not hashes made by the library under test. The first comes
// from the test suite of Go's x/crypto/bcrypt, the library Supabase Auth hashes with.
const SUPABASE_STYLE = { password: 'allmine', hash: '$2a$10$XajjQvNhvvRt5GSeFk1xFeyqRrsxkhBkUiQeg0dt.wU1qD4aFDcga' }
const OPENBSD_STYLE  = { password: 'abc',     hash: '$2a$10$WvvTPHKwdBJ3uk0Z37EMR.hLA2W6N9AEBhEgrAOljy2Ae5MtaSIUi' }

describe('passwords brought over from Supabase (bcrypt)', () => {
  it('accepts the same password that worked before', async () => {
    expect((await verifyPassword(SUPABASE_STYLE.password, SUPABASE_STYLE.hash)).ok).toBe(true)
    expect((await verifyPassword(OPENBSD_STYLE.password, OPENBSD_STYLE.hash)).ok).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const check = await verifyPassword('allmine!', SUPABASE_STYLE.hash)
    expect(check).toEqual({ ok: false })
  })

  it('accepts the $2b$ and $2y$ spellings of the same hash', async () => {
    for (const prefix of ['$2b$', '$2y$']) {
      const hash = prefix + SUPABASE_STYLE.hash.slice(4)
      expect((await verifyPassword(SUPABASE_STYLE.password, hash)).ok).toBe(true)
    }
  })

  it('accepts accents and symbols', async () => {
    const password = 'contraseña-Ñandú_2026€'
    const hash = await bcrypt.hash(password, 10)
    expect((await verifyPassword(password, hash)).ok).toBe(true)
    expect((await verifyPassword('contrasena-Nandu_2026€', hash)).ok).toBe(false)
  })

  it('hands back the native format, and the same password works against it', async () => {
    const check = await verifyPassword(SUPABASE_STYLE.password, SUPABASE_STYLE.hash)
    expect(check.upgradedHash).toMatch(/^pbkdf2-sha256\$100000\$/)

    const again = await verifyPassword(SUPABASE_STYLE.password, check.upgradedHash)
    expect(again).toEqual({ ok: true })
    expect((await verifyPassword('allmine!', check.upgradedHash)).ok).toBe(false)
  })

  it('does not hand back a new hash when the password was wrong', async () => {
    expect((await verifyPassword('nope', SUPABASE_STYLE.hash)).upgradedHash).toBeUndefined()
  })
})

describe('passwords in the native format (PBKDF2)', () => {
  it('round-trips', async () => {
    const hash = await hashPassword('correct horse')
    expect(await verifyPassword('correct horse', hash)).toEqual({ ok: true })
    expect(await verifyPassword('correct horsf', hash)).toEqual({ ok: false })
  })

  it('salts every hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'))
  })
})

describe('bad input', () => {
  it('fails the login instead of throwing', async () => {
    const stored = [
      null, undefined, '', 'plaintext', '$2a$10$tooshort',
      'pbkdf2-sha256$100000$onlythree', 'pbkdf2-sha256$abc$AAAA$AAAA', 'pbkdf2-sha256$100000$!!!$!!!',
    ]
    for (const value of stored) {
      expect(await verifyPassword('anything', value)).toEqual({ ok: false })
    }
  })

  it('rejects an empty password', async () => {
    expect(await verifyPassword('', SUPABASE_STYLE.hash)).toEqual({ ok: false })
    expect(await verifyPassword('', await hashPassword(''))).toEqual({ ok: false })
  })
})
