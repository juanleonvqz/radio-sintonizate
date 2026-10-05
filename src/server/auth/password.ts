import bcrypt from 'bcryptjs'

// Password checking for the site's own login (the move off Supabase Auth).
//
// Two stored formats are accepted:
//  - bcrypt ($2a$ / $2b$ / $2y$): what Supabase Auth stores. An account brought over
//    keeps its hash exactly as it was, so the same password keeps working.
//  - pbkdf2-sha256$<iterations>$<salt>$<hash> (base64): the format written here. It
//    runs on the platform's native crypto, which is far cheaper on Cloudflare.
//
// A correct login against a bcrypt hash also returns `upgradedHash`: the same password
// in the native format. The caller stores it in place of the old hash, so each account
// pays the slow bcrypt check once. Nothing changes for the person logging in.

const BCRYPT_SHAPE      = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/
const PBKDF2_PREFIX     = 'pbkdf2-sha256'
const PBKDF2_ITERATIONS = 100_000   // the most Cloudflare Workers accepts
const SALT_BYTES        = 16
const HASH_BITS         = 256

export interface PasswordCheck {
  ok: boolean
  upgradedHash?: string
}

// ── Hashing ───────────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return [PBKDF2_PREFIX, PBKDF2_ITERATIONS, toBase64(salt), toBase64(hash)].join('$')
}

// ── Verifying ─────────────────────────────────────────────────────────────────

// Never throws: a missing or unreadable stored value is simply a failed login.
export async function verifyPassword(
  password: string,
  stored: string | null | undefined
): Promise<PasswordCheck> {
  if (!password || !stored) return { ok: false }

  try {
    if (BCRYPT_SHAPE.test(stored)) {
      if (!(await bcrypt.compare(password, stored))) return { ok: false }
      return { ok: true, upgradedHash: await hashPassword(password) }
    }
    return { ok: await verifyPbkdf2(password, stored) }
  } catch {
    return { ok: false }
  }
}

async function verifyPbkdf2(password: string, stored: string): Promise<boolean> {
  const [prefix, iterations, salt, hash] = stored.split('$')
  if (prefix !== PBKDF2_PREFIX || !/^\d+$/.test(iterations ?? '') || !salt || !hash) return false

  const expected = fromBase64(hash)
  const actual   = await pbkdf2(password, fromBase64(salt), Number(iterations))
  return sameBytes(actual, expected)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key  = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, HASH_BITS)
  return new Uint8Array(bits)
}

// Compares every byte regardless of where the first difference is, so the time taken
// says nothing about how close a guess was.
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), ch => ch.charCodeAt(0))
}
