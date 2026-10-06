import type { APIRoute } from 'astro'
import { enter } from '../../../../server/auth/gate'
import { json, mediaBucket, notConfigured } from '../../../../server/http'
import { fileKey, MAX_UPLOAD_BYTES, uploadType, type Folder } from '../../../../server/media/bucket'

// PUT /api/media/audio/:name and /api/media/covers/:name  ->  stores the request body
// as that file. Admins only. An existing name is refused, so a file is never replaced.
export const PUT: APIRoute = async (context) => {
  const gate = await enter(context, { admin: true, changes: true })
  if (gate instanceof Response) return gate
  const bucket = mediaBucket(context)
  if (!bucket) return notConfigured()

  const { bucket: folder, name } = context.params
  const key = fileKey(folder, name)
  if (!key) return json({ error: 'invalid_name' }, 400)

  const type = uploadType(folder as Folder, name!, context.request.headers.get('Content-Type'))
  if (!type) return json({ error: 'wrong_type' }, 415)

  const size = Number(context.request.headers.get('Content-Length'))
  if (!context.request.body || !Number.isInteger(size) || size <= 0) return json({ error: 'empty' }, 400)
  if (size > MAX_UPLOAD_BYTES) return json({ error: 'too_large' }, 413)

  if (await bucket.head(key)) return json({ error: 'exists' }, 409)

  // Read the whole file first (50 MB at most): the bucket needs to know the length, and
  // a connection that dropped halfway must not leave a truncated file behind.
  const bytes = await context.request.arrayBuffer()
  if (bytes.byteLength !== size) return json({ error: 'incomplete' }, 400)

  await bucket.put(key, bytes, { httpMetadata: { contentType: type } })
  return json({ path: name }, 201)
}
