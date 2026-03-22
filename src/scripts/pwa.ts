export function setupPWA() {
  // Generate app icon via canvas
  function icon(s: number): string {
    const c = document.createElement('canvas')
    c.width = c.height = s
    const x = c.getContext('2d')!
    x.fillStyle = '#0C0906'; x.fillRect(0, 0, s, s)
    x.fillStyle = '#E8A020'
    x.font = `bold ${Math.round(s * .35)}px sans-serif`
    x.textAlign = 'center'; x.textBaseline = 'middle'
    x.fillText('RS', s / 2, s / 2)
    return c.toDataURL('image/png')
  }

  const mf = {
    name: 'Radio Sintonízate',
    short_name: 'Radio Sintonízate',
    description: 'La radio oficial del IES El Mayorazgo, La Orotava, Tenerife.',
    start_url: './',
    display: 'standalone',
    background_color: '#0C0906',
    theme_color: '#0C0906',
    orientation: 'portrait-primary',
    icons: [
      { src: icon(192), sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: icon(512), sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  }

  const manifestEl = document.getElementById('pwa-manifest') as HTMLLinkElement | null
  const appleEl    = document.getElementById('apple-icon')   as HTMLLinkElement | null
  if (manifestEl) manifestEl.href = URL.createObjectURL(new Blob([JSON.stringify(mf)], { type: 'application/json' }))
  if (appleEl)    appleEl.href    = icon(180)

  if ('serviceWorker' in navigator) {
    const sw = `const C='rs-v1';
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.url.includes('supabase'))return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});`
    navigator.serviceWorker
      .register(URL.createObjectURL(new Blob([sw], { type: 'application/javascript' })), { scope: './' })
      .catch(() => {})
  }
}

let _dp: any = null

export function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault(); _dp = e
    if (!sessionStorage.getItem('pwa-dis')) document.getElementById('pbar')?.classList.add('on')
  })
  window.addEventListener('appinstalled', () => document.getElementById('pbar')?.classList.remove('on'))
}

export async function promptInstall() {
  if (!_dp) return
  _dp.prompt()
  const { outcome } = await _dp.userChoice
  _dp = null
  document.getElementById('pbar')?.classList.remove('on')
  if (outcome === 'accepted') {
    const t = document.getElementById('toast')
    if (t) { t.textContent = '¡App instalada!'; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 3200) }
  }
}

export function dismissPWA() {
  document.getElementById('pbar')?.classList.remove('on')
  sessionStorage.setItem('pwa-dis', '1')
}
