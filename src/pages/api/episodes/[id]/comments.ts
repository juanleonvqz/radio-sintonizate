import type { APIRoute } from 'astro'
import { body, enter } from '../../../../server/auth/gate'
import { listApprovedComments, submitComment } from '../../../../server/content/comments'
import { json } from '../../../../server/http'

// GET /api/episodes/:id/comments  ->  the approved comments, oldest first. Open to everyone.
export const GET: APIRoute = async (context) => {
  const gate = await enter(context)
  if (gate instanceof Response) return gate

  return json(await listApprovedComments(gate.db, context.params.id!))
}

// POST /api/episodes/:id/comments  { author, body }. Open to everyone; the comment
// waits as pending until an admin approves it.
export const POST: APIRoute = async (context) => {
  const gate = await enter(context, { changes: true })
  if (gate instanceof Response) return gate

  const input  = await body(context.request)
  const result = await submitComment(gate.db, context.params.id!, input.author, input.body)

  if (result === 'invalid')    return json({ error: 'invalid' }, 400)
  if (result === 'no_episode') return json({ error: 'not_found' }, 404)
  return json({ status: 'pending' }, 201)
}
