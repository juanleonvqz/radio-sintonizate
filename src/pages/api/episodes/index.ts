import type { APIRoute } from 'astro'
import { body, enter } from '../../../server/auth/gate'
import { createEpisode, listEpisodes, readEpisodeFields } from '../../../server/content/episodes'
import { json } from '../../../server/http'
import { AFTER_EPISODE_CHANGE, edgeCache, purge } from '../../../server/edge-cache'

// GET /api/episodes  ->  every episode, newest first. Open to everyone.
export const GET: APIRoute = async (context) => {
  const gate = await enter(context)
  if (gate instanceof Response) return gate

  return json(await listEpisodes(gate.db))
}

// POST /api/episodes  ->  the new episode. Admins only.
export const POST: APIRoute = async (context) => {
  const gate = await enter(context, { admin: true, changes: true })
  if (gate instanceof Response) return gate

  const fields = readEpisodeFields(await body(context.request), false)
  if (!fields) return json({ error: 'invalid' }, 400)

  const episode = await createEpisode(gate.db, fields)
  await purge(edgeCache(), new URL(context.request.url).origin, AFTER_EPISODE_CHANGE)
  return json(episode, 201)
}
