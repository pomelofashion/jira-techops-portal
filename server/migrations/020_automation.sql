-- 020: Automation engine markers.
-- Scheduled automation (SLA escalation, Waiting-for-Customer nudge/auto-close,
-- stale work-in-progress nudges) needs a per-ticket place to record what it has
-- already done so each action fires at most once per situation. A single JSONB
-- bag keeps this open-ended without a column per job. Forward-only. Idempotent.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS automation JSONB NOT NULL DEFAULT '{}'::jsonb;
