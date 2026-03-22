// Runs immediately (before paint) to avoid flash of wrong theme
export function applyTheme(light: boolean) {
  document.body.classList.toggle('light', light)
  const icon = document.getElementById('theme-icon')
  const lbl  = document.getElementById('theme-lbl')
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  const logo = document.getElementById('logo-img') as HTMLImageElement | null

  if (icon) icon.textContent = light ? '🌙' : '☀️'
  if (lbl)  lbl.textContent  = light ? 'Oscuro' : 'Claro'
  if (meta) meta.content     = light ? '#F5F0E8' : '#0C0906'
  if (logo) logo.src = light
    ? '/logos/Logo_radio_DEGRADADOS_FONDO_BLANCO.jpg'
    : '/logos/Logo_radio_DEGRADADOS.jpg'
}

export function toggleTheme() {
  const isLight = !document.body.classList.contains('light')
  localStorage.setItem('rm-theme', isLight ? 'light' : 'dark')
  applyTheme(isLight)
}

export function initTheme() {
  applyTheme(localStorage.getItem('rm-theme') === 'light')
}
