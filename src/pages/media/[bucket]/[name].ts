import type { APIRoute } from 'astro'
import { mediaBucket, notConfigured } from '../../../server/http'
import { fileKey } from '../../../server/media/bucket'
import { serveFile } from '../../../server/media/serve'

// GET /media/audio/:name and /media/covers/:name  ->  the stored file. Open to
// everyone, as the two public buckets were.
export const GET: APIRoute = async (context) => {
  const bucket = mediaBucket(context)
  if (!bucket) return notConfigured()

  const key = fileKey(context.params.bucket, context.params.name)
  if (!key) return new Response('Not found', { status: 404 })

  return serveFile(bucket, key, context.request)
}
