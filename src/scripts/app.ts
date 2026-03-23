/**
 * app.ts — single boot file imported by index.astro
 *
 * Responsibilities:
 *  1. Init theme (before paint to avoid flash)
 *  2. Wire all DOM event listeners
 *  3. Load episodes from Supabase
 *  4. Start realtime subscription
 *  5. Check deep-link (?ep=)
 *  6. Set up PWA
 */

import { fetchEpisodes, subscribeToEpisodes, subscribeToSettings } from '../lib/supabase'
import { initTheme, toggleTheme }             from './theme'
import { initPlayer, togglePlay, skip, seekMini, closePlayer, scrollToCard, setEps, eps } from './player'
import { renderAll, closeEpisodeModal, initSearch } from './grid'
import {
  openAdmin, closeAdmin, doLogin, doSignOut,
  onCover, onAudio, publish,
  onEditCover, onEditAudio, saveEdit, closeEditPanel,
  saveDesc, loadSiteDesc, initDropZones
} from './admin'
import { setupPWA, initInstallPrompt, promptInstall, dismissPWA } from './pwa'
import { checkDeepLink, generateRSS }         from './share'

// ── DOM ready ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

  // Apply saved theme first thing — DOM is ready now
  initTheme()

  // ── Player init ─────────────────────────────────────────────────────────────
  initPlayer()

  // ── Build waveform bars ─────────────────────────────────────────────────────
  const waveEl = document.getElementById('wave-el')
  if (waveEl) {
    ;[9,20,35,25,12,40,22,10,32,18,42].forEach((h, i) => {
      const b = document.createElement('div')
      b.className = 'wbar'
      b.style.cssText = `height:${h}px;animation-delay:${i * .09}s`
      waveEl.appendChild(b)
    })
  }

  // ── PWA ──────────────────────────────────────────────────────────────────────
  setupPWA()
  initInstallPrompt()
  document.getElementById('pwa-install-btn')?.addEventListener('click', promptInstall)
  document.getElementById('pwa-dismiss-btn')?.addEventListener('click', dismissPWA)

  // ── Theme toggle ─────────────────────────────────────────────────────────────
  document.getElementById('theme-btn')?.addEventListener('click', toggleTheme)

  // ── Player controls ──────────────────────────────────────────────────────────
  document.getElementById('ppbtn')            ?.addEventListener('click', togglePlay)
  document.getElementById('skip-back-btn')    ?.addEventListener('click', () => skip(-15))
  document.getElementById('skip-fwd-btn')     ?.addEventListener('click', () => skip(15))
  document.getElementById('close-player-btn') ?.addEventListener('click', closePlayer)
  document.getElementById('pinfo')            ?.addEventListener('click', () => {
    import('./player').then(({ curId }) => {
      if (curId) import('./grid').then(m => m.openEpisodeModal(curId!))
      else scrollToCard()
    })
  })
  document.getElementById('pmini')            ?.addEventListener('click', (e) => seekMini(e as MouseEvent))
  document.getElementById('vol-range')        ?.addEventListener('input', (e) => {
    const aud = document.getElementById('aud') as HTMLAudioElement | null
    if (aud) aud.volume = parseFloat((e.target as HTMLInputElement).value)
  })

  // ── Admin ─────────────────────────────────────────────────────────────────────
  document.getElementById('fab')             ?.addEventListener('click', openAdmin)
  document.getElementById('admin-back-btn')  ?.addEventListener('click', closeAdmin)
  document.getElementById('aov')             ?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('aov')) closeAdmin()
  })
  document.getElementById('login-btn')       ?.addEventListener('click', doLogin)
  document.getElementById('pw-inp')          ?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') doLogin()
  })
  document.getElementById('email-inp')       ?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') document.getElementById('pw-inp')?.focus()
  })
  document.getElementById('signout-btn')     ?.addEventListener('click', doSignOut)
  document.getElementById('pub-btn')         ?.addEventListener('click', publish)
  document.getElementById('save-desc-btn')   ?.addEventListener('click', saveDesc)
  document.getElementById('cv-inp')          ?.addEventListener('change', onCover)
  document.getElementById('au-inp')          ?.addEventListener('change', onAudio)
  initDropZones()

  // ── Edit panel ────────────────────────────────────────────────────────────────
  document.getElementById('edit-close-btn')  ?.addEventListener('click', closeEditPanel)
  document.getElementById('save-edit-btn')   ?.addEventListener('click', saveEdit)
  document.getElementById('edit-cv-inp')     ?.addEventListener('change', onEditCover)
  document.getElementById('edit-au-inp')     ?.addEventListener('change', onEditAudio)
  document.getElementById('edit-panel')      ?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('edit-panel')) closeEditPanel()
  })

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    // Don't fire shortcuts when typing in an input or textarea
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    // Don't fire when admin overlay is open
    if (document.getElementById('aov')?.classList.contains('on')) return

    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault()
        togglePlay()
        break
      case 'ArrowLeft':
      case 'j':
        e.preventDefault()
        skip(-15)
        break
      case 'ArrowRight':
      case 'l':
        e.preventDefault()
        skip(15)
        break
      case 'Escape':
        closePlayer()
        closeEpisodeModal()
        break
      case 'm':
        const audEl = document.getElementById('aud') as HTMLAudioElement | null
        if (audEl) audEl.muted = !audEl.muted
        break
    }
  })
  document.getElementById('ep-modal-close')    ?.addEventListener('click', closeEpisodeModal)
  document.getElementById('ep-modal-backdrop') ?.addEventListener('click', closeEpisodeModal)


  // ── RSS button ────────────────────────────────────────────────────────────────
  document.getElementById('rss-btn')?.addEventListener('click', () => generateRSS(eps))

  // ── Load site description from localStorage ───────────────────────────────
  loadSiteDesc()

  // ── Load episodes ─────────────────────────────────────────────────────────
  const grid = document.getElementById('grid')
  if (grid) {
    grid.innerHTML = `<div class="episodes-flat">
      <div class="skeleton-featured"></div>
      <div class="episodes-rest">
        ${[1,2,3].map(() => `<div class="skeleton-card"></div>`).join('')}
      </div>
    </div>`
  }

  try {
    const data = await fetchEpisodes()
    setEps(data)
    renderAll()
    checkDeepLink()
    initSearch()
  } catch (err: any) {
    console.error('Boot load error:', err)
    if (grid) {
      const isTimeout = err.message === 'timeout'
      grid.innerHTML = `<div class="state-box">
        <div class="state-ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/></svg></div>
        <h3>${isTimeout ? 'Tiempo de espera agotado' : 'Error de conexión'}</h3>
        <p>${isTimeout ? 'Supabase no responde. Revisa PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY en .env' : err.message}</p>
      </div>`
    }
  }

  // ── Realtime — re-render on any episode change ────────────────────────────
  subscribeToEpisodes(async () => {
    const { fetchEpisodes: reload } = await import('../lib/supabase')
    const data = await reload()
    setEps(data)
    renderAll()
  })

  // ── Realtime — update site description when admin changes it ──────────────
  subscribeToSettings(async () => {
    const { getSetting } = await import('../lib/supabase')
    const val = await getSetting('site_description')
    if (val) {
      const body = document.getElementById('desc-body')
      if (body) body.textContent = val
    }
  })

})