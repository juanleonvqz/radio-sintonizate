import type { APIRoute } from 'astro'
import { body, enter } from '../../../../server/auth/gate'
import { addReaction, reactionCounts } from '../../../../server/content/reactions'
import { json } from '../../../../server/http'

// GET /api/episodes/:id/reactions  ->  { "👏": 3, ... }. Open to everyone.
export const GET: APIRoute = async (context) => {
  const gate = await enter(context)
  if (gate instanceof Response) return gate

  return json(await reactionCounts(gate.db, context.params.id!))
}

// POST /api/episodes/:id/reactions  { emoji }. Open to everyone.
export const POST: APIRoute = async (context) => {
  const gate = await enter(context, { changes: true })
  if (gate instanceof Response) return gate

  const result = await addReaction(gate.db, context.params.id!, (await body(context.request)).emoji)

  if (result === 'invalid')    return json({ error: 'invalid' }, 400)
  if (result === 'no_episode') return json({ error: 'not_found' }, 404)
  return json({ ok: true }, 201)
}
