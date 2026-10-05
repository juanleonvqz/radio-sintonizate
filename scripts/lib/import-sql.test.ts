import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import { exportToSql, carriedOverEmails } from './import-sql.mjs'

// D1 is SQLite, so the real migration and the generated SQL run here against SQLite
// itself, with foreign keys on as D1 has them.
const MIGRATION = fs.readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8')

const EP_1 = '11111111-1111-4111-8111-111111111111'
const EP_2 = '22222222-2222-4222-8222-222222222222'

const EXPORT = {
  episodes: [
    { id: EP_1, title: "Día de Canarias: l'hora", program: 'Especiales', description: 'Línea uno\nLínea dos; con "comillas"', date: '2026-06-23', audio_path: '1782205259493-dia.mp3', cover_path: '1782205259493-cover.webp', created_at: '2026-06-23T09:00:00.000Z' },
    { id: EP_2, title: 'Sin portada', program: null, description: null, date: null, audio_path: '1774208716179-x.m4a', cover_path: null, created_at: '2026-03-22T10:00:00.000Z' },
  ],
  comments: [
    { id: 'c1', episode_id: EP_1, author: 'Ana', body: "¡Qué bueno! It's great", status: 'approved', created_at: '2026-06-24T10:00:00.000Z' },
    { id: 'c2', episode_id: EP_1, author: 'Luis', body: 'Pendiente', status: 'pending', created_at: '2026-06-25T10:00:00.000Z' },
  ],
  reactions: [
    { id: 'r1', episode_id: EP_1, emoji: '❤️', created_at: '2026-06-24T10:00:00.000Z' },
    { id: 'r2', episode_id: EP_2, emoji: '🎙️', created_at: '2026-06-24T11:00:00.000Z' },
  ],
  site_settings: [
    { key: 'site_description', value: 'La radio del IES', updated_at: '2026-03-22T10:00:00.000Z' },
  ],
  users: [
    { id: 'u1', email: 'Admin@Example.com', encrypted_password: '$2a$10$XajjQvNhvvRt5GSeFk1xFeyqRrsxkhBkUiQeg0dt.wU1qD4aFDcga', created_at: '2026-03-21T21:30:00.000Z', last_sign_in_at: '2026-06-23T08:00:00.000Z', banned_until: null, deleted_at: null },
    { id: 'u2', email: 'never-set@example.com', encrypted_password: null, created_at: '2026-03-21T21:30:00.000Z', last_sign_in_at: null, banned_until: null, deleted_at: null },
    { id: 'u3', email: 'gone@example.com', encrypted_password: '$2a$10$x', created_at: '2026-03-21T21:30:00.000Z', last_sign_in_at: null, banned_until: null, deleted_at: '2026-04-01T00:00:00.000Z' },
  ],
}

let db: DatabaseSync
const all = (sql: string) => db.prepare(sql).all() as Record<string, unknown>[]
const count = (table: string) => (all(`SELECT count(*) AS n FROM ${table}`)[0].n as number)

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(MIGRATION)
})

describe('loading an export', () => {
  it('brings every row across exactly as it was', () => {
    db.exec(exportToSql(EXPORT))

    expect(all('SELECT * FROM episodes ORDER BY created_at DESC')).toEqual(EXPORT.episodes)
    expect(all('SELECT * FROM comments ORDER BY id')).toEqual(EXPORT.comments)
    expect(all('SELECT * FROM reactions ORDER BY id')).toEqual(EXPORT.reactions)
    expect(all('SELECT * FROM site_settings')).toEqual(EXPORT.site_settings)
  })

  it('carries over only accounts someone can log in with, keeping the stored hash', () => {
    db.exec(exportToSql(EXPORT))

    expect(carriedOverEmails(EXPORT.users)).toEqual(['admin@example.com'])
    expect(all('SELECT * FROM users')).toEqual([{
      id: 'u1',
      email: 'admin@example.com',
      password_hash: EXPORT.users[0].encrypted_password,
      created_at: '2026-03-21T21:30:00.000Z',
      last_sign_in_at: '2026-06-23T08:00:00.000Z',
    }])
  })

  it('replaces the earlier copy when run again', () => {
    db.exec(exportToSql(EXPORT))
    db.exec("INSERT INTO reactions (id, episode_id, emoji) VALUES ('stale', '" + EP_1 + "', '🔥')")
    db.exec(exportToSql(EXPORT))

    expect(count('episodes')).toBe(2)
    expect(count('reactions')).toBe(2)
    expect(count('users')).toBe(1)
  })

  it('refuses values that are neither text nor null', () => {
    const broken = { ...EXPORT, episodes: [{ ...EXPORT.episodes[0], title: 42 }] }
    expect(() => exportToSql(broken as never)).toThrow(TypeError)
  })
})

describe('the schema keeps the limits the old database had', () => {
  beforeEach(() => db.exec(exportToSql(EXPORT)))
  const insertComment = (fields: string, values: string) =>
    () => db.exec(`INSERT INTO comments (id, episode_id, ${fields}) VALUES ('x', '${EP_1}', ${values})`)

  it('comments: 50 characters of author, 500 of body, counted as characters', () => {
    expect(insertComment('author, body', `'${'ñ'.repeat(50)}', '${'é'.repeat(500)}'`)).not.toThrow()
    expect(insertComment('author, body', `'${'a'.repeat(51)}', 'ok'`)).toThrow()
    expect(insertComment('author, body', `'ok', '${'a'.repeat(501)}'`)).toThrow()
  })

  it('comments: start as pending and only know two states', () => {
    db.exec(`INSERT INTO comments (id, episode_id, author, body) VALUES ('new', '${EP_1}', 'a', 'b')`)
    expect(all("SELECT status FROM comments WHERE id = 'new'")[0].status).toBe('pending')
    expect(insertComment('author, body, status', "'a', 'b', 'published'")).toThrow()
  })

  it('comments and reactions need an existing episode and go when it goes', () => {
    expect(() => db.exec("INSERT INTO reactions (id, episode_id, emoji) VALUES ('x', 'no-such-episode', '🔥')")).toThrow()

    db.exec(`DELETE FROM episodes WHERE id = '${EP_1}'`)
    expect(count('comments')).toBe(0)
    expect(count('reactions')).toBe(1)
  })

  it('reactions: only the known emoji', () => {
    expect(() => db.exec(`INSERT INTO reactions (id, episode_id, emoji) VALUES ('x', '${EP_1}', '💩')`)).toThrow()
  })

  it('episodes: a date is YYYY-MM-DD or empty', () => {
    expect(() => db.exec("INSERT INTO episodes (id, title, audio_path, date) VALUES ('x', 't', 'a.mp3', '23/06/2026')")).toThrow()
    expect(() => db.exec("INSERT INTO episodes (id, title, audio_path) VALUES ('y', 't', 'a.mp3')")).not.toThrow()
    expect(all("SELECT created_at FROM episodes WHERE id = 'y'")[0].created_at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/)
  })

  it('accounts: one per email, whatever the capitals', () => {
    expect(() => db.exec("INSERT INTO users (id, email, password_hash) VALUES ('dup', 'ADMIN@example.com', 'h')")).toThrow()
  })
})
