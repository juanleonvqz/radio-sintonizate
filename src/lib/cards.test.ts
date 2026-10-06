import { describe, it, expect } from 'vitest'
import { episodeCard, episodeList, sortedByDate, fmtDate, monthBadge } from './cards'
import type { Episode } from './types'

const ep = (over: Partial<Episode> = {}): Episode => ({
  id: 'e1', title: 'Día de Canarias', program: null, description: null, date: '2026-06-23',
  audio_path: 'a.mp3', cover_path: null, created_at: '2026-06-23T09:00:00.000Z', ...over,
})

describe('the episode card', () => {
  it('shows the title, program, date and cover, escaped', () => {
    const html = episodeCard(ep({ title: 'Tom & <Jerry>', program: 'Noticias', cover_path: 'c.webp' }), '/media/covers/c.webp')
    expect(html).toContain('<div class="ctitle">Tom &amp; &lt;Jerry&gt;</div>')
    expect(html).toContain('<div class="cprog">Noticias</div>')
    expect(html).toContain('src="/media/covers/c.webp"')
    expect(html).toContain('23 de junio de 2026')
    expect(html).toContain('Junio 2026')
  })

  it('falls back to the station name and a placeholder without program or cover', () => {
    const html = episodeCard(ep(), null)
    expect(html).toContain('Radio Sintonízate')
    expect(html).toContain('class="cph"')
    expect(html).not.toContain('<img')
  })

  it('reflects the player state', () => {
    expect(episodeCard(ep(), null, { featured: true })).toContain('Último episodio')
    expect(episodeCard(ep(), null, { playing: true })).toContain('aria-label="Pausar"')
    expect(episodeCard(ep(), null, { listened: true })).not.toContain('Escuchar episodio')
    expect(episodeCard(ep(), null)).toContain('Escuchar episodio')
  })
})

describe('the first view of the list', () => {
  const episodes = [ep({ id: 'old', date: '2025-09-26' }), ep({ id: 'new', date: '2026-06-23' }), ep({ id: 'undated', date: null })]

  it('features the newest by date and lists the rest, undated last', () => {
    expect(sortedByDate(episodes).map(e => e.id)).toEqual(['new', 'old', 'undated'])
    const html = episodeList(episodes, () => null)
    expect(html.indexOf('id="card-new"')).toBeLessThan(html.indexOf('id="card-old"'))
    expect(html).toContain('card-featured')
    expect(html.match(/class="card /g)).toHaveLength(3)
  })

  it('is empty without episodes', () => {
    expect(episodeList([], () => null)).toBe('')
  })

  it('writes dates in Spanish wherever it runs', () => {
    expect(fmtDate('2025-12-25')).toBe('25 de diciembre de 2025')
    expect(monthBadge('2025-12-25')).toContain('Diciembre 2025')
    expect(fmtDate(null)).toBe('')
  })
})
