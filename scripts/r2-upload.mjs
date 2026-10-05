#!/usr/bin/env node
// Copies the audio and cover files of a Supabase export into the R2 bucket.
//
//   node scripts/r2-upload.mjs <export-dir>
//
// Each file keeps its name under the folder of its old bucket (audio/…, covers/…) and
// its content type. Files already in the bucket with the same size are skipped, so
// running it again for the final copy only sends what is new.
//
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment.

import fs from 'node:fs'
import path from 'node:path'

const BUCKET       = 'radio-sintonizate-media'
const JURISDICTION = 'eu'

const [exportDir] = process.argv.slice(2)
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env
if (!exportDir || !token || !account) {
  console.error('Usage: node scripts/r2-upload.mjs <export-dir>   (with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID set)')
  process.exit(1)
}

const api     = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${BUCKET}/objects`
const headers = { Authorization: `Bearer ${token}`, 'cf-r2-jurisdiction': JURISDICTION }

const objects = JSON.parse(fs.readFileSync(path.join(exportDir, 'storage-objects.json'), 'utf8'))
const present = await listBucket()

let sent = 0, skipped = 0
for (const object of objects) {
  const key  = `${object.bucket_id}/${object.name}`
  const file = path.join(exportDir, 'files', object.bucket_id, object.name)
  const size = fs.statSync(file).size

  if (present.get(key) === size) { skipped++; continue }

  const response = await fetch(`${api}/${encodeURIComponent(key)}`, {
    method:  'PUT',
    headers: { ...headers, 'Content-Type': object.mimetype ?? 'application/octet-stream' },
    body:    fs.readFileSync(file),
  })
  if (!response.ok) throw new Error(`${key}: HTTP ${response.status} ${await response.text()}`)
  sent++
}

// Trust the bucket, not the loop: list it again and compare every size.
const after   = await listBucket()
const missing = objects.filter(o => after.get(`${o.bucket_id}/${o.name}`) !== fs.statSync(path.join(exportDir, 'files', o.bucket_id, o.name)).size)

console.log(`Uploaded ${sent}, already there ${skipped}, expected ${objects.length}, in the bucket ${after.size}`)
if (missing.length) {
  console.error(`Missing or wrong size: ${missing.map(o => `${o.bucket_id}/${o.name}`).join(', ')}`)
  process.exit(1)
}

async function listBucket() {
  const sizes = new Map()
  let cursor
  do {
    const url = new URL(api)
    url.searchParams.set('per_page', '1000')
    if (cursor) url.searchParams.set('cursor', cursor)

    const response = await fetch(url, { headers })
    const body = await response.json()
    if (!body.success) throw new Error(`Listing the bucket failed: ${JSON.stringify(body.errors)}`)

    for (const item of body.result) sizes.set(item.key, item.size)
    cursor = body.result_info?.is_truncated ? body.result_info.cursor : undefined
  } while (cursor)
  return sizes
}
