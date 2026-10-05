import type { APIRoute } from 'astro'
import { body, enter } from '../../../server/auth/gate'
import { getSetting, setSetting } from '../../../server/content/settings'
import { json } from '../../../server/http'

// GET /api/settings/:key  ->  { value } (null when unset). Open to everyone.
export const GET: APIRoute = async (context) => {
  const gate = await enter(context)
  if (gate instanceof Response) return gate

  return json({ value: await getSetting(gate.db, context.params.key!) })
}

// PUT /api/settings/:key  { value }. Admins only.
export const PUT: APIRoute = async (context) => {
  const gate = await enter(context, { admin: true, changes: true })
  if (gate instanceof Response) return gate

  const { value } = await body(context.request)
  if (typeof value !== 'string') return json({ error: 'invalid' }, 400)

  await setSetting(gate.db, context.params.key!, value)
  return json({ value })
}
