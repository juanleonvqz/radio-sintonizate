import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import type { Db, Statement } from '../db'

// Test-only stand-in for the D1 binding: an in-memory SQLite database with every
// migration applied, behind the same small interface the server code uses.

const MIGRATIONS_DIR = new URL('../../../migrations/', import.meta.url)

export interface TestDb extends Db {
  raw: DatabaseSync
}

export function createTestDb(): TestDb {
  const raw = new DatabaseSync(':memory:')
  raw.exec('PRAGMA foreign_keys = ON')   // D1 enforces foreign keys
  for (const file of fs.readdirSync(MIGRATIONS_DIR).sort()) {
    raw.exec(fs.readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'))
  }

  const statement = (sql: string, values: unknown[] = []): Statement => ({
    bind:  (...next) => statement(sql, next),
    first: async <T>() => (raw.prepare(sql).get(...(values as never[])) as T | undefined) ?? null,
    all:   async <T>() => ({ results: raw.prepare(sql).all(...(values as never[])) as T[] }),
    run:   async () => ({ meta: { changes: Number(raw.prepare(sql).run(...(values as never[])).changes) } }),
  })

  return {
    raw,
    prepare: sql => statement(sql),
    batch:   async statements => Promise.all(statements.map(s => s.run())),
  }
}
