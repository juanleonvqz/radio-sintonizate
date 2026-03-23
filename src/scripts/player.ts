import { sb, coverUrl, audioUrl, fetchEpisodeById } from '../lib/supabase'
import type { Episode } from '../lib/types'

// ── State ─────────────────────────────────────────────────────────────────────
export let aud: HTMLAudioElement
export let curId: string | null = null
export let playing = false
export let eps: Episode[] = []

export function setEps(data: Episode[]) { eps = data }

// ── Init ──────────────────────────────────────────────────────────────────────
export function initPlayer() {
  aud = document.getElementById('aud') as HTMLAudioElement
  aud.addEventListener('timeupdate', onTimeUpdate)
  aud.addEventListener('play',  () => { playing = true;  updatePP() })
  aud.addEventListener('pause', () => { playing = false; updatePP() })
  aud.addEventListener('ended', () => {
    playing = false; updatePP()
    const fill = document.getElementById('pfill')
    if (fill) fill.style.width = '0%'
  })
}

// ── Playback ──────────────────────────────────────────────────────────────────
export async function playEp(id: string) {
  let ep: Episode | null = eps.find(e => e.id === id) ?? null
  if (!ep) {
    ep = await fetchEpisodeById(id)
    if (!ep) { toast('No se pudo cargar el episodio.'); return }
  }

  curId = id
  const pProg  = document.getElementById('p-prog')
  const pTitle = document.getElementById('p-title')
  if (pProg)  pProg.textContent  = ep.program || 'Radio Sintonízate'
  if (pTitle) pTitle.textContent = ep.title

  const th = document.getElementById('pth') as HTMLImageElement | null
  const ph = document.getElementById('pth-ph')
  const cv = coverUrl(ep.cover_path)
  if (th && ph) {
    if (cv) { th.src = cv; th.style.display = 'block'; ph.style.display = 'none' }
    else    { th.style.display = 'none'; ph.style.display = 'flex' }
  }

  document.getElementById('player')?.classList.add('on')
  document.getElementById('fab')?.classList.add('up')

  aud.src = audioUrl(ep.audio_path)
  aud.play().catch(() => {})

  document.querySelectorAll('.card').forEach(c => c.classList.remove('playing'))
  document.getElementById(`card-${id}`)?.classList.add('playing')

  setMediaSession(ep, cv)
}

export function togglePlay() {
  if (!aud?.src) return
  playing ? aud.pause() : aud.play()
}

export function skip(s: number) {
  if (aud?.src) aud.currentTime = Math.max(0, aud.currentTime + s)
}

export function seekMini(e: MouseEvent) {
  if (!aud?.duration) return
  const bar = document.getElementById('pmini')
  if (!bar) return
  const pct = (e.clientX - bar.getBoundingClientRect().left) / bar.offsetWidth
  aud.currentTime = Math.max(0, Math.min(1, pct)) * aud.duration
}

export function closePlayer() {
  aud?.pause(); playing = false; curId = null
  document.getElementById('player')?.classList.remove('on')
  document.getElementById('fab')?.classList.remove('up')
  document.querySelectorAll('.card').forEach(c => c.classList.remove('playing'))
  updatePP()
}

export function scrollToCard() {
  if (!curId) return
  document.getElementById(`card-${curId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

// ── Internal ──────────────────────────────────────────────────────────────────
function updatePP() {
  const play  = document.getElementById('ico-play')
  const pause = document.getElementById('ico-pause')
  const wave  = document.getElementById('mwave')
  if (play)  play.style.display  = playing ? 'none'  : 'block'
  if (pause) pause.style.display = playing ? 'block' : 'none'
  wave?.classList.toggle('on', playing)
  // Drive header waveform animation via body class
  document.body.classList.toggle('audio-playing', playing)
  // Sync card play/pause icons
  notifyGrid()
}

function onTimeUpdate() {
  if (!aud?.duration) return
  const pct = (aud.currentTime / aud.duration) * 100
  const fill = document.getElementById('pfill')
  const cur  = document.getElementById('tcur')
  const tot  = document.getElementById('ttot')
  if (fill) fill.style.width = `${pct}%`
  if (cur)  cur.textContent  = ft(aud.currentTime)
  if (tot)  tot.textContent  = ft(aud.duration)
}

function ft(s: number): string {
  if (!s || isNaN(s)) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function setMediaSession(ep: Episode, cv: string | null) {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: ep.title,
    artist: ep.program || 'Radio Sintonízate',
    album: 'IES El Mayorazgo',
    artwork: cv ? [{ src: cv, sizes: '512x512', type: 'image/jpeg' }] : [],
  })
  navigator.mediaSession.setActionHandler('play',         () => aud.play())
  navigator.mediaSession.setActionHandler('pause',        () => aud.pause())
  navigator.mediaSession.setActionHandler('seekbackward', () => skip(-15))
  navigator.mediaSession.setActionHandler('seekforward',  () => skip(15))
}

export function toast(msg: string) {
  const t = document.getElementById('toast')
  if (!t) return
  t.textContent = msg; t.classList.add('on')
  setTimeout(() => { t.classList.remove('on') }, 3200)
}

// Imported lazily to avoid circular dependency
function notifyGrid() {
  import('./grid').then(m => m.syncCardStates())
}