import { timestamp, type Db } from '../db'

// Site settings (the description banner and whether it shows). Everyone reads them;
// the endpoints let only an admin change them.

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM site_settings WHERE key = ?').bind(key).first<{ value: string }>()
  return row?.value ?? null
}

export async function setSetting(db: Db, key: string, value: string, now = new Date()): Promise<void> {
  await db
    .prepare(`INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)
              ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .bind(key, value, timestamp(now))
    .run()
}
