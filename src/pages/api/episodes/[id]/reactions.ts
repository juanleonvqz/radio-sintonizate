import type { APIRoute } from 'astro'
import { body, enter } from '../../../../server/auth/gate'
import { addReaction, reactionCounts } from '../../../../server/content/reactions'
import { clientAddress, json } from '../../../../server/http'
import { countWrite, overAllowance } from '../../../../server/throttle'

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

  const ip = clientAddress(context.request)
  if (await overAllowance(gate.db, 'reaction', ip)) return json({ error: 'too_many' }, 429)

  const result = await addReaction(gate.db, context.params.id!, (await body(context.request)).emoji)

  if (result === 'invalid')    return json({ error: 'invalid' }, 400)
  if (result === 'no_episode') return json({ error: 'not_found' }, 404)
  await countWrite(gate.db, 'reaction', ip)
  return json({ ok: true }, 201)
}
