-- Radio Sintonízate on Cloudflare D1.
--
-- Mirrors the Supabase (Postgres) schema as exported on 2026-10-05: the same tables,
-- columns, ids and limits, so the data moves across unchanged and every ?ep= link
-- keeps working. Times are UTC ISO-8601 text (2026-03-21T21:37:37.541Z) and dates are
-- YYYY-MM-DD text; both sort correctly as plain strings.
--
-- Who may do what is not stored here. In Supabase it was row-level security; on
-- Cloudflare the server code checks it before running a statement.

CREATE TABLE episodes (
  id          TEXT PRIMARY KEY NOT NULL,
  title       TEXT NOT NULL,
  program     TEXT,
  description TEXT,
  date        TEXT CHECK (date IS NULL OR date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  audio_path  TEXT NOT NULL,
  cover_path  TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX episodes_created_at ON episodes (created_at DESC);

CREATE TABLE comments (
  id          TEXT PRIMARY KEY NOT NULL,
  episode_id  TEXT NOT NULL REFERENCES episodes (id) ON DELETE CASCADE,
  author      TEXT NOT NULL CHECK (length(author) <= 50),
  body        TEXT NOT NULL CHECK (length(body) <= 500),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX comments_by_episode ON comments (episode_id, status, created_at);

-- The site offers four of these today; the fifth is kept because the old database
-- still accepted it.
CREATE TABLE reactions (
  id          TEXT PRIMARY KEY NOT NULL,
  episode_id  TEXT NOT NULL REFERENCES episodes (id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL CHECK (emoji IN ('👏', '❤️', '🎙️', '🔥', '😂')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX reactions_by_episode ON reactions (episode_id);

CREATE TABLE site_settings (
  key         TEXT PRIMARY KEY NOT NULL,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Admin accounts. Carried over from Supabase Auth with the same id, email and stored
-- password hash, so the same password keeps working (see src/server/auth/password.ts).
-- There is no sign-up: a row here is the only way to be an admin.
CREATE TABLE users (
  id               TEXT PRIMARY KEY NOT NULL,
  email            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash    TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_sign_in_at  TEXT
) STRICT;
