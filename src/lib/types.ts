export interface Episode {
  id: string
  title: string
  program: string | null
  description: string | null
  date: string | null
  audio_path: string
  cover_path: string | null
  created_at: string
}
