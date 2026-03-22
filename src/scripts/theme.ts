// Runs immediately (before paint) to avoid flash of wrong theme
export function applyTheme(light: boolean) {
  document.body.classList.toggle('light', light)
  const icon = document.getElementById('theme-icon')
  const lbl  = document.getElementById('theme-lbl')
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')

  if (icon) icon.textContent = light ? '🌙' : '☀️'
  if (lbl)  lbl.textContent  = light ? 'Oscuro' : 'Claro'
  if (meta) meta.content     = light ? '#F5F0E8' : '#0C0906'

  // ── All logos follow one simple rule ─────────────────────────────────────
  // Light mode  → white/light backgrounds  → use dark-ink versions
  // Dark mode   → dark backgrounds         → use light/white versions

  // Radio Sintonízate — header + any other instances
  const radioLogos = document.querySelectorAll<HTMLImageElement>('.radio-logo-img')
  radioLogos.forEach(img => {
    img.src = light
      ? '/logos/Logo_radio_sintonizate_White.jpg'   // white bg version
      : '/logos/Logo_radio_sintonizate_Black.jpg'  // dark bg version
  })

  // IES El Mayorazgo — footer + any other instances
  const schoolLogos = document.querySelectorAll<HTMLImageElement>('.school-logo-img')
  schoolLogos.forEach(img => {
    img.src = light
      ? '/logos/Logo_IES_ELMayorazgo_Black.png'   // dark ink on light bg
      : '/logos/Logo_IES_ELMayorazgo_White.png'   // white ink on dark bg
  })
}

export function toggleTheme() {
  const isLight = !document.body.classList.contains('light')
  localStorage.setItem('rm-theme', isLight ? 'light' : 'dark')
  applyTheme(isLight)
}

export function initTheme() {
  applyTheme(localStorage.getItem('rm-theme') === 'light')
}