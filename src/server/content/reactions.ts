import type { Db } from '../db'

// Emoji reactions. Open to everyone, to read and to add.

// What the database accepts. The site offers the first four.
export const REACTION_EMOJI = ['👏', '❤️', '🎙️', '🔥', '😂']

export async function reactionCounts(db: Db, episodeId: string): Promise<Record<string, number>> {
  const rows = (await db
    .prepare('SELECT emoji, count(*) AS n FROM reactions WHERE episode_id = ? GROUP BY emoji')
    .bind(episodeId)
    .all<{ emoji: string; n: number }>()).results
  return Object.fromEntries(rows.map(row => [row.emoji, row.n]))
}

export type ReactResult = 'ok' | 'invalid' | 'no_episode'

export async function addReaction(db: Db, episodeId: string, emoji: unknown): Promise<ReactResult> {
  if (typeof emoji !== 'string' || !REACTION_EMOJI.includes(emoji)) return 'invalid'
  if (!await db.prepare('SELECT 1 FROM episodes WHERE id = ?').bind(episodeId).first()) return 'no_episode'

  await db
    .prepare('INSERT INTO reactions (id, episode_id, emoji) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), episodeId, emoji)
    .run()
  return 'ok'
}
