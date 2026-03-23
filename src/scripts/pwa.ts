export function setupPWA() {
  // Use the actual Radio Sintonízate logo for the PWA icon
  // It lives in public/logos/ so we can reference it by URL
  const logoUrl = '/logos/Logo_radio_sintonizate_Black.jpg'

  // For manifest icons we need base64 — load the image and convert via canvas
  function logoToDataUrl(size: number): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = c.height = size
        const ctx = c.getContext('2d')!
        // Dark background first
        ctx.fillStyle = '#0C0906'
        ctx.fillRect(0, 0, size, size)
        // Draw logo centered, keeping aspect ratio
        const scale = Math.min(size / img.width, size / img.height)
        const w = img.width  * scale
        const h = img.height * scale
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
        resolve(c.toDataURL('image/png'))
      }
      img.onerror = () => {
        // Fallback: text icon if image fails to load
        const c = document.createElement('canvas')
        c.width = c.height = size
        const ctx = c.getContext('2d')!
        ctx.fillStyle = '#0C0906'; ctx.fillRect(0, 0, size, size)
        ctx.fillStyle = '#E8A020'
        ctx.font = `bold ${Math.round(size * .35)}px sans-serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('RS', size / 2, size / 2)
        resolve(c.toDataURL('image/png'))
      }
      img.src = logoUrl + '?v=' + Date.now()  // cache-bust
    })
  }

  Promise.all([logoToDataUrl(192), logoToDataUrl(512), logoToDataUrl(180)]).then(([i192, i512, i180]) => {
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
        { src: i192, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
        { src: i512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      ],
    }
    const manifestEl = document.getElementById('pwa-manifest') as HTMLLinkElement | null
    const appleEl    = document.getElementById('apple-icon')   as HTMLLinkElement | null
    if (manifestEl) manifestEl.href = URL.createObjectURL(new Blob([JSON.stringify(mf)], { type: 'application/json' }))
    if (appleEl)    appleEl.href    = i180
  })

  if ('serviceWorker' in navigator) {
    const sw = `const C='rs-v2';
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