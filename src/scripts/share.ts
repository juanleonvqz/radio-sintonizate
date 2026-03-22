import { coverUrl, audioUrl } from '../lib/supabase'
import { eps, toast }         from './player'
import type { Episode }       from '../lib/types'

export async function shareEp(id: string) {
  const ep = eps.find(e => e.id === id)
  if (!ep) return

  const url  = `${location.origin}${location.pathname}?ep=${id}`
  const text = `🎙️ "${ep.title}" — Radio Sintonízate, IES El Mayorazgo`

  if (navigator.share) {
    try { await navigator.share({ title: ep.title, text, url }); return } catch {}
  }

  try { await navigator.clipboard.writeText(url) } catch {}
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`
  const t  = document.getElementById('toast')
  if (t) {
    t.innerHTML = `Enlace copiado · <a href="${wa}" target="_blank" rel="noopener" style="color:#0C0906;font-weight:700;text-decoration:underline">Abrir en WhatsApp</a>`
    t.classList.add('on')
    setTimeout(() => { t.classList.remove('on'); t.innerHTML = '' }, 4000)
  }
}

export function checkDeepLink() {
  const id = new URLSearchParams(location.search).get('ep')
  if (!id) return
  const attempt = (tries = 0) => {
    if (tries > 20) return
    const ep = eps.find(e => e.id === id)
    if (ep) {
      import('./player').then(({ playEp }) => playEp(id))
      return
    }
    setTimeout(() => attempt(tries + 1), 300)
  }
  attempt()
}

export function generateRSS(epsData: Episode[]) {
  const siteUrl = 'https://radiosintonizate.com'
  const items = epsData.map((ep, i) => {
    const cv    = ep.cover_path ? coverUrl(ep.cover_path) : null
    const audio = audioUrl(ep.audio_path)
    return `
    <item>
      <title><![CDATA[${ep.title}]]></title>
      <link>${siteUrl}?ep=${ep.id}</link>
      <description><![CDATA[${ep.description || ep.title}]]></description>
      <itunes:author>Radio Sintonízate — IES El Mayorazgo</itunes:author>
      ${cv ? `<itunes:image href="${cv}"/>` : ''}
      <enclosure url="${audio}" type="audio/mpeg" length="0"/>
      <guid isPermaLink="false">${ep.id}</guid>
      <pubDate>${ep.date ? new Date(ep.date + 'T12:00:00').toUTCString() : new Date().toUTCString()}</pubDate>
      <itunes:episode>${epsData.length - i}</itunes:episode>
      <itunes:explicit>false</itunes:explicit>
    </item>`
  }).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Radio Sintonízate</title>
    <link>${siteUrl}</link>
    <description>La radio oficial del IES El Mayorazgo, La Orotava, Tenerife.</description>
    <language>es</language>
    <itunes:author>IES El Mayorazgo</itunes:author>
    <itunes:explicit>false</itunes:explicit>
    <itunes:category text="Education"/>
    <itunes:image href="${siteUrl}/cover.jpg"/>
    ${items}
  </channel>
</rss>`

  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([xml], { type: 'application/rss+xml' }))
  a.download = 'radio-sintonizate-feed.xml'
  a.click()
  toast('Feed RSS descargado.')
}
