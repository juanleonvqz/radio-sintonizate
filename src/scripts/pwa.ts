// The manifest and the icons are real files in public/ (see public/manifest.webmanifest),
// linked from the page head. The service worker is public/sw.js; it has to be a real
// file on this origin, which is why registering it from a blob never worked.
export function setupPWA() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch(() => { /* the site works without it */ })
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