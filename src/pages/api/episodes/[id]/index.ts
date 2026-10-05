import type { APIRoute } from 'astro'
import { body, enter } from '../../../../server/auth/gate'
import { deleteEpisode, getEpisode, readEpisodeFields, updateEpisode } from '../../../../server/content/episodes'
import { json, mediaBucket } from '../../../../server/http'
import { fileKey } from '../../../../server/media/bucket'

const notFound = () => json({ error: 'not_found' }, 404)

// GET /api/episodes/:id. Open to everyone.
export const GET: APIRoute = async (context) => {
  const gate = await enter(context)
  if (gate instanceof Response) return gate

  const episode = await getEpisode(gate.db, context.params.id!)
  return episode ? json(episode) : notFound()
}

// PATCH /api/episodes/:id  ->  the episode after the change. Admins only.
export const PATCH: APIRoute = async (context) => {
  const gate = await enter(context, { admin: true, changes: true })
  if (gate instanceof Response) return gate

  const fields = readEpisodeFields(await body(context.request), true)
  if (!fields) return json({ error: 'invalid' }, 400)

  const episode = await updateEpisode(gate.db, context.params.id!, fields)
  return episode ? json(episode) : notFound()
}

// DELETE /api/episodes/:id  ->  the episode that was removed. Admins only.
// Its audio and cover go too. The row is removed first: if a file cannot be removed,
// what is left is a stray file nobody links to, never an episode without its audio.
export const DELETE: APIRoute = async (context) => {
  const gate = await enter(context, { admin: true, changes: true })
  if (gate instanceof Response) return gate

  const episode = await deleteEpisode(gate.db, context.params.id!)
  if (!episode) return notFound()

  const files = [fileKey('audio', episode.audio_path), fileKey('covers', episode.cover_path ?? undefined)].filter(key => key !== null)
  await mediaBucket(context)?.delete(files).catch(() => {})

  return json(episode)
}
