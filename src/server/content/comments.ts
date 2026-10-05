import type { Db } from '../db'

// Comments. Anyone may leave one and it waits as "pending"; everyone sees the approved
// ones; the endpoints let only an admin see pending ones, approve or remove them.

export interface CommentRow {
  id: string
  episode_id: string
  author: string
  body: string
  status: 'pending' | 'approved'
  created_at: string
}

// The admin list also carries the episode title, in the shape the panel already reads.
export type PendingComment = CommentRow & { episodes: { title: string } }

export const MAX_AUTHOR = 50
export const MAX_BODY   = 500

export async function listApprovedComments(db: Db, episodeId: string): Promise<CommentRow[]> {
  return (await db
    .prepare("SELECT * FROM comments WHERE episode_id = ? AND status = 'approved' ORDER BY created_at ASC")
    .bind(episodeId)
    .all<CommentRow>()).results
}

export async function listPendingComments(db: Db): Promise<PendingComment[]> {
  const rows = (await db
    .prepare(`SELECT c.*, e.title AS episode_title
              FROM comments c JOIN episodes e ON e.id = c.episode_id
              WHERE c.status = 'pending' ORDER BY c.created_at ASC`)
    .all<CommentRow & { episode_title: string }>()).results
  return rows.map(({ episode_title, ...comment }) => ({ ...comment, episodes: { title: episode_title } }))
}

export type SubmitResult = 'ok' | 'invalid' | 'no_episode'

// A new comment is always pending, whatever the request says.
export async function submitComment(db: Db, episodeId: string, author: unknown, text: unknown): Promise<SubmitResult> {
  if (typeof author !== 'string' || typeof text !== 'string') return 'invalid'
  const name = author.trim(), message = text.trim()
  if (!name || !message || characters(name) > MAX_AUTHOR || characters(message) > MAX_BODY) return 'invalid'

  if (!await db.prepare('SELECT 1 FROM episodes WHERE id = ?').bind(episodeId).first()) return 'no_episode'

  await db
    .prepare("INSERT INTO comments (id, episode_id, author, body, status) VALUES (?, ?, ?, ?, 'pending')")
    .bind(crypto.randomUUID(), episodeId, name, message)
    .run()
  return 'ok'
}

export async function approveComment(db: Db, id: string): Promise<boolean> {
  const { meta } = await db.prepare("UPDATE comments SET status = 'approved' WHERE id = ?").bind(id).run()
  return meta.changes > 0
}

export async function rejectComment(db: Db, id: string): Promise<boolean> {
  const { meta } = await db.prepare('DELETE FROM comments WHERE id = ?').bind(id).run()
  return meta.changes > 0
}

// Counted the way the database counts: whole characters, so "ñ" or an emoji is one.
function characters(text: string): number {
  return [...text].length
}
