/**
 * /feed.xml: the podcast feed, rendered on the server from the site's own database.
 *
 * Submit https://radiosintonizate.com/feed.xml to:
 *   Spotify for Podcasters, podcasters.spotify.com
 *   Apple Podcasts Connect, podcastsconnect.apple.com
 */

import type { APIRoute } from 'astro'
import { database, mediaBucket } from '../server/http'
import { listEpisodes } from '../server/content/episodes'
import { fileKey } from '../server/media/bucket'

const SITE_URL = 'https://radiosintonizate.com'

export const GET: APIRoute = async (context) => {
  const db    = database(context)
  const media = mediaBucket(context)
  if (!db || !media) return new Response('Not configured', { status: 503 })

  const episodes = await listEpisodes(db)

  // Podcast apps want each file's real size and type.
  const files = await Promise.all(episodes.map(ep =>
    media.head(fileKey('audio', ep.audio_path) ?? '').catch(() => null)
  ))

  const coverUrl = (path: string | null) => (path ? `${SITE_URL}/media/covers/${encodeURIComponent(path)}` : null)
  const audioUrl = (path: string) => `${SITE_URL}/media/audio/${encodeURIComponent(path)}`

  const safeDate = (d: string | null) => {
    try { return d ? new Date(d + 'T12:00:00').toUTCString() : new Date().toUTCString() }
    catch { return new Date().toUTCString() }
  }

  const items = episodes.map((ep, i) => {
    const cv   = coverUrl(ep.cover_path)
    const file = files[i]
    return `
    <item>
      <title><![CDATA[${ep.title}]]></title>
      <link>${SITE_URL}?ep=${ep.id}</link>
      <description><![CDATA[${ep.description || ep.title}]]></description>
      <content:encoded><![CDATA[${ep.description || ep.title}]]></content:encoded>
      <itunes:title><![CDATA[${ep.title}]]></itunes:title>
      <itunes:summary><![CDATA[${ep.description || ep.title}]]></itunes:summary>
      <itunes:author>Radio Sintonízate, IES El Mayorazgo</itunes:author>
      ${cv ? `<itunes:image href="${cv}"/>` : ''}
      <enclosure url="${audioUrl(ep.audio_path)}" type="${file?.httpMetadata?.contentType ?? 'audio/mpeg'}" length="${file?.size ?? 0}"/>
      <guid isPermaLink="false">${ep.id}</guid>
      <pubDate>${safeDate(ep.date)}</pubDate>
      <itunes:episode>${episodes.length - i}</itunes:episode>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>false</itunes:explicit>
      ${ep.program ? `<itunes:keywords><![CDATA[${ep.program}]]></itunes:keywords>` : ''}
    </item>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Radio Sintonízate</title>
    <link>${SITE_URL}</link>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>La radio oficial del IES El Mayorazgo, La Orotava, Tenerife.</description>
    <language>es</language>
    <copyright>IES El Mayorazgo ${new Date().getFullYear()}</copyright>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <itunes:author>IES El Mayorazgo</itunes:author>
    <itunes:subtitle>La Radio del IES El Mayorazgo</itunes:subtitle>
    <itunes:summary>Programas, podcasts y emisiones del IES El Mayorazgo, La Orotava, Tenerife.</itunes:summary>
    <itunes:owner>
      <itunes:name>Ofelia Martín, IES El Mayorazgo</itunes:name>
      <itunes:email>ofeliamartinv@gmail.com</itunes:email>
    </itunes:owner>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <itunes:category text="Education">
      <itunes:category text="Courses"/>
    </itunes:category>
    <itunes:image href="${SITE_URL}/cover.jpg"/>
    <image>
      <url>${SITE_URL}/cover.jpg</url>
      <title>Radio Sintonízate</title>
      <link>${SITE_URL}</link>
    </image>
    ${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type':                'application/rss+xml; charset=utf-8',
      'Cache-Control':               'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
