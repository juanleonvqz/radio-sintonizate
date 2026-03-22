import { sb, signIn, signOut, getSession, uploadAudio, uploadCover, insertEpisode, deleteEpisode, fetchEpisodes } from '../lib/supabase'
import { coverUrl } from '../lib/supabase'
import { setEps, eps } from './player'
import { renderAll } from './grid'
import { toast } from './player'

// ── State ─────────────────────────────────────────────────────────────────────
let pendCoverBlob: Blob | null = null
let pendAudioFile: File | null = null

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
  const pw    = (document.getElementById('pw-inp')    as HTMLInputElement)?.value
  const btn   = document.getElementById('login-btn')  as HTMLButtonElement | null
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
  document.getElementById('lpanel')!.style.display  = 'none'
  document.getElementById('upanel')!.style.display  = 'block'
  const d = document.getElementById('f-date') as HTMLInputElement | null
  if (d) d.value = new Date().toISOString().split('T')[0]
  const saved = localStorage.getItem('rm-site-desc')
  const current = document.getElementById('desc-body')?.textContent ?? ''
  const ta = document.getElementById('site-desc') as HTMLTextAreaElement | null
  if (ta) ta.value = saved || current
  renderManage()
}

// ── File pickers ──────────────────────────────────────────────────────────────
export function onCover(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
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
      canvas.toBlob(blob => {
        pendCoverBlob = blob
        const cvImg  = document.getElementById('cvimg')  as HTMLImageElement | null
        const cvWrap = document.getElementById('cvwrap')
        const cvFn   = document.getElementById('cv-fn')
        if (blob && cvImg) cvImg.src = URL.createObjectURL(blob)
        if (cvWrap) cvWrap.style.display = 'block'
        if (cvFn)   cvFn.textContent = `✓ ${file.name}`
      }, 'image/jpeg', 0.82)
    }
    img.src = ev.target!.result as string
  }
  reader.readAsDataURL(file)
}

export function onAudio(e: Event) {
  pendAudioFile = (e.target as HTMLInputElement).files?.[0] ?? null
  if (!pendAudioFile) return
  const fn = document.getElementById('au-fn')
  if (fn) fn.textContent = `✓ ${pendAudioFile.name} (${(pendAudioFile.size / 1024 / 1024).toFixed(1)} MB)`
}

// Drop zones
export function initDropZones() {
  ;['cv-dz', 'au-dz'].forEach(id => {
    const el = document.getElementById(id)
    if (!el) return
    el.addEventListener('dragover',  e => { e.preventDefault(); el.classList.add('over') })
    el.addEventListener('dragleave', () => el.classList.remove('over'))
    el.addEventListener('drop',      e => { e.preventDefault(); el.classList.remove('over') })
  })
}

// ── Publish ───────────────────────────────────────────────────────────────────
export async function publish() {
  const title = (document.getElementById('f-ttl')  as HTMLInputElement)?.value.trim()
  if (!title)         { toast('El título es obligatorio.');       return }
  if (!pendAudioFile) { toast('Debes subir un archivo de audio.'); return }

  const btn = document.getElementById('pub-btn') as HTMLButtonElement | null
  if (btn) { btn.disabled = true; btn.textContent = 'Subiendo audio…' }

  try {
    const ts        = Date.now()
    const safeName  = pendAudioFile.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '')
    const audioPath = `${ts}-${safeName}`

    await uploadAudio(audioPath, pendAudioFile)

    let coverPath: string | null = null
    if (pendCoverBlob) {
      if (btn) btn.textContent = 'Subiendo portada…'
      coverPath = `${ts}-cover.jpg`
      try { await uploadCover(coverPath, pendCoverBlob) }
      catch (e) { console.warn('Cover upload failed:', e) }
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
    const data = await fetchEpisodes()
    setEps(data)
    renderAll()
    renderManage()
    toast('¡Episodio publicado!')
  } catch (err) {
    toast('Error al publicar. Revisa la consola.')
    console.error(err)
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Publicar episodio' }
}

// ── Delete ────────────────────────────────────────────────────────────────────
export async function deleteEp(id: string) {
  if (!confirm('¿Eliminar este episodio? No se puede deshacer.')) return
  const ep = eps.find(e => e.id === id)
  if (!ep) return
  try {
    await deleteEpisode(id, ep.audio_path, ep.cover_path)
    const data = await fetchEpisodes()
    setEps(data)
    renderAll()
    renderManage()
    toast('Episodio eliminado.')
  } catch (err) {
    toast('Error al eliminar.')
    console.error(err)
  }
}

// ── Site description ──────────────────────────────────────────────────────────
export function saveDesc() {
  const val = (document.getElementById('site-desc') as HTMLTextAreaElement)?.value.trim()
  if (!val) { toast('Escribe algo primero.'); return }
  localStorage.setItem('rm-site-desc', val)
  const body = document.getElementById('desc-body')
  if (body) body.textContent = val
  toast('¡Descripción actualizada!')
}

export function loadSiteDesc() {
  const saved = localStorage.getItem('rm-site-desc')
  if (saved) {
    const body = document.getElementById('desc-body')
    if (body) body.textContent = saved
  }
}

// ── Manage list ───────────────────────────────────────────────────────────────
function renderManage() {
  const sec  = document.getElementById('mgsec')
  const list = document.getElementById('mglist')
  const h    = document.getElementById('mgh')
  if (!list) return
  if (!eps.length) { if (sec) sec.style.display = 'none'; return }
  if (sec) sec.style.display = 'block'
  if (h)   h.textContent = `Episodios publicados (${eps.length})`

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
      <button class="btndel" data-del="${ep.id}">Eliminar</button>
    </div>`
  }).join('')

  list.querySelectorAll<HTMLButtonElement>('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => deleteEp(btn.dataset.del!))
  })
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function resetForm() {
  ;['f-ttl', 'f-prog', 'f-desc'].forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null
    if (el) el.value = ''
  })
  const d = document.getElementById('f-date') as HTMLInputElement | null
  if (d) d.value = new Date().toISOString().split('T')[0]
  ;['cv-fn', 'au-fn'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = ''
  })
  const wrap = document.getElementById('cvwrap'); if (wrap) wrap.style.display = 'none'
  ;['cv-inp', 'au-inp'].forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement | null; if (el) el.value = ''
  })
  pendCoverBlob = null; pendAudioFile = null
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  try { return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) }
  catch { return d }
}
