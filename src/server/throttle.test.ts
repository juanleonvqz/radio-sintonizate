import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type TestDb } from './testing/sqlite-db'
import { call } from './testing/request'
import { countWrite, overAllowance, LIMITS } from './throttle'
import * as epComments  from '../pages/api/episodes/[id]/comments'
import * as epReactions from '../pages/api/episodes/[id]/reactions'

const EP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOW = new Date('2026-10-06T12:00:00.000Z')

let db: TestDb
beforeEach(() => {
  db = createTestDb()
  db.raw.exec(`INSERT INTO episodes (id, title, audio_path) VALUES ('${EP}', 'Uno', 'a.mp3')`)
})

describe('one address cannot flood the site', () => {
  const comment = (ip: string, n: number) => call(epComments.POST, { db, method: 'POST', params: { id: EP }, body: { author: 'Ana', body: `Comentario ${n}` }, ip })
  const react   = (ip: string) => call(epReactions.POST, { db, method: 'POST', params: { id: EP }, body: { emoji: '🔥' }, ip })

  it(`takes ${LIMITS.comment.max} comments from an address, then asks it to wait`, async () => {
    for (let i = 1; i <= LIMITS.comment.max; i++) expect((await comment('203.0.113.7', i)).status, `comment ${i}`).toBe(201)
    const refused = await comment('203.0.113.7', 99)
    expect(refused).toEqual({ status: 429, data: { error: 'too_many' } })
    expect((db.raw.prepare('SELECT count(*) AS n FROM comments').get() as { n: number }).n).toBe(LIMITS.comment.max)
  })

  it('does not hold one visitor to another one\'s allowance', async () => {
    for (let i = 1; i <= LIMITS.comment.max; i++) await comment('203.0.113.7', i)
    expect((await comment('198.51.100.9', 1)).status).toBe(201)
  })

  it(`takes ${LIMITS.reaction.max} reactions from an address, then asks it to wait`, async () => {
    for (let i = 1; i <= LIMITS.reaction.max; i++) expect((await react('203.0.113.7')).status, `reaction ${i}`).toBe(201)
    expect((await react('203.0.113.7')).status).toBe(429)
    expect((await react('198.51.100.9')).status).toBe(201)
  })

  it('counts comments and reactions separately', async () => {
    for (let i = 1; i <= LIMITS.comment.max; i++) await comment('203.0.113.7', i)
    expect((await react('203.0.113.7')).status).toBe(201)
  })

  it('does not count a comment that was refused for its content', async () => {
    for (let i = 1; i <= LIMITS.comment.max; i++) {
      expect((await call(epComments.POST, { db, method: 'POST', params: { id: EP }, body: { author: '', body: 'x' }, ip: '203.0.113.7' })).status).toBe(400)
    }
    expect((await comment('203.0.113.7', 1)).status).toBe(201)
  })

  it('lets the address write again once the window has passed, and forgets old rows', async () => {
    for (let i = 1; i <= LIMITS.comment.max; i++) await countWrite(db, 'comment', '203.0.113.7', NOW)
    expect(await overAllowance(db, 'comment', '203.0.113.7', new Date(NOW.getTime() + LIMITS.comment.windowMs - 1000))).toBe(true)
    expect(await overAllowance(db, 'comment', '203.0.113.7', new Date(NOW.getTime() + LIMITS.comment.windowMs))).toBe(false)
    expect((db.raw.prepare('SELECT count(*) AS n FROM public_writes').get() as { n: number }).n).toBe(0)
  })

  it('stores the address as a hash', async () => {
    await countWrite(db, 'comment', '203.0.113.7', NOW)
    const row = db.raw.prepare('SELECT ip_hash FROM public_writes').get() as { ip_hash: string }
    expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(row.ip_hash).not.toContain('203.0.113.7')
  })
})
