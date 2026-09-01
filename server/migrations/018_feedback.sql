-- 018: Platform feedback inbox.
-- The floating bubble becomes a feedback form: header + comment plus the
-- page (portal section) the user was on, captured automatically. Feedback is
-- private to admins (feedback.view). Forward-only. Idempotent: safe to run
-- more than once.

CREATE TABLE IF NOT EXISTS feedback (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_name  TEXT NOT NULL,
  author_email TEXT NOT NULL,
  page         TEXT NOT NULL,
  page_label   TEXT NOT NULL DEFAULT '',
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'New',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback (created_at DESC);

-- Roles are data: the chat assistant (and its chatlogs.view capability) is
-- retired; feedback.view takes its place for the admin tier.
UPDATE roles SET capabilities = capabilities - 'chatlogs.view'
 WHERE capabilities @> '["chatlogs.view"]'::jsonb;
UPDATE roles SET capabilities = capabilities || '["feedback.view"]'::jsonb
 WHERE id IN ('role_superadmin', 'role_admin')
   AND NOT capabilities @> '["feedback.view"]'::jsonb;
