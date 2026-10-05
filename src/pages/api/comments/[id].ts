import type { APIRoute } from 'astro'
import { enter } from '../../../server/auth/gate'
import { approveComment, rejectComment } from '../../../server/content/comments'
import { json } from '../../../server/http'

const answer = (found: boolean) => (found ? json({ ok: true }) : json({ error: 'not_found' }, 404))

// PATCH /api/comments/:id  ->  approves the comment. Admins only.
export const PATCH: APIRoute = async (context) => {
  const gate = await enter(context, { admin: true, changes: true })
  if (gate instanceof Response) return gate

  return answer(await approveComment(gate.db, context.params.id!))
}

// DELETE /api/comments/:id  ->  rejects (removes) the comment. Admins only.
export const DELETE: APIRoute = async (context) => {
  const gate = await enter(context, { admin: true, changes: true })
  if (gate instanceof Response) return gate

  return answer(await rejectComment(gate.db, context.params.id!))
}
