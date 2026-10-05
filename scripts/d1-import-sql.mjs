#!/usr/bin/env node
// Writes the SQL that loads a Supabase export into D1.
//
//   node scripts/d1-import-sql.mjs <export-dir> <out.sql>
//   npx wrangler d1 execute radio-sintonizate --remote --file <out.sql>
//
// The SQL replaces whatever the tables held, so it is safe to run again for the final
// copy. It contains the accounts' password hashes: write it outside the repo and
// delete it once it has been applied.

import fs from 'node:fs'
import path from 'node:path'
import { exportToSql, carriedOverEmails } from './lib/import-sql.mjs'

const [exportDir, outFile] = process.argv.slice(2)
if (!exportDir || !outFile) {
  console.error('Usage: node scripts/d1-import-sql.mjs <export-dir> <out.sql>')
  process.exit(1)
}

const read = name => JSON.parse(fs.readFileSync(path.join(exportDir, name), 'utf8'))
const data = {
  episodes:      read('data/episodes.json'),
  comments:      read('data/comments.json'),
  reactions:     read('data/reactions.json'),
  site_settings: read('data/site_settings.json'),
  users:         read('auth-users.json'),
}

fs.writeFileSync(outFile, exportToSql(data), { mode: 0o600 })

console.log(`Wrote ${outFile}`)
console.log(`  episodes ${data.episodes.length}, comments ${data.comments.length}, reactions ${data.reactions.length}, settings ${data.site_settings.length}`)
console.log(`  accounts carried over: ${carriedOverEmails(data.users).join(', ') || 'none'}`)
