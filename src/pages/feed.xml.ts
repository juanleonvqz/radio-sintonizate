/**
 * /feed.xml — server-rendered RSS podcast feed
 *
 * Runs on Cloudflare Pages edge via @astrojs/cloudflare adapter.
 * Submit https://radiosintonizate.com/feed.xml to:
 *   Spotify for Podcasters → podcasters.spotify.com
 *   Apple Podcasts Connect → podcastsconnect.apple.com
 */

import type { APIRoute } from 'astro'

const SITE_URL = 'https://radiosintonizate.com'

export const GET: APIRoute = async () => {
  const SUPABASE_URL      = import.meta.env.PUBLIC_SUPABASE_URL
  const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response('Missing env vars: PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY', { status: 500 })
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/episodes?select=*&order=created_at.desc`,
    {
      headers: {
        apikey:        SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    }
  )

  if (!res.ok) {
    return new Response(`Supabase error: ${res.status}`, { status: 502 })
  }

  const episodes: any[] = await res.json()

  const coverUrl = (path: string | null) =>
    path ? `${SUPABASE_URL}/storage/v1/object/public/covers/${path}` : null

  const audioUrl = (path: string) =>
    `${SUPABASE_URL}/storage/v1/object/public/audio/${path}`

  const safeDate = (d: string | null) => {
    try { return d ? new Date(d + 'T12:00:00').toUTCString() : new Date().toUTCString() }
    catch { return new Date().toUTCString() }
  }

  const items = episodes.map((ep, i) => {
    const cv    = coverUrl(ep.cover_path)
    const audio = audioUrl(ep.audio_path)
    return `
    <item>
      <title><![CDATA[${ep.title}]]></title>
      <link>${SITE_URL}?ep=${ep.id}</link>
      <description><![CDATA[${ep.description || ep.title}]]></description>
      <content:encoded><![CDATA[${ep.description || ep.title}]]></content:encoded>
      <itunes:title><![CDATA[${ep.title}]]></itunes:title>
      <itunes:summary><![CDATA[${ep.description || ep.title}]]></itunes:summary>
      <itunes:author>Radio Sintonízate — IES El Mayorazgo</itunes:author>
      ${cv ? `<itunes:image href="${cv}"/>` : ''}
      <enclosure url="${audio}" type="audio/mpeg" length="0"/>
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
      <itunes:name>IES El Mayorazgo</itunes:name>
      <itunes:email>38010979@gobiernodecanarias.org</itunes:email>
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
