import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type TestDb } from './testing/sqlite-db'
import { call, SITE } from './testing/request'
import { createSession } from './auth/sessions'

import * as episodes     from '../pages/api/episodes/index'
import * as episode      from '../pages/api/episodes/[id]/index'
import * as epComments   from '../pages/api/episodes/[id]/comments'
import * as epReactions  from '../pages/api/episodes/[id]/reactions'
import * as pending      from '../pages/api/comments/pending'
import * as comment      from '../pages/api/comments/[id]'
import * as setting      from '../pages/api/settings/[key]'
import * as session      from '../pages/api/auth/session'

// Each block is named after the Supabase policy it replaces (exported 2026-10-05).
// "anonymous" is a visitor with no session; "admin" is a signed-in account.

const OLD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NEW = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

let db: TestDb
let admin: string
const count = (table: string) => (db.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n

beforeEach(async () => {
  db = createTestDb()
  db.raw.exec(`
    INSERT INTO episodes (id, title, program, description, date, audio_path, cover_path, created_at) VALUES
      ('${OLD}', 'Primero', 'Noticias', 'Desc', '2025-10-06', 'a1.mp3', 'c1.webp', '2026-03-21T10:00:00.000Z'),
      ('${NEW}', 'Segundo', NULL, NULL, NULL, 'a2.m4a', NULL, '2026-06-23T10:00:00.000Z');
    INSERT INTO comments (id, episode_id, author, body, status, created_at) VALUES
      ('c-late',    '${OLD}', 'Ana',  'Segundo comentario', 'approved', '2026-06-02T10:00:00.000Z'),
      ('c-early',   '${OLD}', 'Luis', 'Primer comentario',  'approved', '2026-06-01T10:00:00.000Z'),
      ('c-pending', '${OLD}', 'Eva',  'Sin revisar',        'pending',  '2026-06-03T10:00:00.000Z');
    INSERT INTO reactions (id, episode_id, emoji) VALUES ('r1', '${OLD}', '👏'), ('r2', '${OLD}', '👏'), ('r3', '${OLD}', '🔥');
    INSERT INTO site_settings (key, value) VALUES ('site_description', 'La radio del IES');
    INSERT INTO users (id, email, password_hash) VALUES ('u1', 'ofelia@example.com', 'h');
  `)
  admin = (await createSession(db, 'u1')).token
})

describe('episodes: public read', () => {
  it('anyone gets every episode, newest first', async () => {
    const { status, data } = await call(episodes.GET, { db })
    expect(status).toBe(200)
    expect(data.map((e: any) => e.title)).toEqual(['Segundo', 'Primero'])
    expect(data[1]).toEqual({ id: OLD, title: 'Primero', program: 'Noticias', description: 'Desc', date: '2025-10-06', audio_path: 'a1.mp3', cover_path: 'c1.webp', created_at: '2026-03-21T10:00:00.000Z' })
  })

  it('anyone gets one episode by id, and 404 for an unknown one', async () => {
    expect((await call(episode.GET, { db, params: { id: NEW } })).data.title).toBe('Segundo')
    expect((await call(episode.GET, { db, params: { id: 'nope' } })).status).toBe(404)
  })
})

describe('episodes: auth insert', () => {
  const fresh = { title: 'Tercero', program: 'Especiales', description: '', date: '2026-10-05', audio_path: 'a3.mp3', cover_path: null }

  it('anonymous is refused and nothing is added', async () => {
    expect((await call(episodes.POST, { db, method: 'POST', body: fresh })).status).toBe(401)
    expect(count('episodes')).toBe(2)
  })

  it('an admin adds an episode', async () => {
    const { status, data } = await call(episodes.POST, { db, method: 'POST', body: fresh, token: admin })
    expect(status).toBe(201)
    expect(data).toMatchObject({ title: 'Tercero', program: 'Especiales', description: null, date: '2026-10-05', audio_path: 'a3.mp3', cover_path: null })
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/)
    expect((await call(episodes.GET, { db })).data[0].title).toBe('Tercero')
  })

  it('an admin cannot add one without a title, without audio, or with a date that does not exist', async () => {
    for (const bad of [{ ...fresh, title: ' ' }, { ...fresh, audio_path: undefined }, { ...fresh, date: '2026-02-31' }, { ...fresh, date: '05/10/2026' }, 'not json']) {
      expect((await call(episodes.POST, { db, method: 'POST', body: bad, token: admin })).status).toBe(400)
    }
    expect(count('episodes')).toBe(2)
  })
})

describe('episodes: auth update', () => {
  it('anonymous is refused and nothing changes', async () => {
    expect((await call(episode.PATCH, { db, method: 'PATCH', params: { id: OLD }, body: { title: 'Hackeado' } })).status).toBe(401)
    expect((await call(episode.GET, { db, params: { id: OLD } })).data.title).toBe('Primero')
  })

  it('an admin changes only the fields that were sent', async () => {
    const { status, data } = await call(episode.PATCH, { db, method: 'PATCH', params: { id: OLD }, body: { title: 'Primero (editado)', program: '' }, token: admin })
    expect(status).toBe(200)
    expect(data).toMatchObject({ title: 'Primero (editado)', program: null, description: 'Desc', date: '2025-10-06', audio_path: 'a1.mp3', cover_path: 'c1.webp' })
  })

  it('ignores columns it does not know, including the id', async () => {
    const { data } = await call(episode.PATCH, { db, method: 'PATCH', params: { id: OLD }, body: { id: 'other', created_at: 'x', 'title = title; --': 1, title: 'Bien' }, token: admin })
    expect(data).toMatchObject({ id: OLD, title: 'Bien', created_at: '2026-03-21T10:00:00.000Z' })
  })

  it('answers 404 for an unknown episode and 400 for a bad value', async () => {
    expect((await call(episode.PATCH, { db, method: 'PATCH', params: { id: 'nope' }, body: { title: 'x' }, token: admin })).status).toBe(404)
    expect((await call(episode.PATCH, { db, method: 'PATCH', params: { id: OLD }, body: { title: '' }, token: admin })).status).toBe(400)
  })
})

describe('episodes: auth delete', () => {
  it('anonymous is refused and nothing is removed', async () => {
    expect((await call(episode.DELETE, { db, method: 'DELETE', params: { id: OLD } })).status).toBe(401)
    expect(count('episodes')).toBe(2)
  })

  it('an admin removes an episode, and its comments and reactions go with it', async () => {
    const { status, data } = await call(episode.DELETE, { db, method: 'DELETE', params: { id: OLD }, token: admin })
    expect(status).toBe(200)
    expect(data).toMatchObject({ id: OLD, audio_path: 'a1.mp3', cover_path: 'c1.webp' })
    expect([count('episodes'), count('comments'), count('reactions')]).toEqual([1, 0, 0])
    expect((await call(episode.DELETE, { db, method: 'DELETE', params: { id: OLD }, token: admin })).status).toBe(404)
  })
})

describe('comments: public read approved', () => {
  it('anyone gets the approved comments of an episode, oldest first, and never a pending one', async () => {
    const { status, data } = await call(epComments.GET, { db, params: { id: OLD } })
    expect(status).toBe(200)
    expect(data.map((c: any) => c.id)).toEqual(['c-early', 'c-late'])
  })
})

describe('comments: auth read all', () => {
  it('anonymous cannot see what is waiting for review', async () => {
    expect((await call(pending.GET, { db })).status).toBe(401)
  })

  it('an admin sees pending comments with the title of their episode', async () => {
    const { data } = await call(pending.GET, { db, token: admin })
    expect(data).toEqual([{ id: 'c-pending', episode_id: OLD, author: 'Eva', body: 'Sin revisar', status: 'pending', created_at: '2026-06-03T10:00:00.000Z', episodes: { title: 'Primero' } }])
  })
})

describe('comments: public insert (pending only)', () => {
  const post = (body: unknown, id = OLD) => call(epComments.POST, { db, method: 'POST', params: { id }, body })

  it('anyone can leave a comment; it waits as pending and does not show yet', async () => {
    expect((await post({ author: '  Marta ', body: ' ¡Muy bueno! ' })).status).toBe(201)
    const row = db.raw.prepare("SELECT author, body, status FROM comments WHERE author = 'Marta'").get()
    expect(row).toEqual({ author: 'Marta', body: '¡Muy bueno!', status: 'pending' })
    expect((await call(epComments.GET, { db, params: { id: OLD } })).data).toHaveLength(2)
  })

  it('nobody can post a comment as already approved', async () => {
    await post({ author: 'Listo', body: 'Aprobado por mí', status: 'approved' })
    expect((db.raw.prepare("SELECT status FROM comments WHERE author = 'Listo'").get() as any).status).toBe('pending')
  })

  it('keeps the old limits: 50 characters of name, 500 of text, neither empty', async () => {
    expect((await post({ author: 'ñ'.repeat(50), body: '🎙️'.repeat(250) })).status).toBe(201)
    for (const bad of [{ author: 'a'.repeat(51), body: 'ok' }, { author: 'ok', body: 'a'.repeat(501) }, { author: ' ', body: 'ok' }, { author: 'ok', body: '' }, { author: 1, body: 'ok' }, {}]) {
      expect((await post(bad)).status).toBe(400)
    }
  })

  it('answers 404 for an episode that does not exist', async () => {
    expect((await post({ author: 'a', body: 'b' }, 'nope')).status).toBe(404)
  })
})

describe('comments: auth update and auth delete', () => {
  it('anonymous can neither approve nor remove', async () => {
    expect((await call(comment.PATCH,  { db, method: 'PATCH',  params: { id: 'c-pending' } })).status).toBe(401)
    expect((await call(comment.DELETE, { db, method: 'DELETE', params: { id: 'c-early' } })).status).toBe(401)
    expect(count('comments')).toBe(3)
    expect((await call(epComments.GET, { db, params: { id: OLD } })).data).toHaveLength(2)
  })

  it('an admin approves a comment and it shows up', async () => {
    expect((await call(comment.PATCH, { db, method: 'PATCH', params: { id: 'c-pending' }, token: admin })).status).toBe(200)
    expect((await call(epComments.GET, { db, params: { id: OLD } })).data.map((c: any) => c.id)).toEqual(['c-early', 'c-late', 'c-pending'])
    expect((await call(pending.GET, { db, token: admin })).data).toEqual([])
  })

  it('an admin rejects a comment and it is gone', async () => {
    expect((await call(comment.DELETE, { db, method: 'DELETE', params: { id: 'c-pending' }, token: admin })).status).toBe(200)
    expect(count('comments')).toBe(2)
    expect((await call(comment.DELETE, { db, method: 'DELETE', params: { id: 'c-pending' }, token: admin })).status).toBe(404)
    expect((await call(comment.PATCH,  { db, method: 'PATCH',  params: { id: 'nope' }, token: admin })).status).toBe(404)
  })
})

describe('reactions: public read and public insert', () => {
  it('anyone reads the counts per emoji', async () => {
    expect((await call(epReactions.GET, { db, params: { id: OLD } })).data).toEqual({ '👏': 2, '🔥': 1 })
    expect((await call(epReactions.GET, { db, params: { id: NEW } })).data).toEqual({})
  })

  it('anyone adds a reaction', async () => {
    expect((await call(epReactions.POST, { db, method: 'POST', params: { id: OLD }, body: { emoji: '❤️' } })).status).toBe(201)
    expect((await call(epReactions.GET, { db, params: { id: OLD } })).data).toEqual({ '👏': 2, '🔥': 1, '❤️': 1 })
  })

  it('refuses an emoji outside the list and an episode that does not exist', async () => {
    expect((await call(epReactions.POST, { db, method: 'POST', params: { id: OLD }, body: { emoji: '💩' } })).status).toBe(400)
    expect((await call(epReactions.POST, { db, method: 'POST', params: { id: OLD }, body: {} })).status).toBe(400)
    expect((await call(epReactions.POST, { db, method: 'POST', params: { id: 'nope' }, body: { emoji: '🔥' } })).status).toBe(404)
    expect(count('reactions')).toBe(3)
  })
})

describe('site_settings: public read, auth upsert and auth update', () => {
  it('anyone reads a setting; an unset one is null', async () => {
    expect((await call(setting.GET, { db, params: { key: 'site_description' } })).data).toEqual({ value: 'La radio del IES' })
    expect((await call(setting.GET, { db, params: { key: 'banner_visible' } })).data).toEqual({ value: null })
  })

  it('anonymous cannot change one', async () => {
    expect((await call(setting.PUT, { db, method: 'PUT', params: { key: 'site_description' }, body: { value: 'x' } })).status).toBe(401)
    expect((await call(setting.GET, { db, params: { key: 'site_description' } })).data.value).toBe('La radio del IES')
  })

  it('an admin creates and updates settings', async () => {
    await call(setting.PUT, { db, method: 'PUT', params: { key: 'banner_visible' }, body: { value: '0' }, token: admin })
    await call(setting.PUT, { db, method: 'PUT', params: { key: 'site_description' }, body: { value: 'Nueva' }, token: admin })
    expect((await call(setting.GET, { db, params: { key: 'banner_visible' } })).data.value).toBe('0')
    expect((await call(setting.GET, { db, params: { key: 'site_description' } })).data.value).toBe('Nueva')
    expect(count('site_settings')).toBe(2)
    expect((await call(setting.PUT, { db, method: 'PUT', params: { key: 'x' }, body: { value: 1 }, token: admin })).status).toBe(400)
  })
})

describe('across every endpoint', () => {
  const changing = () => [
    ['add episode',     episodes.POST,    { method: 'POST',   body: { title: 't', audio_path: 'a.mp3' } }],
    ['edit episode',    episode.PATCH,    { method: 'PATCH',  params: { id: OLD }, body: { title: 't' } }],
    ['leave comment',   epComments.POST,  { method: 'POST',   params: { id: OLD }, body: { author: 'a', body: 'b' } }],
    ['add reaction',    epReactions.POST, { method: 'POST',   params: { id: OLD }, body: { emoji: '🔥' } }],
    ['approve comment', comment.PATCH,    { method: 'PATCH',  params: { id: 'c-pending' } }],
    ['reject comment',  comment.DELETE,   { method: 'DELETE', params: { id: 'c-pending' } }],
    ['change setting',  setting.PUT,      { method: 'PUT',    params: { key: 'k' }, body: { value: 'v' } }],
    ['delete episode',  episode.DELETE,   { method: 'DELETE', params: { id: OLD } }],
  ] as const

  it('a change coming from another site is refused, even with an admin session', async () => {
    for (const [name, handler, request] of changing()) {
      for (const origin of ['https://evil.example', null]) {
        const { status } = await call(handler, { db, ...request, token: admin, origin })
        expect(status, `${name} from ${origin}`).toBe(403)
      }
    }
    expect([count('episodes'), count('comments'), count('reactions'), count('site_settings')]).toEqual([2, 3, 3, 1])
  })

  it('the same changes from this site with an admin session all go through', async () => {
    for (const [name, handler, request] of changing()) {
      const { status } = await call(handler, { db, ...request, token: admin, origin: SITE })
      expect(status, name).toBeLessThan(300)
    }
  })

  it('a made-up or expired session counts as anonymous', async () => {
    expect((await call(pending.GET, { db, token: 'made-up' })).status).toBe(401)

    db.raw.exec("UPDATE sessions SET expires_at = '2020-01-01T00:00:00.000Z'")
    expect((await call(pending.GET, { db, token: admin })).status).toBe(401)
    expect((await call(session.GET, { db, token: admin })).data).toEqual({ user: null })
  })

  it('answers 503 where the database is not attached yet, instead of crashing', async () => {
    for (const handler of [episodes.GET, episodes.POST, pending.GET, setting.GET, session.GET]) {
      const { status, data } = await call(handler, { db: null, token: admin })
      expect(status).toBe(503)
      expect(data).toEqual({ error: 'not_configured' })
    }
  })
})
