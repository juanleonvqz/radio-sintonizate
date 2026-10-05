// Text that comes from the database or from a visitor (titles, descriptions, comments,
// the search box) must pass through escapeHtml before it is placed in an innerHTML
// template. Safe for element content and for quoted attribute values.

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"']/g, ch => ENTITIES[ch])
}
