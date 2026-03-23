export function applyTheme(light: boolean) {
  document.body.classList.toggle('light', light)
  const icon = document.getElementById('theme-icon')
  const lbl  = document.getElementById('theme-lbl')
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')

  if (icon) icon.textContent = light ? '🌙' : '☀️'
  if (lbl)  lbl.textContent  = light ? 'Oscuro' : 'Claro'
  if (meta) meta.content     = light ? '#F5F0E8' : '#0C0906'

  // Light mode (default) → _White, Dark mode → _Black
  document.querySelectorAll<HTMLImageElement>('.radio-logo-img').forEach(img => {
    img.src = light
      ? '/logos/Logo_radio_sintonizate_White.jpg'
      : '/logos/Logo_radio_sintonizate_Black.jpg'
  })

  document.querySelectorAll<HTMLImageElement>('.school-logo-img').forEach(img => {
    img.src = light
      ? '/logos/Logo_IES_ELMayorazgo_White.png'
      : '/logos/Logo_IES_ELMayorazgo_Black.png'
  })
}

export function toggleTheme() {
  const isLight = !document.body.classList.contains('light')
  localStorage.setItem('rm-theme', isLight ? 'light' : 'dark')
  applyTheme(isLight)
}

export function initTheme() {
  // Default is light mode — only go dark if user explicitly chose dark
  applyTheme(localStorage.getItem('rm-theme') !== 'dark')
}