// The slice of Cloudflare's D1 API this site uses.
//
// Declared here so the server code depends on one small contract: the real D1 binding
// satisfies it in production, and the tests satisfy it with SQLite (which is what D1
// is underneath), so every query in the tests is a real query.

export interface Db {
  prepare(sql: string): Statement
  batch(statements: Statement[]): Promise<unknown[]>
}

export interface Statement {
  bind(...values: unknown[]): Statement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ meta: { changes: number } }>
}

// Times are stored as UTC ISO-8601 text, which compares correctly as plain strings.
export function timestamp(date: Date): string {
  return date.toISOString()
}
