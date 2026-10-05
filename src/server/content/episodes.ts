import type { Db } from '../db'
import type { Episode } from '../../lib/types'

// Episodes. Reading is open to everyone; the endpoints let only an admin write.

export type EpisodeFields = Omit<Episode, 'id' | 'created_at'>

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listEpisodes(db: Db): Promise<Episode[]> {
  return (await db.prepare('SELECT * FROM episodes ORDER BY created_at DESC').all<Episode>()).results
}

export async function getEpisode(db: Db, id: string): Promise<Episode | null> {
  return db.prepare('SELECT * FROM episodes WHERE id = ?').bind(id).first<Episode>()
}

export async function createEpisode(db: Db, fields: EpisodeFields): Promise<Episode> {
  const id = crypto.randomUUID()
  await db
    .prepare('INSERT INTO episodes (id, title, program, description, date, audio_path, cover_path) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, fields.title, fields.program, fields.description, fields.date, fields.audio_path, fields.cover_path)
    .run()
  return (await getEpisode(db, id))!
}

const COLUMNS = ['title', 'program', 'description', 'date', 'audio_path', 'cover_path'] as const

export async function updateEpisode(db: Db, id: string, fields: Partial<EpisodeFields>): Promise<Episode | null> {
  // Column names go into the SQL text, so only the known ones are ever used.
  const columns = COLUMNS.filter(column => column in fields)
  if (columns.length) {
    await db
      .prepare(`UPDATE episodes SET ${columns.map(c => `${c} = ?`).join(', ')} WHERE id = ?`)
      .bind(...columns.map(c => fields[c]), id)
      .run()
  }
  return getEpisode(db, id)
}

// Returns the removed episode so the caller can remove its files. Its comments and
// reactions go with it (ON DELETE CASCADE).
export async function deleteEpisode(db: Db, id: string): Promise<Episode | null> {
  const episode = await getEpisode(db, id)
  if (episode) await db.prepare('DELETE FROM episodes WHERE id = ?').bind(id).run()
  return episode
}

// ── Input ─────────────────────────────────────────────────────────────────────

// Reads episode fields from a request body, keeping only known columns (so the SQL
// above can never be handed a column name from outside). With `partial`, fields that
// are absent stay untouched; otherwise the optional ones default to empty.
export function readEpisodeFields(input: Record<string, unknown>, partial: false): EpisodeFields | null
export function readEpisodeFields(input: Record<string, unknown>, partial: true): Partial<EpisodeFields> | null
export function readEpisodeFields(input: Record<string, unknown>, partial: boolean): Partial<EpisodeFields> | null {
  const fields: Partial<EpisodeFields> = {}

  for (const key of ['title', 'audio_path'] as const) {
    if (key in input || !partial) {
      if (typeof input[key] !== 'string' || !(input[key] as string).trim()) return null
      fields[key] = (input[key] as string).trim()
    }
  }
  for (const key of ['program', 'description', 'cover_path'] as const) {
    if (key in input || !partial) {
      const value = input[key] ?? null
      if (value !== null && typeof value !== 'string') return null
      fields[key] = value || null
    }
  }
  if ('date' in input || !partial) {
    const value = input.date ?? null
    if (value !== null && !isCalendarDate(value)) return null
    fields.date = value as string | null
  }
  return fields
}

function isCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}
