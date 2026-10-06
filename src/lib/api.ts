import type { Episode } from './types'

// Everything the page asks the server for. Same functions as the old Supabase layer,
// now talking to this site's own /api and /media endpoints (src/pages/api, src/server).

// ── Files ─────────────────────────────────────────────────────────────────────

const origin = () => (typeof location === 'undefined' ? '' : location.origin)

export function coverUrl(path: string | null): string | null {
  return path ? `${origin()}/media/covers/${encodeURIComponent(path)}` : null
}

export function audioUrl(path: string): string {
  return `${origin()}/media/audio/${encodeURIComponent(path)}`
}

// ── Episodes ──────────────────────────────────────────────────────────────────

export async function fetchEpisodes(): Promise<Episode[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    return await request<Episode[]>('GET', '/api/episodes', undefined, controller.signal)
  } catch (err: any) {
    if (err.name === 'AbortError') throw new Error('timeout')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchEpisodeById(id: string): Promise<Episode | null> {
  try { return await request<Episode>('GET', `/api/episodes/${encodeURIComponent(id)}`) }
  catch { return null }
}

export async function insertEpisode(ep: Omit<Episode, 'id' | 'created_at'>): Promise<void> {
  await request('POST', '/api/episodes', ep)
}

export async function updateEpisode(id: string, fields: Partial<Omit<Episode, 'id' | 'created_at'>>): Promise<void> {
  await request('PATCH', `/api/episodes/${encodeURIComponent(id)}`, fields)
}

// The server removes the audio and cover along with the episode; the paths are kept
// in the signature so callers did not have to change.
export async function deleteEpisode(id: string, _audioPath: string, _coverPath: string | null): Promise<void> {
  await request('DELETE', `/api/episodes/${encodeURIComponent(id)}`)
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface SessionUser { id: string; email: string }

// Same answer shapes as before: callers read `error` and `data.session`.
export async function signIn(email: string, password: string) {
  try {
    const { user } = await request<{ user: SessionUser }>('POST', '/api/auth/login', { email, password })
    return { data: { user }, error: null }
  } catch (err: any) {
    return { data: null, error: { message: err.message as string } }
  }
}

export async function signOut() {
  try { await request('POST', '/api/auth/logout') } catch { /* the cookie is cleared either way */ }
  return { error: null }
}

export async function getSession() {
  try {
    const { user } = await request<{ user: SessionUser | null }>('GET', '/api/auth/session')
    return { data: { session: user ? { user } : null } }
  } catch {
    return { data: { session: null } }
  }
}

// ── Uploads ───────────────────────────────────────────────────────────────────

export async function uploadAudio(path: string, file: File): Promise<void> {
  await upload('audio', path, file, file.type)
}

export async function uploadCover(path: string, blob: Blob): Promise<void> {
  await upload('covers', path, blob, 'image/webp')
}

// A connection that drops mid-upload is tried again, up to three times. The name stays
// the same, so if the first try did land the retry is told "exists" and checks the
// stored size instead of giving up.
async function upload(folder: 'audio' | 'covers', path: string, body: Blob, type: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      // With no declared type the server works one out from the file name.
      const response = await fetch(`/api/media/${folder}/${encodeURIComponent(path)}`, {
        method: 'PUT',
        headers: type ? { 'Content-Type': type } : {},
        body,
      })
      if (response.ok) return
      if (response.status === 409 && attempt > 1 && await storedSize(folder, path) === body.size) return
      throw new Error(await errorMessage(response))
    } catch (err) {
      // fetch reports a network failure as a TypeError; anything else is a real answer
      if (attempt >= 3 || !(err instanceof TypeError)) throw err
    }
  }
}

async function storedSize(folder: 'audio' | 'covers', path: string): Promise<number | null> {
  const response = await fetch(`/media/${folder}/${encodeURIComponent(path)}`, { headers: { Range: 'bytes=0-0' } })
  const total = /\/(\d+)$/.exec(response.headers.get('Content-Range') ?? '')
  return total ? Number(total[1]) : null
}

// What to tell the admin when publishing or saving fails.
export function explainError(err: unknown): string {
  const reasons: Record<string, string> = {
    too_large:    'el archivo supera los 50 MB',
    wrong_type:   'el archivo no es un audio o una imagen',
    exists:       'ya existe un archivo con ese nombre',
    incomplete:   'la subida se cortó antes de terminar',
    invalid_name: 'el nombre del archivo no es válido',
    unauthorized: 'la sesión ha caducado, vuelve a entrar',
    invalid:      'faltan datos o alguno no es válido',
    timeout:      'el servidor no responde',
  }
  const message = err instanceof Error ? err.message : String(err)
  if (err instanceof TypeError) return 'se perdió la conexión durante la subida'
  return reasons[message] ?? message
}

// ── Live updates ──────────────────────────────────────────────────────────────
// Supabase pushed changes over a socket. Here the page asks again at a steady pace,
// only while the tab is visible, and tells the subscriber when the answer differs.

export interface Subscription { unsubscribe(): void }

export function subscribeToEpisodes(onChange: () => void): Subscription {
  return watch(() => request('GET', '/api/episodes'), 30_000, onChange)
}

export function subscribeToSettings(onChange: () => void): Subscription {
  return watch(() => Promise.all(['site_description', 'banner_visible'].map(getSetting)), 60_000, onChange)
}

export function subscribeToReactions(episodeId: string, onChange: () => void): Subscription {
  return watch(() => getReactions(episodeId), 10_000, onChange)
}

export function subscribeToComments(episodeId: string, onChange: () => void): Subscription {
  return watch(() => getApprovedComments(episodeId), 10_000, onChange)
}

function watch<T>(read: () => Promise<T>, everyMs: number, onChange: () => void): Subscription {
  let last: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const hidden = () => typeof document !== 'undefined' && document.hidden

  const check = async () => {
    if (stopped) return
    if (!hidden()) {
      try {
        const now = JSON.stringify(await read())
        if (last !== undefined && now !== last) onChange()
        last = now
      } catch { /* ask again next time */ }
    }
    if (!stopped) timer = setTimeout(check, everyMs)
  }
  const onVisible = () => { if (!hidden()) { clearTimeout(timer); check() } }

  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
  check()   // the first answer is the baseline; later ones are compared with it

  return {
    unsubscribe() {
      stopped = true
      clearTimeout(timer)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
    },
  }
}

// ── Site settings ─────────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const { value } = await request<{ value: string | null }>('GET', `/api/settings/${encodeURIComponent(key)}`)
  return value
}

export async function setSetting(key: string, value: string): Promise<void> {
  await request('PUT', `/api/settings/${encodeURIComponent(key)}`, { value })
}

// ── Audio duration helper ─────────────────────────────────────────────────────
// Reads the length of an audio file without downloading all of it: a hidden <audio>
// element resolves once its metadata has loaded.

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
  try { return await request<ReactionCounts>('GET', `/api/episodes/${encodeURIComponent(episodeId)}/reactions`) }
  catch { return {} }
}

export async function addReaction(episodeId: string, emoji: Emoji): Promise<void> {
  try { await request('POST', `/api/episodes/${encodeURIComponent(episodeId)}/reactions`, { emoji }) }
  catch { /* the count on screen was already bumped; the next refresh corrects it */ }
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
  try { return await request<Comment[]>('GET', `/api/episodes/${encodeURIComponent(episodeId)}/comments`) }
  catch { return [] }
}

export async function submitComment(episodeId: string, author: string, body: string): Promise<void> {
  await request('POST', `/api/episodes/${encodeURIComponent(episodeId)}/comments`, {
    author: author.trim().slice(0, 50),
    body:   body.trim().slice(0, 500),
  })
}

// Admin only
export async function getPendingComments(): Promise<(Comment & { episodes: { title: string } })[]> {
  try { return await request('GET', '/api/comments/pending') }
  catch { return [] }
}

export async function approveComment(id: string): Promise<void> {
  await request('PATCH', `/api/comments/${encodeURIComponent(id)}`)
}

export async function rejectComment(id: string): Promise<void> {
  await request('DELETE', `/api/comments/${encodeURIComponent(id)}`)
}

// ── HTTP ──────────────────────────────────────────────────────────────────────

async function request<T = unknown>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body:    body === undefined ? undefined : JSON.stringify(body),
    signal,
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json() as Promise<T>
}

async function errorMessage(response: Response): Promise<string> {
  const data = await response.json().catch(() => null) as { error?: string } | null
  return data?.error ?? `HTTP ${response.status}`
}
