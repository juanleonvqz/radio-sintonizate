import type { Episode } from './types'
import { escapeHtml } from './html'

// The episode card, as one HTML string. The server renders the list with it for the
// first view (src/pages/index.astro) and the page re-renders with it whenever the list,
// the player or the search changes (src/scripts/grid.ts), so both views are identical.

export interface CardState {
  featured?: boolean
  playing?: boolean
  paused?: boolean
  listened?: boolean
}

export function episodeCard(ep: Episode, cover: string | null, state: CardState = {}): string {
  const { featured = false, playing = false, paused = false, listened = false } = state

  return `<div class="card ${featured ? 'card-featured' : ''} ${playing ? 'playing' : ''} ${paused ? 'paused' : ''} ${listened ? 'card-listened' : ''}" id="card-${ep.id}" data-id="${ep.id}">
      <div class="cimg-wrap">
        ${cover
          ? `<img class="ccover" src="${cover}" alt="${escapeHtml(ep.title)}" loading="${featured ? 'eager' : 'lazy'}">`
          : `<div class="cph"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#E8A020" stroke-width="1.2"><circle cx="12" cy="12" r="3"/><path d="M6.343 6.343a8 8 0 1 0 11.314 0"/><path d="M9.172 9.172a4 4 0 1 0 5.656 0"/></svg></div>`}
        <div class="now-playing-overlay" style="display:${playing ? 'flex' : 'none'}">
          <div class="np-bars"><span></span><span></span><span></span><span></span></div>
          <span class="np-lbl">Reproduciendo</span>
        </div>
        ${featured ? `<div class="featured-badge">Último episodio</div>` : ''}
      </div>
      <div class="cbody">
        ${ep.date ? `<div class="cmonth">${monthBadge(ep.date)}</div>` : ''}
        <div class="cprog">${escapeHtml(ep.program) || 'Radio Sintonízate'}</div>
        <div class="ctitle">${escapeHtml(ep.title)}</div>
        ${ep.description ? `<div class="cdesc">${escapeHtml(ep.description)}</div>` : ''}
        ${!listened ? `<div class="cno-desc">Escuchar episodio →</div>` : ''}
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
            <button class="playbtn" data-play="${ep.id}" aria-label="${playing ? 'Pausar' : 'Reproducir'}">
              <svg class="card-play-ico"  width="14" height="14" viewBox="0 0 24 24" fill="#0C0906" style="display:${playing ? 'none' : 'block'}"><polygon points="5,3 19,12 5,21"/></svg>
              <svg class="card-pause-ico" width="14" height="14" viewBox="0 0 24 24" fill="#0C0906" style="display:${playing ? 'block' : 'none'}"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>`
}

// The list as the page shows it when nothing is being searched or filtered: the newest
// by date first and featured, then the rest.
export function sortedByDate(episodes: Episode[]): Episode[] {
  return [...episodes].sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return b.date.localeCompare(a.date)
  })
}

export function episodeList(episodes: Episode[], coverFor: (path: string | null) => string | null): string {
  const [featured, ...rest] = sortedByDate(episodes)
  if (!featured) return ''
  return `<div class="episodes-flat">
    ${episodeCard(featured, coverFor(featured.cover_path), { featured: true })}
    ${rest.length ? `<div class="episodes-rest">${rest.map(ep => episodeCard(ep, coverFor(ep.cover_path))).join('')}</div>` : ''}
  </div>`
}

// ── Dates ─────────────────────────────────────────────────────────────────────

export function monthBadge(d: string): string {
  try {
    const date = new Date(d + 'T12:00:00')
    // "Diciembre 2025": full month, capitalized
    const m = date.toLocaleDateString('es-ES', { month: 'long' })
    const capitalized = m.charAt(0).toUpperCase() + m.slice(1)
    return `<span class="cmonth-badge">${capitalized} ${date.getFullYear()}</span>`
  } catch { return '' }
}

export function fmtDate(d: string | null): string {
  if (!d) return ''
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).replace('.', '')
  }
  catch { return d }
}
