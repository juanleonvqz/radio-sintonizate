-- Login sessions and the bookkeeping that slows down password guessing.

-- One row per signed-in browser. The cookie holds a random token; only its SHA-256 is
-- stored, so reading this table does not let anyone sign in.
CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY NOT NULL,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
) STRICT;

CREATE INDEX sessions_by_user ON sessions (user_id);

-- Failed logins, kept only for the length of the throttling window. The address is
-- stored as a hash, never in the clear.
CREATE TABLE login_failures (
  ip_hash    TEXT NOT NULL,
  failed_at  TEXT NOT NULL
) STRICT;

CREATE INDEX login_failures_by_ip ON login_failures (ip_hash, failed_at);
