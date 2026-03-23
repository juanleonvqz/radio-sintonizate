import { coverUrl, audioUrl, getAudioDuration, getReactions, addReaction, subscribeToReactions, EMOJIS, getApprovedComments, submitComment, subscribeToComments } from '../lib/supabase'
import type { ReactionCounts } from '../lib/supabase'
import { eps, curId, playing, playEp, skip } from './player'
import { shareEp } from './share'
import type { Episode } from '../lib/types'

let activeF   = 'all'
let searchQ   = ''
let currentModalId: string | null = null
let reactionUnsub: (() => void) | null = null
let commentUnsub:  (() => void) | null = null

// ── Listened tracking ─────────────────────────────────────────────────────────
function getListened(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem('rm-listened') || '[]')) }
  catch { return new Set() }
}
function markListened(id: string) {
  const s = getListened(); s.add(id)
  localStorage.setItem('rm-listened', JSON.stringify([...s]))
}

export function renderAll() {
  renderNav()
  renderGrid()
}

export function setFilter(v: string, btn?: HTMLElement) {
  activeF = v
  document.querySelectorAll('.nl').forEach(el => el.classList.remove('on'))
  btn?.classList.add('on')
  renderGrid()
}

// Called by player.ts on every play/pause change
export function syncCardStates() {
  document.querySelectorAll<HTMLElement>('.card').forEach(card => {
    const id      = card.dataset.id
    const isThis  = id === curId
    const nowPlay = isThis && playing

    card.classList.toggle('playing', nowPlay)
    card.classList.toggle('paused',  isThis && !playing && !!curId)

    // Play/pause icon on button
    const playIco  = card.querySelector<SVGElement>('.card-play-ico')
    const pauseIco = card.querySelector<SVGElement>('.card-pause-ico')
    if (playIco && pauseIco) {
      playIco.style.display  = nowPlay ? 'none'  : 'block'
      pauseIco.style.display = nowPlay ? 'block' : 'none'
    }

    // Animated now-playing overlay on cover
    const overlay = card.querySelector<HTMLElement>('.now-playing-overlay')
    if (overlay) overlay.style.display = nowPlay ? 'flex' : 'none'
  })
  if (currentModalId) syncModal()
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function renderNav() {
  const progs = [...new Set(eps.map(e => e.program).filter(Boolean))]
  const nav = document.getElementById('main-nav')
  if (!nav) return
  nav.innerHTML = `<button class="nl ${activeF === 'all' ? 'on' : ''}" data-filter="all">Todos</button>`
  progs.forEach(p => {
    nav.innerHTML += `<button class="nl ${activeF === p ? 'on' : ''}" data-filter="${esc(p!)}">${p}</button>`
  })
  nav.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.filter!, btn))
  })
}

// ── Grid ──────────────────────────────────────────────────────────────────────
function renderGrid() {
  const grid    = document.getElementById('grid')
  const countEl = document.getElementById('ecount')
  if (!grid) return

  // Apply program filter + search query
  let filtered = activeF === 'all' ? eps : eps.filter(e => e.program === activeF)
  if (searchQ) {
    const q = searchQ.toLowerCase()
    filtered = filtered.filter(e =>
      e.title.toLowerCase().includes(q) ||
      (e.program  ?? '').toLowerCase().includes(q) ||
      (e.description ?? '').toLowerCase().includes(q)
    )
  }

  const total    = filtered.length
  if (countEl) countEl.textContent = searchQ || activeF !== 'all'
    ? `${total} de ${eps.length} episodio${eps.length !== 1 ? 's' : ''}`
    : `${eps.length} episodio${eps.length !== 1 ? 's' : ''}`

  if (!filtered.length) {
    grid.innerHTML = `<div class="state-box">
      <div class="state-ico">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="3"/><path d="M6.343 6.343a8 8 0 1 0 11.314 0"/>
        </svg>
      </div>
      <h3>${searchQ ? 'Sin resultados' : eps.length ? 'Sin episodios aquí' : '¡Próximamente!'}</h3>
      <p>${searchQ
        ? `No hay episodios que coincidan con "<strong>${searchQ}</strong>". Prueba con otro término.`
        : eps.length
          ? 'No hay episodios en este programa todavía.'
          : 'El equipo de Radio Sintonízate está preparando los primeros episodios. ¡Vuelve pronto!'
      }</p>
    </div>`
    return
  }

  const listened = getListened()

  const sorted = [...filtered].sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1; if (!b.date) return -1
    return b.date.localeCompare(a.date)
  })

  // Featured only when not searching and not filtered
  const showFeatured = !searchQ && activeF === 'all'
  const [featured, ...rest] = showFeatured ? sorted : [null, ...sorted]

  const makeCard = (ep: Episode, isFeatured = false) => {
    const cv        = coverUrl(ep.cover_path)
    const isPlaying = ep.id === curId && playing
    const isPaused  = ep.id === curId && !playing && !!curId
    const isDone    = listened.has(ep.id)

    return `<div class="card ${isFeatured ? 'card-featured' : ''} ${isPlaying ? 'playing' : ''} ${isPaused ? 'paused' : ''} ${isDone ? 'card-listened' : ''}" id="card-${ep.id}" data-id="${ep.id}">
      <div class="cimg-wrap">
        ${cv
          ? `<img class="ccover" src="${cv}" alt="${ep.title}" loading="${isFeatured ? 'eager' : 'lazy'}">`
          : `<div class="cph"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#E8A020" stroke-width="1.2"><circle cx="12" cy="12" r="3"/><path d="M6.343 6.343a8 8 0 1 0 11.314 0"/><path d="M9.172 9.172a4 4 0 1 0 5.656 0"/></svg></div>`}
        <div class="now-playing-overlay" style="display:${isPlaying ? 'flex' : 'none'}">
          <div class="np-bars"><span></span><span></span><span></span><span></span></div>
          <span class="np-lbl">Reproduciendo</span>
        </div>
        ${isFeatured ? `<div class="featured-badge">Último episodio</div>` : ''}
      </div>
      <div class="cbody">
        ${ep.date ? `<div class="cmonth">${monthBadge(ep.date)}</div>` : ''}
        <div class="cprog">${ep.program || 'Radio Sintonízate'}</div>
        <div class="ctitle">${ep.title}</div>
        ${ep.description ? `<div class="cdesc">${ep.description}</div>` : ''}
        ${!isDone ? `<div class="cno-desc">Escuchar episodio →</div>` : ''}
        <div class="ctap-hint">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Toca para ver más
        </div>
        <div class="cfoot">
          <span class="cdate">${fmtDate(ep.date)}</span>
          <span class="cdur" id="dur-${ep.id}"></span>
          <div class="cbtns">
            <button class="sharebtn" data-share="${ep.id}" aria-label="Compartir">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
            <button class="playbtn" data-play="${ep.id}" aria-label="${isPlaying ? 'Pausar' : 'Reproducir'}">
              <svg class="card-play-ico"  width="14" height="14" viewBox="0 0 24 24" fill="#0C0906" style="display:${isPlaying ? 'none' : 'block'}"><polygon points="5,3 19,12 5,21"/></svg>
              <svg class="card-pause-ico" width="14" height="14" viewBox="0 0 24 24" fill="#0C0906" style="display:${isPlaying ? 'block' : 'none'}"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>`
  }

  // Featured latest + rest as rows
  grid.innerHTML = `<div class="episodes-flat">
    ${featured ? makeCard(featured, true) : ''}
    ${rest.length ? `<div class="episodes-rest">${rest.map(ep => makeCard(ep)).join('')}</div>` : ''}
  </div>`

  // Wire click handlers
  grid.querySelectorAll<HTMLElement>('[data-id]').forEach(card => {
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return
      openEpisodeModal(card.dataset.id!)
    })
  })
  grid.querySelectorAll<HTMLButtonElement>('[data-play]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const id = btn.dataset.play!
      markListened(id)
      // Hide "Escuchar episodio →" immediately on this card
      const card = document.getElementById(`card-${id}`)
      card?.querySelector<HTMLElement>('.cno-desc')?.remove()
      if (id === curId) {
        import('./player').then(m => m.togglePlay())
      } else {
        playEp(id)
      }
    })
  })
  grid.querySelectorAll<HTMLButtonElement>('[data-share]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); shareEp(btn.dataset.share!) })
  })

  loadDurations(sorted)
}

// ── Search ────────────────────────────────────────────────────────────────────
export function initSearch() {
  const input = document.getElementById('search-inp') as HTMLInputElement | null
  const clear = document.getElementById('search-clear')
  if (!input) return

  input.addEventListener('input', () => {
    searchQ = input.value.trim()
    if (clear) clear.style.display = searchQ ? 'flex' : 'none'
    renderGrid()
  })

  clear?.addEventListener('click', () => {
    searchQ = ''
    input.value = ''
    clear.style.display = 'none'
    renderGrid()
    input.focus()
  })
}

// ── Duration loader ───────────────────────────────────────────────────────────
async function loadDurations(episodes: Episode[]) {
  for (const ep of episodes) {
    const el = document.getElementById(`dur-${ep.id}`)
    if (!el) continue
    try {
      const secs = await getAudioDuration(audioUrl(ep.audio_path))
      if (secs > 0) { el.textContent = fmtDur(secs); el.style.display = 'flex' }
    } catch { /* silent */ }
  }
}

// ── Episode modal ─────────────────────────────────────────────────────────────
export function openEpisodeModal(id: string) {
  const ep = eps.find(e => e.id === id)
  if (!ep) return
  currentModalId = id
  const cv       = coverUrl(ep.cover_path)
  const isPlaying = id === curId && playing

  const modal = document.getElementById('ep-modal')
  const inner = document.getElementById('ep-modal-inner')
  if (!modal || !inner) return

  inner.innerHTML = `
    <div class="modal-hero">
      ${cv
        ? `<img class="modal-cover" src="${cv}" alt="${ep.title}">`
        : `<div class="modal-cover-ph"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#E8A020" stroke-width="1"><circle cx="12" cy="12" r="3"/><path d="M6.343 6.343a8 8 0 1 0 11.314 0"/></svg></div>`}
    </div>
    <div class="modal-body">
      <div class="modal-meta">
        <div class="modal-prog">${ep.program || 'Radio Sintonízate'}</div>
        ${ep.date ? `<div class="modal-date">${fmtDate(ep.date)}</div>` : ''}
      </div>
      <h2 class="modal-title">${ep.title}</h2>
      ${ep.description ? `<p class="modal-desc">${ep.description}</p>` : ''}

      <!-- Reactions + comment icon row -->
      <div class="modal-reactions-row">
        <div class="modal-reactions" id="modal-reactions">
          <div class="reactions-loading">cargando…</div>
        </div>
        <button class="modal-comment-toggle" id="modal-comment-toggle" title="Dejar un comentario">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span id="comment-count-lbl"></span>
        </button>
      </div>

      <!-- Comments section — hidden until icon clicked -->
      <div class="modal-comments" id="modal-comments" style="display:none">
        <div class="modal-comments-header">
          <div class="modal-comments-title">Comentarios</div>
          <div class="modal-comments-notice">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Los comentarios son revisados antes de publicarse
          </div>
        </div>
        <div class="modal-comments-list" id="modal-comments-list"></div>

        <!-- Collapsed: just a button to open form -->
        <div id="comment-form-trigger">
          <button class="comment-open-btn" id="comment-open-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Añadir comentario
          </button>
        </div>

        <!-- Expanded form -->
        <div class="modal-comment-form" id="modal-comment-form" style="display:none">
          <input class="comment-author-inp" id="comment-author" type="text" placeholder="Tu nombre" maxlength="50" autocomplete="off" />
          <textarea class="comment-body-inp" id="comment-body" placeholder="Escribe tu comentario…" maxlength="500" rows="3"></textarea>
          <div class="comment-form-footer">
            <span class="comment-approval-note">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Pendiente de aprobación
            </span>
            <div style="display:flex;gap:.5rem">
              <button class="comment-cancel-btn" id="comment-cancel">Cancelar</button>
              <button class="comment-submit-btn" id="comment-submit" data-ep="${ep.id}">Enviar</button>
            </div>
          </div>
        </div>

        <!-- Success state -->
        <div class="comment-sent" id="comment-sent" style="display:none">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          El comentario será revisado por el profesor/a antes de publicarse.
        </div>
      </div>

      <!-- Built-in player -->
      <div class="modal-player">
        <div class="modal-progress-row">
          <span class="modal-time" id="modal-tcur">0:00</span>
          <div class="modal-progress-bar" id="modal-progress-bar">
            <div class="modal-progress-fill" id="modal-pfill"></div>
            <div class="modal-progress-thumb" id="modal-thumb"></div>
          </div>
          <span class="modal-time" id="modal-ttot">0:00</span>
        </div>
        <div class="modal-controls">
          <button class="modal-skip-btn" id="modal-skip-back" aria-label="−15s">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>
            <span>15</span>
          </button>
          <button class="modal-play-btn" id="modal-ppbtn" data-modal-play="${ep.id}">
            <svg class="modal-play-ico"  width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="display:${isPlaying ? 'none' : 'block'}"><polygon points="5,3 19,12 5,21"/></svg>
            <svg class="modal-pause-ico" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="display:${isPlaying ? 'block' : 'none'}"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          </button>
          <button class="modal-skip-btn" id="modal-skip-fwd" aria-label="+15s">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.51"/></svg>
            <span>15</span>
          </button>
          <button class="modal-share-btn" data-modal-share="${ep.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Compartir
          </button>
        </div>
      </div>
    </div>`

  // Wire player controls
  inner.querySelector<HTMLButtonElement>('#modal-ppbtn')?.addEventListener('click', () => {
    if (id !== curId) playEp(id)
    else import('./player').then(m => m.togglePlay())
  })
  inner.querySelector('#modal-skip-back')?.addEventListener('click', () => skip(-15))
  inner.querySelector('#modal-skip-fwd') ?.addEventListener('click', () => skip(15))

  const bar = inner.querySelector<HTMLElement>('#modal-progress-bar')
  const seekFn = (clientX: number) => {
    const audEl = document.getElementById('aud') as HTMLAudioElement | null
    if (!audEl?.duration) return
    const rect = bar!.getBoundingClientRect()
    audEl.currentTime = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * audEl.duration
  }
  bar?.addEventListener('click', e => seekFn(e.clientX))
  bar?.addEventListener('touchstart', e => { seekFn(e.touches[0].clientX); e.preventDefault() }, { passive: false })

  inner.querySelector<HTMLButtonElement>('[data-modal-share]')?.addEventListener('click', () => shareEp(ep.id))

  modal.classList.add('on')
  document.body.style.overflow = 'hidden'
  startModalSync()

  // Load reactions
  loadReactions(ep.id)
  reactionUnsub?.()
  const rch = subscribeToReactions(ep.id, () => loadReactions(ep.id))
  reactionUnsub = () => rch.unsubscribe()

  // Load comments
  loadComments(ep.id)
  commentUnsub?.()
  const cch = subscribeToComments(ep.id, () => loadComments(ep.id))
  commentUnsub = () => cch.unsubscribe()

  // Comment icon — toggles section open/close
  inner.querySelector<HTMLButtonElement>('#modal-comment-toggle')?.addEventListener('click', () => {
    const sec = inner.querySelector<HTMLElement>('#modal-comments')
    if (!sec) return
    const isOpen = sec.style.display !== 'none'
    sec.style.display = isOpen ? 'none' : 'block'
    const btn = inner.querySelector<HTMLButtonElement>('#modal-comment-toggle')
    if (btn) btn.classList.toggle('active', !isOpen)
    if (!isOpen) {
      loadComments(ep.id)
      sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  })

  // Open comment form
  inner.querySelector<HTMLButtonElement>('#comment-open-btn')?.addEventListener('click', () => {
    inner.querySelector<HTMLElement>('#comment-form-trigger')!.style.display = 'none'
    inner.querySelector<HTMLElement>('#modal-comment-form')!.style.display   = 'flex'
    inner.querySelector<HTMLInputElement>('#comment-author')?.focus()
  })

  // Cancel
  inner.querySelector<HTMLButtonElement>('#comment-cancel')?.addEventListener('click', () => {
    inner.querySelector<HTMLElement>('#modal-comment-form')!.style.display    = 'none'
    inner.querySelector<HTMLElement>('#comment-form-trigger')!.style.display  = 'block'
  })

  // Submit
  inner.querySelector<HTMLButtonElement>('#comment-submit')?.addEventListener('click', async () => {
    const author = inner.querySelector<HTMLInputElement>('#comment-author')?.value.trim() ?? ''
    const body   = inner.querySelector<HTMLTextAreaElement>('#comment-body')?.value.trim() ?? ''
    const btn    = inner.querySelector<HTMLButtonElement>('#comment-submit')!
    if (!author) { inner.querySelector<HTMLInputElement>('#comment-author')?.focus(); return }
    if (!body)   { inner.querySelector<HTMLTextAreaElement>('#comment-body')?.focus(); return }
    btn.disabled = true; btn.textContent = 'Enviando…'
    try {
      await submitComment(ep.id, author, body)
      // Keep modal-comments visible, hide form, show success
      inner.querySelector<HTMLElement>('#modal-comment-form')!.style.display   = 'none'
      inner.querySelector<HTMLElement>('#comment-form-trigger')!.style.display = 'none'
      const sent = inner.querySelector<HTMLElement>('#comment-sent')!
      sent.style.display = 'flex'
      // Scroll success message into view
      sent.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    } catch {
      btn.disabled = false; btn.textContent = 'Enviar'
      alert('Error al enviar. Inténtalo de nuevo.')
    }
  })
}

export function closeEpisodeModal() {
  document.getElementById('ep-modal')?.classList.remove('on')
  document.body.style.overflow = ''
  currentModalId = null
  stopModalSync()
  reactionUnsub?.(); reactionUnsub = null
  commentUnsub?.();  commentUnsub  = null
}

// ── Reactions ─────────────────────────────────────────────────────────────────
async function loadReactions(episodeId: string) {
  const counts = await getReactions(episodeId)
  const el = document.getElementById('modal-reactions')
  if (!el) return

  el.innerHTML = EMOJIS.map(emoji => {
    const n = counts[emoji] ?? 0
    return `<button class="reaction-btn ${n > 0 ? 'has-count' : ''}" data-emoji="${emoji}" data-ep="${episodeId}">
      <span class="reaction-emoji">${emoji}</span>
      ${n > 0 ? `<span class="reaction-count">${n}</span>` : ''}
    </button>`
  }).join('')

  el.querySelectorAll<HTMLButtonElement>('[data-emoji]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await addReaction(btn.dataset.ep!, btn.dataset.emoji as any)
      // Optimistic update — bump count immediately
      const countEl = btn.querySelector<HTMLSpanElement>('.reaction-count')
      const cur = parseInt(countEl?.textContent ?? '0') || 0
      if (countEl) { countEl.textContent = String(cur + 1) }
      else {
        btn.innerHTML += `<span class="reaction-count">1</span>`
        btn.classList.add('has-count')
      }
      btn.classList.add('reaction-pop')
      setTimeout(() => btn.classList.remove('reaction-pop'), 400)
    })
  })
}

// ── Comments loader ───────────────────────────────────────────────────────────
async function loadComments(episodeId: string) {
  const list = document.getElementById('modal-comments-list')
  if (!list) return
  const comments = await getApprovedComments(episodeId)

  // Update icon count
  const lbl = document.getElementById('comment-count-lbl')
  if (lbl) lbl.textContent = comments.length ? String(comments.length) : ''

  if (!comments.length) {
    list.innerHTML = `<div class="comments-empty">Sé la primera/o en comentar.</div>`
    return
  }
  list.innerHTML = comments.map(c => {
    const date = new Date(c.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
    return `<div class="comment-item">
      <div class="comment-meta">
        <span class="comment-author">${c.author}</span>
        <span class="comment-date">${date}</span>
      </div>
      <div class="comment-body">${c.body}</div>
    </div>`
  }).join('')
}
let modalSyncInterval: ReturnType<typeof setInterval> | null = null
function startModalSync() {
  stopModalSync()
  modalSyncInterval = setInterval(syncModal, 250)
}
function stopModalSync() {
  if (modalSyncInterval) { clearInterval(modalSyncInterval); modalSyncInterval = null }
}
function syncModal() {
  if (!currentModalId) return
  const audEl    = document.getElementById('aud') as HTMLAudioElement | null
  if (!audEl) return
  const isThis   = currentModalId === curId
  const nowPlay  = isThis && playing

  const pi  = document.querySelector<SVGElement>('#ep-modal-inner .modal-play-ico')
  const pa  = document.querySelector<SVGElement>('#ep-modal-inner .modal-pause-ico')
  if (pi && pa) { pi.style.display = nowPlay ? 'none' : 'block'; pa.style.display = nowPlay ? 'block' : 'none' }

  if (isThis && audEl.duration) {
    const pct   = (audEl.currentTime / audEl.duration) * 100
    const fill  = document.getElementById('modal-pfill')
    const thumb = document.getElementById('modal-thumb')
    const cur   = document.getElementById('modal-tcur')
    const tot   = document.getElementById('modal-ttot')
    if (fill)  fill.style.width = `${pct}%`
    if (thumb) thumb.style.left = `${pct}%`
    if (cur)   cur.textContent  = ft(audEl.currentTime)
    if (tot)   tot.textContent  = ft(audEl.duration)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function monthBadge(d: string): string {
  try {
    const date = new Date(d + 'T12:00:00')
    // "Diciembre 2025" — full month, capitalized
    const m = date.toLocaleDateString('es-ES', { month: 'long' })
    const capitalized = m.charAt(0).toUpperCase() + m.slice(1)
    return `<span class="cmonth-badge">${capitalized} ${date.getFullYear()}</span>`
  } catch { return '' }
}
function fmtDate(d: string | null): string {
  if (!d) return ''
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', {
      day: 'numeric', month: 'short', year: 'numeric'
    }).replace('.', '')
  }
  catch { return d }
}
function fmtDur(secs: number): string {
  const m = Math.floor(secs / 60), s = Math.floor(secs % 60)
  return m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}:${String(s).padStart(2,'0')}`
}
function ft(s: number): string {
  if (!s || isNaN(s)) return '0:00'
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`
}
function esc(s: string): string {
  return s.replace(/'/g, "\\'").replace(/"/g, '&quot;')
}