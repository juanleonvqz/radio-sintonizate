import { coverUrl } from '../lib/supabase'
import { eps, playEp } from './player'
import { shareEp } from './share'

let activeF = 'all'

export function renderAll() {
  renderNav()
  renderGrid()
}

export function setFilter(v: string, btn?: HTMLElement) {
  activeF = v
  document.querySelectorAll('.nl').forEach(el => el.classList.remove('on'))
  btn?.classList.add('on')
  renderAll()
}

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

function renderGrid() {
  const grid    = document.getElementById('grid')
  const countEl = document.getElementById('ecount')
  if (!grid) return

  const filtered = activeF === 'all' ? eps : eps.filter(e => e.program === activeF)
  if (countEl) countEl.textContent = `${eps.length} episodio${eps.length !== 1 ? 's' : ''}`

  if (!filtered.length) {
    grid.innerHTML = `<div class="state-box">
      <div class="state-ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M6.343 6.343a8 8 0 1 0 11.314 0"/></svg></div>
      <h3>${eps.length ? 'Sin episodios aquí' : 'Aún no hay episodios'}</h3>
      <p>${eps.length ? 'Prueba con otro programa.' : 'Pulsa el botón de abajo para publicar el primer episodio.'}</p>
    </div>`
    return
  }

  grid.innerHTML = filtered.map(ep => {
    const cv = coverUrl(ep.cover_path)
    return `<div class="card" id="card-${ep.id}" data-id="${ep.id}">
      ${cv
        ? `<img class="ccover" src="${cv}" alt="${ep.title}" loading="lazy">`
        : `<div class="cph"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#E8A020" stroke-width="1.2"><circle cx="12" cy="12" r="3"/><path d="M6.343 6.343a8 8 0 1 0 11.314 0"/><path d="M9.172 9.172a4 4 0 1 0 5.656 0"/></svg></div>`}
      <div class="cbody">
        <div class="cprog">${ep.program || 'Radio Sintonízate'}</div>
        <div class="ctitle">${ep.title}</div>
        ${ep.description ? `<div class="cdesc">${ep.description}</div>` : ''}
        <div class="cfoot">
          <span class="cdate">${fmtDate(ep.date)}</span>
          <div class="cbtns">
            <button class="sharebtn" data-share="${ep.id}" aria-label="Compartir">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
            <button class="playbtn" data-play="${ep.id}" aria-label="Reproducir">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#0C0906"><polygon points="5,3 19,12 5,21"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>`
  }).join('')

  // Wire up click handlers (no inline onclick — clean separation)
  grid.querySelectorAll<HTMLElement>('[data-id]').forEach(card => {
    card.addEventListener('click', () => playEp(card.dataset.id!))
  })
  grid.querySelectorAll<HTMLButtonElement>('[data-play]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); playEp(btn.dataset.play!) })
  })
  grid.querySelectorAll<HTMLButtonElement>('[data-share]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); shareEp(btn.dataset.share!) })
  })
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  try { return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) }
  catch { return d }
}

function esc(s: string): string {
  return s.replace(/'/g, "\\'").replace(/"/g, '&quot;')
}
