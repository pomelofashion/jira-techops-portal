-- 014: Spaces + Boards.
-- Spaces are top-level containers (Tech Ops, Business, IT Support…); boards
-- live in a space and own a short uppercase key used for sequential ticket
-- codes (KEY-1, KEY-2…). Existing tickets keep their TKT-/PRB-/CHG- keys
-- forever — only tickets created after this migration use the board scheme.
-- Access model: space_members grants a role on every board in the space;
-- board_members grants a role on a single board to an individual account.
-- role values: 'admin' | 'member' | 'viewer' (TEXT + zod at the route, per
-- house convention — no SQL enums).
-- Forward-only. Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS spaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  archived    BOOLEAN NOT NULL DEFAULT FALSE,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS boards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id         UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  key              TEXT NOT NULL UNIQUE,  -- 2-10 uppercase chars, immutable (zod-enforced)
  name             TEXT NOT NULL,
  description      TEXT,
  next_seq         BIGINT NOT NULL DEFAULT 1,  -- bumped atomically at ticket create
  jira_project_key TEXT,                       -- NULL = board has no Jira mirror
  archived         BOOLEAN NOT NULL DEFAULT FALSE,
  sort             INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS space_members (
  space_id   UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',  -- admin | member | viewer
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);

CREATE TABLE IF NOT EXISTS board_members (
  board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',  -- admin | member | viewer
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES boards(id) ON DELETE SET NULL;

-- Backfill: the default Tech Ops space + PESD1 board adopt every existing row
-- (tickets, problems and changes share the table). PESD1's next_seq starting
-- at 1 is safe: all existing keys are TKT-/PRB-/CHG-, so PESD1-n never collides.
INSERT INTO spaces (name, slug)
  SELECT 'Tech Ops', 'tech-ops'
  WHERE NOT EXISTS (SELECT 1 FROM spaces WHERE slug = 'tech-ops');

INSERT INTO boards (space_id, key, name, jira_project_key)
  SELECT s.id, 'PESD1', 'PESD1', 'PESD1' FROM spaces s
  WHERE s.slug = 'tech-ops'
    AND NOT EXISTS (SELECT 1 FROM boards WHERE key = 'PESD1');

UPDATE tickets
   SET board_id = (SELECT id FROM boards WHERE key = 'PESD1')
 WHERE board_id IS NULL;

CREATE INDEX IF NOT EXISTS tickets_board_idx ON tickets(board_id);
CREATE INDEX IF NOT EXISTS space_members_user_idx ON space_members(user_id);
CREATE INDEX IF NOT EXISTS board_members_user_idx ON board_members(user_id);
