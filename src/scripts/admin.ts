import {
  sb, signIn, signOut, getSession,
  uploadAudio, uploadCover,
  insertEpisode, updateEpisode, deleteEpisode,
  fetchEpisodes, coverUrl,
  getSetting, setSetting,
  getPendingComments, approveComment, rejectComment
} from '../lib/supabase'
import { setEps, eps } from './player'
import { renderAll } from './grid'
import { toast } from './player'
import type { Episode } from '../lib/types'

// ── State ─────────────────────────────────────────────────────────────────────
let pendCoverBlob: Blob | null = null
let pendAudioFile: File | null = null
let editingId: string | null = null
let editCoverBlob: Blob | null = null
let editAudioFile: File | null = null

// ── Overlay ───────────────────────────────────────────────────────────────────
export async function openAdmin() {
  document.getElementById('aov')?.classList.add('on')
  const { data: { session } } = await getSession()
  if (session) showUploadPanel()
}
export function closeAdmin() {
  document.getElementById('aov')?.classList.remove('on')
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export async function doLogin() {
  const email = (document.getElementById('email-inp') as HTMLInputElement)?.value.trim()
  const pw    = (document.getElementById('pw-inp') as HTMLInputElement)?.value
  const btn   = document.getElementById('login-btn') as HTMLButtonElement | null
  const err   = document.getElementById('pwerr')
  if (btn) { btn.disabled = true; btn.textContent = 'Entrando…' }
  const { error } = await signIn(email, pw)
  if (btn) { btn.disabled = false; btn.textContent = 'Entrar' }
  if (error) {
    err?.classList.add('on')
    const inp = document.getElementById('pw-inp') as HTMLInputElement | null
    if (inp) inp.value = ''
    return
  }
  err?.classList.remove('on')
  showUploadPanel()
}

export async function doSignOut() {
  await signOut()
  document.getElementById('upanel')!.style.display = 'none'
  document.getElementById('lpanel')!.style.display = 'block'
  const inp = document.getElementById('pw-inp') as HTMLInputElement | null
  if (inp) inp.value = ''
  toast('Sesión cerrada.')
}

// ── Upload panel ──────────────────────────────────────────────────────────────
function showUploadPanel() {
  document.getElementById('lpanel')!.style.display = 'none'
  document.getElementById('upanel')!.style.display = 'block'
  const d = document.getElementById('f-date') as HTMLInputElement | null
  if (d) d.value = new Date().toISOString().split('T')[0]
  const saved = localStorage.getItem('rm-site-desc')
  const current = document.getElementById('desc-body')?.textContent ?? ''
  const ta = document.getElementById('site-desc') as HTMLTextAreaElement | null
  if (ta) ta.value = saved || current
  initAdminTabs()
  renderManage()
  renderComments()
}

function initAdminTabs() {
  document.querySelectorAll<HTMLButtonElement>('.admin-tab').forEach(tab => {
    // Remove any previously added listeners by cloning
    const fresh = tab.cloneNode(true) as HTMLButtonElement
    tab.parentNode?.replaceChild(fresh, tab)
    fresh.addEventListener('click', () => switchTab(fresh.dataset.tab!))
  })
  // Default to manage tab
  switchTab('manage')
}

function switchTab(name: string) {
  document.querySelectorAll('.admin-tab').forEach(t =>
    t.classList.toggle('on', (t as HTMLElement).dataset.tab === name)
  )
  document.querySelectorAll('.admin-tab-content').forEach(c =>
    c.classList.toggle('on', c.id === `tab-${name}`)
  )
  if (name === 'comments') renderComments()
}

// ── File pickers (new episode) ────────────────────────────────────────────────
export function onCover(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  resizeImage(file, blob => {
    pendCoverBlob = blob
    const img  = document.getElementById('cvimg') as HTMLImageElement | null
    const wrap = document.getElementById('cvwrap')
    const fn   = document.getElementById('cv-fn')
    if (blob && img) img.src = URL.createObjectURL(blob)
    if (wrap) wrap.style.display = 'block'
    if (fn)   fn.textContent = `✓ ${file.name}`
  })
}

export function onAudio(e: Event) {
  pendAudioFile = (e.target as HTMLInputElement).files?.[0] ?? null
  if (!pendAudioFile) return
  const fn = document.getElementById('au-fn')
  if (fn) fn.textContent = `✓ ${pendAudioFile.name} (${(pendAudioFile.size / 1024 / 1024).toFixed(1)} MB)`
}

export function initDropZones() {
  ;['cv-dz', 'au-dz', 'edit-cv-dz', 'edit-au-dz'].forEach(id => {
    const el = document.getElementById(id)
    if (!el) return
    el.addEventListener('dragover',  e => { e.preventDefault(); el.classList.add('over') })
    el.addEventListener('dragleave', () => el.classList.remove('over'))
    el.addEventListener('drop',      e => { e.preventDefault(); el.classList.remove('over') })
  })
}

// ── Publish new episode ───────────────────────────────────────────────────────
export async function publish() {
  const title = (document.getElementById('f-ttl') as HTMLInputElement)?.value.trim()
  if (!title)         { toast('El título es obligatorio.');        return }
  if (!pendAudioFile) { toast('Debes subir un archivo de audio.'); return }

  const btn = document.getElementById('pub-btn') as HTMLButtonElement | null
  if (btn) { btn.disabled = true; btn.textContent = 'Subiendo audio…' }

  try {
    const ts       = Date.now()
    const safeName = pendAudioFile.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '')
    const audioPath = `${ts}-${safeName}`
    await uploadAudio(audioPath, pendAudioFile)

    let coverPath: string | null = null
    if (pendCoverBlob) {
      if (btn) btn.textContent = 'Subiendo portada…'
      coverPath = `${ts}-cover.webp`
      try { await uploadCover(coverPath, pendCoverBlob) } catch (e) { console.warn(e) }
    }

    if (btn) btn.textContent = 'Guardando…'
    await insertEpisode({
      title,
      program:     (document.getElementById('f-prog') as HTMLInputElement)?.value.trim() || null,
      description: (document.getElementById('f-desc') as HTMLTextAreaElement)?.value.trim() || null,
      date:        (document.getElementById('f-date') as HTMLInputElement)?.value || null,
      audio_path:  audioPath,
      cover_path:  coverPath,
    })

    resetForm()
    await refreshEps()
    switchTab('manage')
    toast('¡Episodio publicado!')
  } catch (err) {
    toast('Error al publicar. Revisa la consola.')
    console.error(err)
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Publicar episodio' }
}

// ── EDIT episode ──────────────────────────────────────────────────────────────
export function openEditPanel(id: string) {
  const ep = eps.find(e => e.id === id)
  if (!ep) return
  editingId = id
  editCoverBlob = null
  editAudioFile = null

  // Populate fields
  const set = (elId: string, val: string) => {
    const el = document.getElementById(elId) as HTMLInputElement | HTMLTextAreaElement | null
    if (el) el.value = val
  }
  set('edit-ttl',  ep.title)
  set('edit-prog', ep.program || '')
  set('edit-desc', ep.description || '')
  set('edit-date', ep.date || '')

  // Show current cover
  const cv  = coverUrl(ep.cover_path)
  const img = document.getElementById('edit-cv-img') as HTMLImageElement | null
  const ph  = document.getElementById('edit-cv-ph')
  const wrap = document.getElementById('edit-cv-wrap')
  if (img && ph && wrap) {
    if (cv) { img.src = cv; img.style.display = 'block'; ph.style.display = 'none' }
    else    { img.style.display = 'none'; ph.style.display = 'flex' }
    wrap.style.display = 'block'
  }

  // Show current audio name
  const auFn = document.getElementById('edit-au-fn')
  if (auFn) auFn.textContent = ep.audio_path.replace(/^\d+-/, '')

  document.getElementById('edit-panel')?.classList.add('on')
  document.body.style.overflow = 'hidden'
}

export function closeEditPanel() {
  document.getElementById('edit-panel')?.classList.remove('on')
  document.body.style.overflow = ''
  editingId = null
  editCoverBlob = null
  editAudioFile = null
}

export function onEditCover(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  resizeImage(file, blob => {
    editCoverBlob = blob
    const img  = document.getElementById('edit-cv-img') as HTMLImageElement | null
    const ph   = document.getElementById('edit-cv-ph')
    const fn   = document.getElementById('edit-cv-fn')
    if (blob && img) { img.src = URL.createObjectURL(blob); img.style.display = 'block'; ph && (ph.style.display = 'none') }
    if (fn) fn.textContent = `✓ Nueva foto: ${file.name}`
  })
}

export function onEditAudio(e: Event) {
  editAudioFile = (e.target as HTMLInputElement).files?.[0] ?? null
  if (!editAudioFile) return
  const fn = document.getElementById('edit-au-fn')
  if (fn) fn.textContent = `✓ Nuevo audio: ${editAudioFile.name} (${(editAudioFile.size / 1024 / 1024).toFixed(1)} MB)`
}

export async function saveEdit() {
  if (!editingId) return
  const ep = eps.find(e => e.id === editingId)
  if (!ep) return

  const btn = document.getElementById('save-edit-btn') as HTMLButtonElement | null
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…' }

  try {
    const updates: Partial<Omit<Episode, 'id' | 'created_at'>> = {
      title:       (document.getElementById('edit-ttl')  as HTMLInputElement)?.value.trim() || ep.title,
      program:     (document.getElementById('edit-prog') as HTMLInputElement)?.value.trim() || null,
      description: (document.getElementById('edit-desc') as HTMLTextAreaElement)?.value.trim() || null,
      date:        (document.getElementById('edit-date') as HTMLInputElement)?.value || null,
    }

    // Upload new cover if provided
    if (editCoverBlob) {
      if (btn) btn.textContent = 'Subiendo portada…'
      const coverPath = `${Date.now()}-cover.webp`
      await uploadCover(coverPath, editCoverBlob)
      updates.cover_path = coverPath
    }

    // Upload new audio if provided
    if (editAudioFile) {
      if (btn) btn.textContent = 'Subiendo audio…'
      const safeName  = editAudioFile.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '')
      const audioPath = `${Date.now()}-${safeName}`
      await uploadAudio(audioPath, editAudioFile)
      updates.audio_path = audioPath
    }

    if (btn) btn.textContent = 'Guardando…'
    await updateEpisode(editingId, updates)
    await refreshEps()
    closeEditPanel()
    toast('¡Episodio actualizado!')
  } catch (err) {
    toast('Error al guardar. Revisa la consola.')
    console.error(err)
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Guardar cambios' }
}

// ── Delete ────────────────────────────────────────────────────────────────────
export async function deleteEp(id: string) {
  if (!confirm('¿Eliminar este episodio? No se puede deshacer.')) return
  const ep = eps.find(e => e.id === id)
  if (!ep) return
  try {
    await deleteEpisode(id, ep.audio_path, ep.cover_path)
    await refreshEps()
    toast('Episodio eliminado.')
  } catch (err) { toast('Error al eliminar.'); console.error(err) }
}

// ── Site description (Supabase-backed, global) ────────────────────────────────
export async function saveDesc() {
  const val     = (document.getElementById('site-desc') as HTMLTextAreaElement)?.value.trim()
  const visible = (document.getElementById('banner-toggle') as HTMLInputElement)?.checked ?? true
  if (!val) { toast('Escribe algo primero.'); return }
  const btn = document.getElementById('save-desc-btn') as HTMLButtonElement | null
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…' }
  try {
    await setSetting('site_description', val)
    await setSetting('banner_visible', visible ? '1' : '0')
    const body = document.getElementById('desc-body')
    if (body) body.textContent = val
    const banner = document.getElementById('desc-banner-wrap')
    if (banner) banner.style.display = visible ? '' : 'none'
    toast('¡Guardado!')
  } catch (err) {
    toast('Error al guardar.'); console.error(err)
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Guardar cambios' }
}

export async function loadSiteDesc() {
  try {
    const [val, visible] = await Promise.all([
      getSetting('site_description'),
      getSetting('banner_visible'),
    ])
    if (val) {
      const body = document.getElementById('desc-body')
      if (body) body.textContent = val
    }
    const show   = visible !== '0'
    const banner = document.getElementById('desc-banner-wrap')
    if (banner) banner.style.display = show ? '' : 'none'
    // Sync toggle state when admin opens settings
    const toggle = document.getElementById('banner-toggle') as HTMLInputElement | null
    if (toggle) toggle.checked = show
  } catch { /* table may not exist yet */ }
}

// ── Manage list ───────────────────────────────────────────────────────────────
export function renderManage() {
  const list  = document.getElementById('mglist')
  const empty = document.getElementById('admin-ep-empty')
  if (!list) return

  if (!eps.length) {
    if (empty) empty.style.display = 'block'
    list.innerHTML = ''
    return
  }
  if (empty) empty.style.display = 'none'

  list.innerHTML = eps.map(ep => {
    const cv = coverUrl(ep.cover_path)
    return `<div class="mgitem">
      ${cv
        ? `<img class="mgth" src="${cv}" alt="">`
        : `<div class="mgthph"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#E8A020" stroke-width="1.5"><circle cx="12" cy="12" r="3"/></svg></div>`}
      <div class="mginf">
        <div class="mgttl">${ep.title}</div>
        <div class="mgprog">${ep.program || 'Sin programa'} · ${fmtDate(ep.date)}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btnedit" data-edit="${ep.id}">Editar</button>
        <button class="btndel"  data-del="${ep.id}">Eliminar</button>
      </div>
    </div>`
  }).join('')

  list.querySelectorAll<HTMLButtonElement>('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openEditPanel(btn.dataset.edit!))
  })
  list.querySelectorAll<HTMLButtonElement>('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => deleteEp(btn.dataset.del!))
  })
}

// ── Comments moderation ───────────────────────────────────────────────────────
export async function renderComments() {
  const list  = document.getElementById('admin-comments-list')
  const empty = document.getElementById('admin-comments-empty')
  const badge = document.getElementById('admin-pending-count')
  if (!list) return

  const comments = await getPendingComments()

  // Update pending badge on tab
  if (badge) {
    if (comments.length) {
      badge.textContent = String(comments.length)
      badge.style.display = 'inline-flex'
    } else {
      badge.style.display = 'none'
    }
  }

  if (!comments.length) {
    if (empty) empty.style.display = 'block'
    list.innerHTML = ''
    return
  }
  if (empty) empty.style.display = 'none'

  list.innerHTML = comments.map(c => {
    const ep    = (c as any).episodes
    const date  = new Date(c.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    return `<div class="admin-comment-item" id="ac-${c.id}">
      <div class="admin-comment-meta">
        <span class="admin-comment-author">${c.author}</span>
        <span class="admin-comment-ep">${ep?.title ?? 'Episodio desconocido'}</span>
        <span class="admin-comment-date">${date}</span>
      </div>
      <div class="admin-comment-body">${c.body}</div>
      <div class="admin-comment-actions">
        <button class="btnp admin-approve-btn" data-approve="${c.id}">✓ Aprobar</button>
        <button class="btndel" data-reject="${c.id}">✕ Rechazar</button>
      </div>
    </div>`
  }).join('')

  list.querySelectorAll<HTMLButtonElement>('[data-approve]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Aprobando…'
      await approveComment(btn.dataset.approve!)
      toast('Comentario aprobado.')
      renderComments()
    })
  })
  list.querySelectorAll<HTMLButtonElement>('[data-reject]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Rechazar y eliminar este comentario?')) return
      btn.disabled = true; btn.textContent = 'Rechazando…'
      await rejectComment(btn.dataset.reject!)
      toast('Comentario rechazado.')
      renderComments()
    })
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function refreshEps() {
  const data = await fetchEpisodes()
  setEps(data)
  renderAll()
  renderManage()
}

function resizeImage(file: File, cb: (blob: Blob) => void) {
  const reader = new FileReader()
  reader.onload = ev => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const MAX = 900
      let w = img.width, h = img.height
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      // WebP saves ~30% file size vs JPEG at same visual quality
      canvas.toBlob(blob => { if (blob) cb(blob) }, 'image/webp', 0.85)
    }
    img.src = ev.target!.result as string
  }
  reader.readAsDataURL(file)
}

function resetForm() {
  ;['f-ttl', 'f-prog', 'f-desc'].forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null
    if (el) el.value = ''
  })
  const d = document.getElementById('f-date') as HTMLInputElement | null
  if (d) d.value = new Date().toISOString().split('T')[0]
  ;['cv-fn', 'au-fn'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '' })
  const wrap = document.getElementById('cvwrap'); if (wrap) wrap.style.display = 'none'
  ;['cv-inp', 'au-inp'].forEach(id => { const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.value = '' })
  pendCoverBlob = null; pendAudioFile = null
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  try { return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) }
  catch { return d }
}