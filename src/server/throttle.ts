import { timestamp, type Db } from './db'
import { sha256 } from './auth/sessions'

// How many public writes one address may make in a window. Generous for a person,
// tight for a script: a class leaving comments after an episode fits easily. Only
// writes that went through are counted, so a typo does not use up the allowance.
export const LIMITS = {
  comment:  { max: 5,  windowMs: 10 * 60 * 1000 },
  reaction: { max: 60, windowMs: 10 * 60 * 1000 },
} as const

export type Scope = keyof typeof LIMITS

export async function overAllowance(db: Db, scope: Scope, ip: string, now = new Date()): Promise<boolean> {
  const { max, windowMs } = LIMITS[scope]
  const windowStart = timestamp(new Date(now.getTime() - windowMs))

  await db.prepare('DELETE FROM public_writes WHERE scope = ? AND at <= ?').bind(scope, windowStart).run()
  const recent = await db
    .prepare('SELECT count(*) AS n FROM public_writes WHERE scope = ? AND ip_hash = ? AND at > ?')
    .bind(scope, await sha256(ip), windowStart)
    .first<{ n: number }>()
  return (recent?.n ?? 0) >= max
}

export async function countWrite(db: Db, scope: Scope, ip: string, now = new Date()): Promise<void> {
  await db.prepare('INSERT INTO public_writes (scope, ip_hash, at) VALUES (?, ?, ?)').bind(scope, await sha256(ip), timestamp(now)).run()
}
