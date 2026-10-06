import type { APIRoute } from 'astro'
import { enter } from '../../../../server/auth/gate'
import { json, mediaBucket, notConfigured } from '../../../../server/http'
import { fileKey, MAX_UPLOAD_BYTES, uploadType, type Folder } from '../../../../server/media/bucket'

// PUT /api/media/audio/:name and /api/media/covers/:name  ->  stores the request body
// as that file. Admins only. An existing name is refused, so a file is never replaced.
export const PUT: APIRoute = async (context) => {
  const { request } = context

  const size = Number(request.headers.get('Content-Length'))
  if (!request.body || !Number.isInteger(size) || size <= 0) return json({ error: 'empty' }, 400)
  if (size > MAX_UPLOAD_BYTES) return json({ error: 'too_large' }, 413)

  // Take the file in from this very moment, before any wait on the database or the
  // bucket. The edge holds only so much of an upload nobody is reading; past that the
  // browser's upload stalls and is cut off instead of getting an answer. Reading the
  // whole file (50 MB at most) also means a dropped connection never leaves a
  // truncated file behind.
  const incoming = request.arrayBuffer().catch(() => null)
  const answer = async (response: Response) => { await incoming; return response }

  const gate = await enter(context, { admin: true, changes: true })
  if (gate instanceof Response) return answer(gate)
  const bucket = mediaBucket(context)
  if (!bucket) return answer(notConfigured())

  const { bucket: folder, name } = context.params
  const key = fileKey(folder, name)
  if (!key) return answer(json({ error: 'invalid_name' }, 400))

  const type = uploadType(folder as Folder, name!, request.headers.get('Content-Type'))
  if (!type) return answer(json({ error: 'wrong_type' }, 415))

  if (await bucket.head(key)) return answer(json({ error: 'exists' }, 409))

  const bytes = await incoming
  if (!bytes || bytes.byteLength !== size) return json({ error: 'incomplete' }, 400)

  await bucket.put(key, bytes, { httpMetadata: { contentType: type } })
  return json({ path: name }, 201)
}
