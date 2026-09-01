// server/routes/spaces.js
// Spaces, boards, and membership. Mounted at /api/spaces.
//
// Spaces are top-level containers; boards belong to a space and own the short
// uppercase key used for sequential ticket codes (KEY-n). Access model:
//  - space_members grants a role (admin|member|viewer) on every board in the
//    space; board_members grants a role on a single board to one account.
//  - Global spaces.manage manages everything; a space-role 'admin' manages
//    their own space (boards + members) without the global capability.
// Boards and spaces ARCHIVE rather than delete (ticket history references
// them), mirroring the request_types precedent. Membership rows do delete.

import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, requireCapability, writeAudit } from '../auth.js';
import { isSpaceAdmin, isBoardAdmin } from '../lib/spacesAccess.js';

const router = Router();
router.use(requireAuth);

const can = (user, cap) =>
  Array.isArray(user.role?.capabilities) && user.role.capabilities.includes(cap);

const ROLE_ENUM = z.enum(['admin', 'member', 'viewer']);
// Jira-style board key: 2-10 chars, letter first, uppercase alphanumeric.
const BOARD_KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;

const spaceSchema = z
  .object({
    name: z.string().min(1).max(80),
    description: z.string().max(400).optional(),
    sort: z.number().int().min(0).max(10000).optional(),
    archived: z.boolean().optional(),
  })
  .strict();

const boardCreateSchema = z
  .object({
    key: z.string().regex(BOARD_KEY_RE, 'Key must be 2-10 uppercase letters/digits.'),
    name: z.string().min(1).max(80),
    description: z.string().max(400).optional(),
    jiraProjectKey: z.string().max(20).nullable().optional(),
    sort: z.number().int().min(0).max(10000).optional(),
  })
  .strict();

// Board keys are immutable after creation — ticket codes are minted from them.
const boardPatchSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(400).optional(),
    jiraProjectKey: z.string().max(20).nullable().optional(),
    sort: z.number().int().min(0).max(10000).optional(),
    archived: z.boolean().optional(),
  })
  .strict();

const cleanJiraKey = v =>
  v == null
    ? null
    : String(v)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '') || null;

const serializeBoard = (b, myRole = null) => ({
  id: b.id,
  spaceId: b.space_id,
  key: b.key,
  name: b.name,
  description: b.description,
  jiraProjectKey: b.jira_project_key,
  archived: b.archived,
  sort: b.sort,
  myRole,
  createdAt: b.created_at,
  updatedAt: b.updated_at,
});

const serializeSpace = (s, boards, myRole = null) => ({
  id: s.id,
  name: s.name,
  slug: s.slug,
  description: s.description,
  archived: s.archived,
  sort: s.sort,
  myRole,
  boards,
});

// ─── List (boot hydration) ────────────────────────────────────────────────────
// Returns the spaces + nested boards the caller can see, with the caller's
// effective role on each. Global staff see everything.
router.get('/', async (req, res, next) => {
  try {
    const seeAll = can(req.user, 'tickets.view_all') || can(req.user, 'spaces.manage');
    const includeArchived = req.query.all === '1' && seeAll;
    const spacesQ = await query(
      includeArchived
        ? 'SELECT * FROM spaces ORDER BY sort ASC, name ASC'
        : 'SELECT * FROM spaces WHERE archived = FALSE ORDER BY sort ASC, name ASC'
    );
    const boardsQ = await query(
      includeArchived
        ? 'SELECT * FROM boards ORDER BY sort ASC, name ASC'
        : 'SELECT * FROM boards WHERE archived = FALSE ORDER BY sort ASC, name ASC'
    );
    const spaceRoles = req.user.spaceRoles || {};
    const boardRoles = req.user.boardRoles || {};
    const out = [];
    for (const s of spacesQ.rows) {
      const spaceRole = spaceRoles[s.id] || null;
      const boards = boardsQ.rows
        .filter(b => b.space_id === s.id)
        .filter(b => seeAll || boardRoles[b.id])
        .map(b => serializeBoard(b, boardRoles[b.id] || spaceRole));
      if (seeAll || spaceRole || boards.length) out.push(serializeSpace(s, boards, spaceRole));
    }
    res.json({ spaces: out });
  } catch (err) {
    next(err);
  }
});

// ─── Space CRUD (global capability) ───────────────────────────────────────────
router.post('/', requireCapability('spaces.manage'), async (req, res, next) => {
  try {
    const parsed = spaceSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Invalid input.', details: parsed.error.flatten() });
    const d = parsed.data;
    const base =
      d.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'space';
    const exists = await query('SELECT 1 FROM spaces WHERE slug=$1', [base]);
    const slug = exists.rows.length ? `${base}-${Date.now().toString(36)}` : base;
    const { rows } = await query(
      `INSERT INTO spaces (name, slug, description, sort) VALUES ($1,$2,$3,$4) RETURNING *`,
      [d.name, slug, d.description || null, d.sort ?? 0]
    );
    await writeAudit(req.user.email, 'space.create', slug, { name: d.name });
    res.status(201).json(serializeSpace(rows[0], [], null));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireCapability('spaces.manage'), async (req, res, next) => {
  try {
    const parsed = spaceSchema.partial().safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Invalid input.', details: parsed.error.flatten() });
    const d = parsed.data;
    const sets = [];
    const params = [];
    for (const [col, val] of [
      ['name', d.name],
      ['description', d.description],
      ['sort', d.sort],
      ['archived', d.archived],
    ]) {
      if (val !== undefined) {
        params.push(val);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE spaces SET ${sets.join(', ')}, updated_at = now() WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Space not found.' });
    await writeAudit(req.user.email, 'space.update', rows[0].slug, d);
    res.json(serializeSpace(rows[0], [], req.user.spaceRoles?.[rows[0].id] || null));
  } catch (err) {
    next(err);
  }
});

// ─── Boards (global capability OR space admin) ────────────────────────────────
router.post('/:id/boards', async (req, res, next) => {
  try {
    if (!isSpaceAdmin(req.user, req.params.id))
      return res.status(403).json({ error: 'Insufficient permissions.' });
    const parsed = boardCreateSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Invalid input.', details: parsed.error.flatten() });
    const d = parsed.data;
    const space = await query('SELECT * FROM spaces WHERE id=$1 AND archived=FALSE', [
      req.params.id,
    ]);
    if (!space.rows.length) return res.status(404).json({ error: 'Space not found.' });
    const dupe = await query('SELECT 1 FROM boards WHERE key=$1', [d.key]);
    if (dupe.rows.length)
      return res.status(409).json({ error: `Board key ${d.key} is already in use.` });
    const { rows } = await query(
      `INSERT INTO boards (space_id, key, name, description, jira_project_key, sort)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        req.params.id,
        d.key,
        d.name,
        d.description || null,
        cleanJiraKey(d.jiraProjectKey),
        d.sort ?? 0,
      ]
    );
    await writeAudit(req.user.email, 'board.create', d.key, {
      space: space.rows[0].slug,
      name: d.name,
    });
    res.status(201).json(serializeBoard(rows[0], req.user.spaceRoles?.[req.params.id] || null));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/boards/:boardId', async (req, res, next) => {
  try {
    const cur = await query('SELECT * FROM boards WHERE id=$1 AND space_id=$2', [
      req.params.boardId,
      req.params.id,
    ]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Board not found.' });
    if (!isBoardAdmin(req.user, cur.rows[0]))
      return res.status(403).json({ error: 'Insufficient permissions.' });
    const parsed = boardPatchSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Invalid input.', details: parsed.error.flatten() });
    const d = parsed.data;
    const sets = [];
    const params = [];
    for (const [col, val] of [
      ['name', d.name],
      ['description', d.description],
      [
        'jira_project_key',
        d.jiraProjectKey !== undefined ? cleanJiraKey(d.jiraProjectKey) : undefined,
      ],
      ['sort', d.sort],
      ['archived', d.archived],
    ]) {
      if (val !== undefined) {
        params.push(val);
        sets.push(`${col} = $${params.length}`);
      }
    }
    // jiraProjectKey: null is a legitimate value (detach the Jira mirror).
    if (d.jiraProjectKey === null && !sets.some(s => s.startsWith('jira_project_key'))) {
      sets.push('jira_project_key = NULL');
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
    params.push(req.params.boardId);
    const { rows } = await query(
      `UPDATE boards SET ${sets.join(', ')}, updated_at = now() WHERE id=$${params.length} RETURNING *`,
      params
    );
    await writeAudit(req.user.email, 'board.update', rows[0].key, d);
    res.json(serializeBoard(rows[0], req.user.boardRoles?.[rows[0].id] || null));
  } catch (err) {
    next(err);
  }
});

// ─── Space members ────────────────────────────────────────────────────────────
router.get('/:id/members', async (req, res, next) => {
  try {
    // Roster is visible to space members and admins.
    if (!isSpaceAdmin(req.user, req.params.id) && !req.user.spaceRoles?.[req.params.id])
      return res.status(403).json({ error: 'Insufficient permissions.' });
    const { rows } = await query(
      `SELECT sm.user_id, sm.role, u.name, u.email
         FROM space_members sm JOIN users u ON u.id = sm.user_id
        WHERE sm.space_id = $1 ORDER BY u.name ASC`,
      [req.params.id]
    );
    res.json({
      members: rows.map(m => ({ userId: m.user_id, role: m.role, name: m.name, email: m.email })),
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/members/:userId', async (req, res, next) => {
  try {
    if (!isSpaceAdmin(req.user, req.params.id))
      return res.status(403).json({ error: 'Insufficient permissions.' });
    const parsed = z.object({ role: ROLE_ENUM }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid role.' });
    const u = await query('SELECT email FROM users WHERE id=$1 AND active=TRUE', [
      req.params.userId,
    ]);
    if (!u.rows.length) return res.status(404).json({ error: 'User not found.' });
    await query(
      `INSERT INTO space_members (space_id, user_id, role) VALUES ($1,$2,$3)
       ON CONFLICT (space_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [req.params.id, req.params.userId, parsed.data.role]
    );
    await writeAudit(req.user.email, 'space.member_set', req.params.id, {
      member: u.rows[0].email,
      role: parsed.data.role,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/members/:userId', async (req, res, next) => {
  try {
    if (!isSpaceAdmin(req.user, req.params.id))
      return res.status(403).json({ error: 'Insufficient permissions.' });
    const { rows } = await query(
      'DELETE FROM space_members WHERE space_id=$1 AND user_id=$2 RETURNING user_id',
      [req.params.id, req.params.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Membership not found.' });
    await writeAudit(req.user.email, 'space.member_removed', req.params.id, {
      userId: req.params.userId,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── Board members (account-level board grants) ───────────────────────────────
router.get('/:id/boards/:boardId/members', async (req, res, next) => {
  try {
    const board = await query('SELECT * FROM boards WHERE id=$1 AND space_id=$2', [
      req.params.boardId,
      req.params.id,
    ]);
    if (!board.rows.length) return res.status(404).json({ error: 'Board not found.' });
    if (!isBoardAdmin(req.user, board.rows[0]) && !req.user.boardRoles?.[req.params.boardId])
      return res.status(403).json({ error: 'Insufficient permissions.' });
    const { rows } = await query(
      `SELECT bm.user_id, bm.role, u.name, u.email
         FROM board_members bm JOIN users u ON u.id = bm.user_id
        WHERE bm.board_id = $1 ORDER BY u.name ASC`,
      [req.params.boardId]
    );
    res.json({
      members: rows.map(m => ({ userId: m.user_id, role: m.role, name: m.name, email: m.email })),
    });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/boards/:boardId/members/:userId', async (req, res, next) => {
  try {
    const board = await query('SELECT * FROM boards WHERE id=$1 AND space_id=$2', [
      req.params.boardId,
      req.params.id,
    ]);
    if (!board.rows.length) return res.status(404).json({ error: 'Board not found.' });
    if (!isBoardAdmin(req.user, board.rows[0]))
      return res.status(403).json({ error: 'Insufficient permissions.' });
    const parsed = z.object({ role: ROLE_ENUM }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid role.' });
    const u = await query('SELECT email FROM users WHERE id=$1 AND active=TRUE', [
      req.params.userId,
    ]);
    if (!u.rows.length) return res.status(404).json({ error: 'User not found.' });
    await query(
      `INSERT INTO board_members (board_id, user_id, role) VALUES ($1,$2,$3)
       ON CONFLICT (board_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [req.params.boardId, req.params.userId, parsed.data.role]
    );
    await writeAudit(req.user.email, 'board.member_set', board.rows[0].key, {
      member: u.rows[0].email,
      role: parsed.data.role,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/boards/:boardId/members/:userId', async (req, res, next) => {
  try {
    const board = await query('SELECT * FROM boards WHERE id=$1 AND space_id=$2', [
      req.params.boardId,
      req.params.id,
    ]);
    if (!board.rows.length) return res.status(404).json({ error: 'Board not found.' });
    if (!isBoardAdmin(req.user, board.rows[0]))
      return res.status(403).json({ error: 'Insufficient permissions.' });
    const { rows } = await query(
      'DELETE FROM board_members WHERE board_id=$1 AND user_id=$2 RETURNING user_id',
      [req.params.boardId, req.params.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Membership not found.' });
    await writeAudit(req.user.email, 'board.member_removed', board.rows[0].key, {
      userId: req.params.userId,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
