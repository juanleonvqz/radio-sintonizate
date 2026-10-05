// The slice of Cloudflare's R2 API this site uses, for the same reason as db.ts: the
// real bucket binding satisfies it, and so does the in-memory one the tests use.

export interface Bucket {
  head(key: string): Promise<StoredFile | null>
  get(key: string, options?: { range?: ByteRange }): Promise<(StoredFile & { body: ReadableStream }) | null>
  put(key: string, value: ReadableStream | ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  delete(keys: string | string[]): Promise<void>
}

export interface StoredFile {
  size: number
  httpEtag: string
  uploaded: Date
  httpMetadata?: { contentType?: string }
}

// First byte and how many, or only the last `suffix` bytes.
export type ByteRange = { offset: number; length: number } | { suffix: number }

// ── Where files live ──────────────────────────────────────────────────────────

// The two folders are the two buckets the files had in Supabase. Names are what the
// admin panel generates (a timestamp, then letters, digits, dots, dashes, underscores).
export const FOLDERS = ['audio', 'covers'] as const
export type Folder = typeof FOLDERS[number]

const NAME = /^[A-Za-z0-9._-]{1,300}$/

export function fileKey(folder: string | undefined, name: string | undefined): string | null {
  if (!folder || !name) return null
  if (!FOLDERS.includes(folder as Folder) || !NAME.test(name) || /^\.+$/.test(name)) return null
  return `${folder}/${name}`
}

// The same per-file limit Supabase applied on the free plan.
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

const EXTENSION_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/x-m4a', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac',
  webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
}

// The type to store for an upload: what the browser said, or failing that what the
// extension says. Null when it is not audio in `audio/` or an image in `covers/`.
export function uploadType(folder: Folder, name: string, declared: string | null): string | null {
  const type = declared?.split(';')[0].trim().toLowerCase() || EXTENSION_TYPES[name.split('.').pop()!.toLowerCase()] || ''
  const wanted = folder === 'audio' ? 'audio/' : 'image/'
  return type.startsWith(wanted) ? type : null
}
