-- 021: Generic key/value app config (server-backed global settings).
-- First use: the ticket-field layout (which submission fields show on a
-- ticket, their order, labels, visibility, and editability). A single JSONB
-- value per key keeps this open-ended. Forward-only. Idempotent.
CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_config (key, value) VALUES (
  'ticket_fields',
  '[{"key":"requesterEmail","label":"Requester Email","visible":true,"editable":true},
    {"key":"requesterName","label":"Requester Name","visible":true,"editable":true},
    {"key":"title","label":"Title","visible":true,"editable":true},
    {"key":"description","label":"Description","visible":true,"editable":true},
    {"key":"currentResult","label":"Current Result","visible":true,"editable":true},
    {"key":"expectedResult","label":"Expected Result","visible":true,"editable":true}]'::jsonb
) ON CONFLICT (key) DO NOTHING;
