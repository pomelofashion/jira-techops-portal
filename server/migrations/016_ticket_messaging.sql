-- 016: Ticket communication overhaul.
-- Conversations become private (requester + superadmins + assignee), internal
-- notes get their own capability, comments gain a real author identity and
-- @mentions, and per-user read cursors power unread badges.
-- author_email is NULL on pre-016 rows — display-only, never identity-matched.
-- mentions is a JSONB array of {name, email} objects.
-- Forward-only. Idempotent: safe to run more than once.

ALTER TABLE ticket_comments
  ADD COLUMN IF NOT EXISTS author_email TEXT,
  ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Per-user conversation read cursor (unread badges on My Tickets).
CREATE TABLE IF NOT EXISTS ticket_reads (
  ticket_id    UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_email   TEXT NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, user_email)
);

-- Speeds the list page's "latest public message" lateral lookup.
CREATE INDEX IF NOT EXISTS ticket_comments_ticket_created_idx
  ON ticket_comments(ticket_id, created_at DESC)
  WHERE NOT internal;

-- Internal notes get their own capability: superadmin + admin only. Developers
-- deliberately lose access (they kept it implicitly via tickets.view_all).
-- Roles are data — mirror of the SEED_ROLES change in src/rbac.js.
UPDATE roles
   SET capabilities = capabilities || '["tickets.internal_notes"]'::jsonb
 WHERE id IN ('role_superadmin', 'role_admin')
   AND NOT capabilities @> '["tickets.internal_notes"]'::jsonb;
