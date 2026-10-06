#!/usr/bin/env node
// Copies the live site's data from Cloudflare to the box, in the same layout the restore
// scripts read (d1-import-sql.mjs, r2-upload.mjs), so a restore is those two commands.
//
//   node scripts/pull-live.mjs <output-dir>
//
// Rows are written in full each run (they are small). Files are downloaded only when
// missing or of a different size. A file that has since been deleted from the bucket is
// kept here on purpose: that is the mistake this copy exists to undo.
//
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment. Run nightly
// by a systemd timer on the box, before the restic backup picks the folder up.

import fs from 'node:fs'
import path from 'node:path'

const DATABASE_ID  = '58481cfb-f1ac-415e-a151-49c3a7192828'
const BUCKET       = 'radio-sintonizate-media'
const JURISDICTION = 'eu'
const TABLES       = ['episodes', 'comments', 'reactions', 'site_settings']

const [outDir] = process.argv.slice(2)
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env
if (!outDir || !token || !account) {
  console.error('Usage: node scripts/pull-live.mjs <output-dir>   (with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID set)')
  process.exit(1)
}

const api  = `https://api.cloudflare.com/client/v4/accounts/${account}`
const auth = { Authorization: `Bearer ${token}` }

fs.mkdirSync(path.join(outDir, 'data'), { recursive: true, mode: 0o700 })
const save = (name, value) =>
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })

// ── Rows ──────────────────────────────────────────────────────────────────────

async function query(sql) {
  const response = await fetch(`${api}/d1/database/${DATABASE_ID}/query`, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql }),
  })
  const body = await response.json()
  if (!body.success) throw new Error(`D1: ${JSON.stringify(body.errors)}`)
  return body.result[0].results
}

const counts = {}
for (const table of TABLES) {
  const order = table === 'site_settings' ? 'key' : 'created_at, id'
  const rows = await query(`SELECT * FROM ${table} ORDER BY ${order}`)
  counts[table] = rows.length
  save(`data/${table}.json`, rows)
}

// Accounts, in the shape the import script expects.
const users = await query('SELECT id, email, password_hash, created_at, last_sign_in_at FROM users ORDER BY created_at')
save('auth-users.json', users.map(u => ({
  id: u.id, email: u.email, encrypted_password: u.password_hash,
  created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, banned_until: null, deleted_at: null,
})))

// ── Files ─────────────────────────────────────────────────────────────────────

const objects = []
let cursor
do {
  const url = new URL(`${api}/r2/buckets/${BUCKET}/objects`)
  url.searchParams.set('per_page', '1000')
  if (cursor) url.searchParams.set('cursor', cursor)
  const body = await (await fetch(url, { headers: { ...auth, 'cf-r2-jurisdiction': JURISDICTION } })).json()
  if (!body.success) throw new Error(`R2 list: ${JSON.stringify(body.errors)}`)
  objects.push(...body.result)
  cursor = body.result_info?.is_truncated ? body.result_info.cursor : undefined
} while (cursor)

const listed = objects
  .filter(o => /^(audio|covers)\//.test(o.key))
  .map(o => ({ bucket_id: o.key.split('/')[0], name: o.key.slice(o.key.indexOf('/') + 1), size: o.size, mimetype: o.http_metadata?.contentType ?? null }))
  .sort((a, b) => a.bucket_id.localeCompare(b.bucket_id) || a.name.localeCompare(b.name))
save('storage-objects.json', listed)

let downloaded = 0
for (const object of listed) {
  const target = path.join(outDir, 'files', object.bucket_id, object.name)
  if (fs.existsSync(target) && fs.statSync(target).size === object.size) continue

  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
  const response = await fetch(`${api}/r2/buckets/${BUCKET}/objects/${encodeURIComponent(`${object.bucket_id}/${object.name}`)}`, {
    headers: { ...auth, 'cf-r2-jurisdiction': JURISDICTION },
  })
  if (!response.ok) throw new Error(`${object.bucket_id}/${object.name}: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length !== object.size) throw new Error(`${object.bucket_id}/${object.name}: got ${bytes.length} bytes, expected ${object.size}`)
  fs.writeFileSync(target, bytes, { mode: 0o600 })
  downloaded++
}

const kept = ['audio', 'covers'].reduce((n, folder) => {
  const dir = path.join(outDir, 'files', folder)
  return n + (fs.existsSync(dir) ? fs.readdirSync(dir).length : 0)
}, 0)

console.log(`${new Date().toISOString()} copied to ${outDir}: ${TABLES.map(t => `${t} ${counts[t]}`).join(', ')}, ${users.length} accounts, ${listed.length} files in the bucket, ${downloaded} new, ${kept} kept here`)
