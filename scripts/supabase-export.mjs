#!/usr/bin/env node
// Read-only export of the Supabase project: schema, permission rules, every row, the
// admin accounts and (unless --no-files) the audio and cover files.
//
//   node scripts/supabase-export.mjs <output-dir> [--no-files]
//
// Needs SUPABASE_DB_URL: the "Session pooler" connection string from the Supabase
// dashboard, in the environment or in .env at the repo root. Everything runs inside one
// read-only transaction, so it cannot change the project.
//
// The output holds password hashes. Keep it out of the repo.

import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

// Dates stay as YYYY-MM-DD text. The default turns them into a local-midnight
// timestamp, which shifts with the time zone of whoever runs the export.
pg.types.setTypeParser(pg.types.builtins.DATE, value => value)

const [outDir, ...flags] = process.argv.slice(2)
if (!outDir) {
  console.error('Usage: node scripts/supabase-export.mjs <output-dir> [--no-files]')
  process.exit(1)
}
const withFiles = !flags.includes('--no-files')

const dbUrl = process.env.SUPABASE_DB_URL ?? readDotEnv('SUPABASE_DB_URL')
if (!dbUrl) {
  console.error('SUPABASE_DB_URL is not set (environment or .env).')
  process.exit(1)
}

// The pooler user is "postgres.<project ref>"; the ref is also the storage host.
const projectRef = new URL(dbUrl).username.split('.')[1]
const storageUrl = `https://${projectRef}.supabase.co/storage/v1/object/public`

fs.mkdirSync(path.join(outDir, 'data'), { recursive: true, mode: 0o700 })
const save = (name, value) =>
  fs.writeFileSync(path.join(outDir, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await client.connect()
await client.query('begin transaction read only')
const rows = async sql => (await client.query(sql)).rows

// ── Schema and rules ──────────────────────────────────────────────────────────

const tables = await rows(`
  select c.relname as "table", c.relrowsecurity as rls_on
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' order by 1`)

save('schema.json', {
  exported_at: new Date().toISOString(),
  tables,
  columns: await rows(`
    select table_name, ordinal_position as pos, column_name, udt_name as type, is_nullable, column_default
    from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`),
  constraints: await rows(`
    select conrelid::regclass::text as "table", conname as name, pg_get_constraintdef(oid) as definition
    from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
  policies: await rows(`
    select schemaname, tablename, policyname, cmd, roles::text as roles, qual as "using", with_check
    from pg_policies where schemaname in ('public', 'storage') order by 1, 2, 3`),
  realtime: await rows(`
    select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1`),
  buckets: await rows(`select id, public, file_size_limit, allowed_mime_types from storage.buckets order by 1`),
})

// ── Rows ──────────────────────────────────────────────────────────────────────

const counts = {}
for (const { table } of tables) {
  const data = await rows(`select * from public.${client.escapeIdentifier(table)}`)
  counts[table] = data.length
  save(`data/${table}.json`, data)
}

const users = await rows(`
  select id, email, encrypted_password, created_at, last_sign_in_at, email_confirmed_at, banned_until, deleted_at
  from auth.users order by created_at`)
save('auth-users.json', users)

const objects = await rows(`
  select bucket_id, name, (metadata->>'size')::bigint as size, metadata->>'mimetype' as mimetype, created_at
  from storage.objects where name not like '%.emptyFolderPlaceholder' order by 1, 2`)
save('storage-objects.json', objects)

await client.query('rollback')
await client.end()

// ── Files ─────────────────────────────────────────────────────────────────────

let downloaded = 0
if (withFiles) {
  for (const object of objects) {
    const target = path.join(outDir, 'files', object.bucket_id, object.name)
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })

    const response = await fetch(`${storageUrl}/${object.bucket_id}/${encodeURIComponent(object.name)}`)
    if (!response.ok) throw new Error(`${object.bucket_id}/${object.name}: HTTP ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (object.size !== null && Number(object.size) !== bytes.length) {
      throw new Error(`${object.bucket_id}/${object.name}: got ${bytes.length} bytes, expected ${object.size}`)
    }
    fs.writeFileSync(target, bytes)
    downloaded++
  }
}

// ── Summary (never prints a password hash) ────────────────────────────────────

console.log(`Exported to ${outDir}`)
for (const { table, rls_on } of tables) console.log(`  ${table}: ${counts[table]} rows${rls_on ? '' : '  (row-level security is OFF)'}`)
console.log(`  accounts: ${users.map(u => u.email).join(', ')}`)
console.log(`  files: ${objects.length} listed, ${withFiles ? `${downloaded} downloaded` : 'not downloaded'}`)

function readDotEnv(key) {
  try {
    const line = fs.readFileSync('.env', 'utf8').split('\n').find(l => l.startsWith(`${key}=`))
    return line?.slice(key.length + 1).trim()
  } catch {
    return undefined
  }
}
