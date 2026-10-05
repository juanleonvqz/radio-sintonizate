import type { Bucket, ByteRange, StoredFile } from './bucket'

// Serves one stored file over HTTP, including the partial requests an audio player
// makes to seek ("Range: bytes=…").
//
// File names are never reused (each upload carries a timestamp and an existing name is
// refused), so a browser may keep what it downloaded for as long as it likes.

const FOREVER = 'public, max-age=31536000, immutable'

export async function serveFile(bucket: Bucket, key: string, request: Request): Promise<Response> {
  const file = await bucket.head(key)
  if (!file) return new Response('Not found', { status: 404 })

  const headers = baseHeaders(file)
  if (request.headers.get('If-None-Match') === file.httpEtag) return new Response(null, { status: 304, headers })

  const wanted = request.headers.get('Range')
  const range  = wanted ? parseRange(wanted, file.size) : null
  if (wanted && !range) {
    headers.set('Content-Range', `bytes */${file.size}`)
    return new Response(null, { status: 416, headers })
  }

  const object = await bucket.get(key, range ? { range: { offset: range.start, length: range.length } satisfies ByteRange } : undefined)
  if (!object) return new Response('Not found', { status: 404 })

  if (range) {
    headers.set('Content-Range', `bytes ${range.start}-${range.start + range.length - 1}/${file.size}`)
    headers.set('Content-Length', String(range.length))
    return new Response(object.body, { status: 206, headers })
  }
  headers.set('Content-Length', String(file.size))
  return new Response(object.body, { status: 200, headers })
}

function baseHeaders(file: StoredFile): Headers {
  return new Headers({
    'Content-Type':  file.httpMetadata?.contentType ?? 'application/octet-stream',
    'ETag':          file.httpEtag,
    'Last-Modified': file.uploaded.toUTCString(),
    'Accept-Ranges': 'bytes',
    'Cache-Control': FOREVER,
  })
}

// One range only, in the three forms players send: "a-b", "a-" and "-n" (the last n
// bytes). Anything else, or a range outside the file, is null.
export function parseRange(header: string, size: number): { start: number; length: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '') || size === 0) return null

  if (match[1] === '') {
    const suffix = Math.min(Number(match[2]), size)
    return suffix > 0 ? { start: size - suffix, length: suffix } : null
  }
  const start = Number(match[1])
  const end   = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  return start < size && start <= end ? { start, length: end - start + 1 } : null
}
