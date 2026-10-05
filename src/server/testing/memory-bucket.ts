import type { Bucket, ByteRange, StoredFile } from '../media/bucket'

// Test-only stand-in for the R2 bucket binding: files kept in a Map.

interface Entry {
  bytes: Uint8Array
  contentType?: string
  uploaded: Date
}

export interface TestBucket extends Bucket {
  files: Map<string, Entry>
}

export function createTestBucket(): TestBucket {
  const files = new Map<string, Entry>()

  const describe = (entry: Entry): StoredFile => ({
    size:         entry.bytes.length,
    httpEtag:     `"${entry.bytes.length}-${entry.bytes.reduce((sum, byte) => (sum + byte) % 65521, 0)}"`,
    uploaded:     entry.uploaded,
    httpMetadata: { contentType: entry.contentType },
  })

  const slice = (bytes: Uint8Array, range?: ByteRange) => {
    if (!range) return bytes
    if ('suffix' in range) return bytes.slice(bytes.length - range.suffix)
    return bytes.slice(range.offset, range.offset + range.length)
  }

  return {
    files,
    head: async key => (files.has(key) ? describe(files.get(key)!) : null),
    get: async (key, options) => {
      const entry = files.get(key)
      if (!entry) return null
      return { ...describe(entry), body: new Blob([slice(entry.bytes, options?.range)]).stream() }
    },
    put: async (key, value, options) => {
      const bytes = value instanceof ReadableStream ? new Uint8Array(await new Response(value).arrayBuffer()) : new Uint8Array(value as ArrayBuffer)
      files.set(key, { bytes, contentType: options?.httpMetadata?.contentType, uploaded: new Date('2026-10-05T12:00:00.000Z') })
    },
    delete: async keys => { for (const key of [keys].flat()) files.delete(key) },
  }
}
