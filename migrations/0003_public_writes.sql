-- Public writes (comments left, reactions added) counted per address for a short while,
-- so one source cannot flood the site. The address is stored as a hash, as with login
-- failures, and rows are dropped once the window has passed.
CREATE TABLE public_writes (
  scope    TEXT NOT NULL,
  ip_hash  TEXT NOT NULL,
  at       TEXT NOT NULL
) STRICT;

CREATE INDEX public_writes_lookup ON public_writes (scope, ip_hash, at);
