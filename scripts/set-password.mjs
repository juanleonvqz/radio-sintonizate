#!/usr/bin/env node
// Sets a new password for an admin account, from the box.
//
//   node scripts/set-password.mjs <email>
//
// Asks for the password twice with hidden input, stores it in the users table in the
// site's own format, and signs that account out everywhere, so a device that had the
// old password no longer holds a session.
//
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment. The wrapper
// ~/.local/bin/radio-password on the box loads them and runs this.

import readline from 'node:readline'
import { hashPassword } from '../src/server/auth/password.ts'

const DATABASE_ID = '58481cfb-f1ac-415e-a151-49c3a7192828'
const MIN_LENGTH  = 8

const [email] = process.argv.slice(2)
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env
if (!email || !token || !account) {
  console.error('Usage: node scripts/set-password.mjs <email>   (with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID set)')
  process.exit(1)
}

async function query(sql, params = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${DATABASE_ID}/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }),
  })
  const body = await response.json()
  if (!body.success) throw new Error(`D1: ${JSON.stringify(body.errors)}`)
  return body.result[0]
}

// Typed or pasted without echo in a terminal. When the input is piped instead (a test,
// or a script), the lines are read up front. Terminal key codes that sometimes slip
// into a paste are dropped.
const terminal = Boolean(process.stdin.isTTY)
const piped = terminal ? [] : (await new Response(process.stdin).text()).split('\n')
const clean = text => text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x1f\x7f]/g, '').trim()

function askHidden(question) {
  if (!terminal) return Promise.resolve(clean(piped.shift() ?? ''))
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = text => { if (text.includes(question)) rl.output.write(question) }
    rl.question(question, answer => {
      rl.close()
      process.stdout.write('\n')
      resolve(clean(answer))
    })
  })
}

const address = email.trim().toLowerCase()
const found = (await query('SELECT id FROM users WHERE email = ?', [address])).results[0]
if (!found) {
  console.error(`No admin account has the email ${address}. Nothing changed.`)
  process.exit(1)
}

const first = await askHidden(`New password for ${address} (nothing will show): `)
if (first.length < MIN_LENGTH) {
  console.error(`At least ${MIN_LENGTH} characters. Nothing changed.`)
  process.exit(1)
}
const second = await askHidden('Once more: ')
if (first !== second) {
  console.error('They differ. Nothing changed.')
  process.exit(1)
}

await query('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(first), found.id])
const signedOut = (await query('DELETE FROM sessions WHERE user_id = ?', [found.id])).meta.changes
console.log(`Password set for ${address}. Signed out of ${signedOut} device${signedOut === 1 ? '' : 's'}; log in again with the new one.`)
