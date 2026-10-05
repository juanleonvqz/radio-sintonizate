import type { APIRoute } from 'astro'
import { enter } from '../../../server/auth/gate'
import { listPendingComments } from '../../../server/content/comments'
import { json } from '../../../server/http'

// GET /api/comments/pending  ->  comments waiting for review, with their episode title.
// Admins only.
export const GET: APIRoute = async (context) => {
  const gate = await enter(context, { admin: true })
  if (gate instanceof Response) return gate

  return json(await listPendingComments(gate.db))
}
