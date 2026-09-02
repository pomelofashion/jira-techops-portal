-- 019: Server-backed Suggestions board; retire the separate feedback inbox.
-- The feedback bubble and the Suggestions section are merged: the bubble now
-- posts suggestions (title + category + details + auto-captured page), so
-- suggestions move from per-browser localStorage to Postgres and the
-- short-lived feedback table goes away. Ids stay client-generated TEXT so the
-- optimistic client store and the server agree. Forward-only. Idempotent:
-- safe to run more than once.

CREATE TABLE IF NOT EXISTS suggestions (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  body              TEXT NOT NULL DEFAULT '',
  category          TEXT NOT NULL DEFAULT 'Other',
  status            TEXT NOT NULL DEFAULT 'Open',
  page              TEXT NOT NULL DEFAULT '',
  page_label        TEXT NOT NULL DEFAULT '',
  author_name       TEXT NOT NULL,
  author_email      TEXT NOT NULL,
  author_role_label TEXT NOT NULL DEFAULT 'User',
  author_role_color TEXT NOT NULL DEFAULT '#52525B',
  author_is_staff   BOOLEAN NOT NULL DEFAULT FALSE,
  votes             JSONB NOT NULL DEFAULT '{}'::jsonb,
  comments          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS suggestions_created_idx ON suggestions (created_at DESC);

DROP TABLE IF EXISTS feedback;

UPDATE roles SET capabilities = capabilities - 'feedback.view'
 WHERE capabilities @> '["feedback.view"]'::jsonb;
