import { createClient } from '@supabase/supabase-js'
import type { Episode } from './types'

// createClient is called once and exported — all modules import from here
export const sb = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY
)

// ── Storage helpers ───────────────────────────────────────────────────────────

export function coverUrl(path: string | null): string | null {
  if (!path) return null
  return sb.storage.from('covers').getPublicUrl(path).data.publicUrl
}

export function audioUrl(path: string): string {
  return sb.storage.from('audio').getPublicUrl(path).data.publicUrl
}

// ── Episode queries ───────────────────────────────────────────────────────────

export async function fetchEpisodes(): Promise<Episode[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  try {
    const { data, error } = await sb
      .from('episodes')
      .select('*')
      .order('created_at', { ascending: false })
    clearTimeout(timer)
    if (error) throw error
    return data ?? []
  } catch (err: any) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('timeout')
    throw err
  }
}

export async function fetchEpisodeById(id: string): Promise<Episode | null> {
  const { data, error } = await sb
    .from('episodes')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

export async function insertEpisode(ep: Omit<Episode, 'id' | 'created_at'>): Promise<void> {
  const { error } = await sb.from('episodes').insert(ep)
  if (error) throw error
}

export async function updateEpisode(
  id: string,
  fields: Partial<Omit<Episode, 'id' | 'created_at'>>
): Promise<void> {
  const { error } = await sb.from('episodes').update(fields).eq('id', id)
  if (error) throw error
}

export async function deleteEpisode(id: string, audioPth: string, coverPth: string | null): Promise<void> {
  const { error } = await sb.from('episodes').delete().eq('id', id)
  if (error) throw error
  await sb.storage.from('audio').remove([audioPth])
  if (coverPth) await sb.storage.from('covers').remove([coverPth])
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string) {
  return sb.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  return sb.auth.signOut()
}

export async function getSession() {
  return sb.auth.getSession()
}

// ── Storage uploads ───────────────────────────────────────────────────────────

export async function uploadAudio(path: string, file: File): Promise<void> {
  const { error } = await sb.storage.from('audio').upload(path, file, { contentType: file.type })
  if (error) throw error
}

export async function uploadCover(path: string, blob: Blob): Promise<void> {
  const { error } = await sb.storage.from('covers').upload(path, blob, { contentType: 'image/webp' })
  if (error) throw error
}

// ── Realtime ──────────────────────────────────────────────────────────────────

export function subscribeToEpisodes(onChange: () => void) {
  return sb
    .channel('episodes-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'episodes' }, onChange)
    .subscribe()
}

// ── Site settings (global, Supabase-backed) ───────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const { data } = await sb
    .from('site_settings')
    .select('value')
    .eq('key', key)
    .single()
  return data?.value ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  const { error } = await sb
    .from('site_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() })
  if (error) throw error
}

export function subscribeToSettings(onChange: () => void) {
  return sb
    .channel('settings-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'site_settings' }, onChange)
    .subscribe()
}

// ── Audio duration helper ─────────────────────────────────────────────────────
// Fetches duration of an audio file without downloading it fully.
// Uses a hidden <audio> element — resolves once metadata loads.

const durationCache = new Map<string, number>()

export function getAudioDuration(url: string): Promise<number> {
  if (durationCache.has(url)) return Promise.resolve(durationCache.get(url)!)
  return new Promise((resolve) => {
    const a = document.createElement('audio')
    a.preload = 'metadata'
    a.onloadedmetadata = () => {
      const d = isFinite(a.duration) ? a.duration : 0
      durationCache.set(url, d)
      resolve(d)
    }
    a.onerror = () => resolve(0)
    a.src = url
  })
}

// ── Emoji reactions ───────────────────────────────────────────────────────────

export const EMOJIS = ['👏', '❤️', '🎙️', '🔥'] as const
export type Emoji = typeof EMOJIS[number]

export interface ReactionCounts {
  [emoji: string]: number
}

export async function getReactions(episodeId: string): Promise<ReactionCounts> {
  const { data } = await sb
    .from('reactions')
    .select('emoji')
    .eq('episode_id', episodeId)
  if (!data) return {}
  return data.reduce((acc: ReactionCounts, row) => {
    acc[row.emoji] = (acc[row.emoji] ?? 0) + 1
    return acc
  }, {})
}

export async function addReaction(episodeId: string, emoji: Emoji): Promise<void> {
  await sb.from('reactions').insert({ episode_id: episodeId, emoji })
}

export function subscribeToReactions(episodeId: string, onChange: () => void) {
  return sb
    .channel(`reactions-${episodeId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'reactions',
      filter: `episode_id=eq.${episodeId}`
    }, onChange)
    .subscribe()
}

// ── Comments ──────────────────────────────────────────────────────────────────

export interface Comment {
  id:         string
  episode_id: string
  author:     string
  body:       string
  status:     'pending' | 'approved'
  created_at: string
}

export async function getApprovedComments(episodeId: string): Promise<Comment[]> {
  const { data } = await sb
    .from('comments')
    .select('*')
    .eq('episode_id', episodeId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function submitComment(episodeId: string, author: string, body: string): Promise<void> {
  const { error } = await sb.from('comments').insert({
    episode_id: episodeId,
    author: author.trim().slice(0, 50),
    body: body.trim().slice(0, 500),
    status: 'pending',
  })
  if (error) throw error
}

// Admin only
export async function getPendingComments(): Promise<Comment[]> {
  const { data } = await sb
    .from('comments')
    .select('*, episodes(title)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function approveComment(id: string): Promise<void> {
  const { error } = await sb.from('comments').update({ status: 'approved' }).eq('id', id)
  if (error) throw error
}

export async function rejectComment(id: string): Promise<void> {
  const { error } = await sb.from('comments').delete().eq('id', id)
  if (error) throw error
}

export function subscribeToComments(episodeId: string, onChange: () => void) {
  return sb
    .channel(`comments-${episodeId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'comments',
      filter: `episode_id=eq.${episodeId}`,
    }, onChange)
    .subscribe()
}