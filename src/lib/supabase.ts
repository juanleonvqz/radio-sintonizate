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
  const { error } = await sb.storage.from('covers').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw error
}

// ── Realtime ──────────────────────────────────────────────────────────────────

export function subscribeToEpisodes(onChange: () => void) {
  return sb
    .channel('episodes-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'episodes' }, onChange)
    .subscribe()
}