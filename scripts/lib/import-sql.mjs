// Turns a saved export (the format of the last Supabase export, kept outside the repo)
// into the SQL that loads it into D1. Pure: data in, text out, so it can be tested without a database.
//
// The SQL empties the tables first, so running it again replaces the earlier copy
// instead of doubling it. That is what makes the final copy on switch day safe.

const TABLES = {
  episodes:      ['id', 'title', 'program', 'description', 'date', 'audio_path', 'cover_path', 'created_at'],
  comments:      ['id', 'episode_id', 'author', 'body', 'status', 'created_at'],
  reactions:     ['id', 'episode_id', 'emoji', 'created_at'],
  site_settings: ['key', 'value', 'updated_at'],
  users:         ['id', 'email', 'password_hash', 'created_at', 'last_sign_in_at'],
}

// Children before parents when emptying, parents before children when filling.
const FILL_ORDER = ['episodes', 'comments', 'reactions', 'site_settings', 'users']

export function exportToSql({ episodes = [], comments = [], reactions = [], site_settings = [], users = [] }) {
  const rows = { episodes, comments, reactions, site_settings, users: users.filter(isCarriedOver).map(toUserRow) }

  const lines = [...FILL_ORDER].reverse().map(table => `DELETE FROM ${table};`)
  for (const table of FILL_ORDER) {
    const columns = TABLES[table]
    for (const row of rows[table]) {
      lines.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(c => literal(row[c])).join(', ')});`)
    }
  }
  return lines.join('\n') + '\n'
}

export function carriedOverEmails(users = []) {
  return users.filter(isCarriedOver).map(u => u.email.toLowerCase())
}

// An account comes across only if someone can actually log in with it today.
function isCarriedOver(user) {
  return Boolean(user.email && user.encrypted_password && !user.deleted_at && !user.banned_until)
}

function toUserRow(user) {
  return {
    id:              user.id,
    email:           user.email.toLowerCase(),
    password_hash:   user.encrypted_password,
    created_at:      user.created_at,
    last_sign_in_at: user.last_sign_in_at ?? null,
  }
}

// SQLite string literals escape a quote by doubling it and nothing else.
function literal(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value !== 'string') throw new TypeError(`Only text and null are expected, got ${typeof value}`)
  return `'${value.replaceAll("'", "''")}'`
}
