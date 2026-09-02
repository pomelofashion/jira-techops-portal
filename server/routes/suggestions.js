// server/routes/suggestions.js
// Server persistence for the Suggestions board (and the feedback bubble,
// which posts here). Any authenticated user can read the board, post, vote
// and comment; status changes need staff; deletes need author-or-staff.
// Votes/comments are JSONB documents in the exact client-store shape so the
// optimistic client stays byte-compatible. Mounted at /api/suggestions.

import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, writeAudit } from '../auth.js';

const router = Router();
router.use(requireAuth);

const STATUSES = ['Open', 'Under review', 'Planned', 'In progress', 'Done', 'Declined'];
const CATEGORIES = ['Feature', 'Documentation', 'Change request', 'Bug', 'Other'];
const ID_RE = /^[a-z]{2}_[a-z0-9]+_[a-z0-9]+$/;

// Mirrors the client's isStaff derivation on SuggestionsPage.
const isStaff = user =>
  ['admin.kanban_view', 'tickets.view_all', 'docs.manage'].some(c =>
    (user.role?.capabilities || []).includes(c)
  );

const serialize = r => ({
  id: r.id,
  title: r.title,
  body: r.body,
  category: r.category,
  status: r.status,
  page: r.page,
  pageLabel: r.page_label,
  authorName: r.author_name,
  authorEmail: r.author_email,
  authorRoleLabel: r.author_role_label,
  authorRoleColor: r.author_role_color,
  authorIsStaff: r.author_is_staff,
  votes: r.votes || {},
  comments: r.comments || [],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const getOne = async id => (await query('SELECT * FROM suggestions WHERE id=$1', [id])).rows[0];

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM suggestions ORDER BY created_at DESC LIMIT 500');
    res.json({ suggestions: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const schema = z
      .object({
        id: z.string().regex(ID_RE).max(40),
        title: z.string().min(1).max(200),
        body: z.string().max(10000).default(''),
        category: z.enum(CATEGORIES).default('Other'),
        page: z.string().max(60).default(''),
        pageLabel: z.string().max(80).default(''),
        authorRoleLabel: z.string().max(60).default('User'),
        authorRoleColor: z.string().max(20).default('#52525B'),
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const d = parsed.data;
    // Author identity is the session's, never the payload's. Author
    // auto-upvotes their own post (client parity).
    const { rows } = await query(
      `INSERT INTO suggestions
         (id, title, body, category, page, page_label,
          author_name, author_email, author_role_label, author_role_color, author_is_staff, votes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
       ON CONFLICT (id) DO NOTHING RETURNING *`,
      [
        d.id,
        d.title,
        d.body,
        d.category,
        d.page,
        d.pageLabel,
        req.user.name,
        req.user.email,
        d.authorRoleLabel,
        d.authorRoleColor,
        isStaff(req.user),
        JSON.stringify({ [req.user.email]: 1 }),
      ]
    );
    if (!rows.length) return res.status(409).json({ error: 'Suggestion already exists.' });
    const admins = await query(
      `SELECT email FROM users WHERE active = TRUE AND role_id = 'role_superadmin'`
    );
    for (const a of admins.rows) {
      await query(
        `INSERT INTO notifications (user_email, type, title, body)
         VALUES ($1,'suggestion',$2,$3)`,
        [
          a.email,
          `New suggestion: ${d.title.slice(0, 120)}`,
          `${req.user.name} · ${d.category}${d.pageLabel ? ` · from ${d.pageLabel}` : ''}`,
        ]
      );
    }
    await writeAudit(req.user.email, 'suggestion.create', d.title.slice(0, 80), { page: d.page });
    res.status(201).json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

// Vote toggle — same semantics as the client store: same direction clears,
// otherwise the vote is set. Voter identity comes from the session.
router.post('/:id/vote', async (req, res, next) => {
  try {
    const parsed = z
      .object({ dir: z.union([z.literal(1), z.literal(-1)]) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const s = await getOne(req.params.id);
    if (!s) return res.status(404).json({ error: 'Suggestion not found.' });
    const votes = { ...(s.votes || {}) };
    if (votes[req.user.email] === parsed.data.dir) delete votes[req.user.email];
    else votes[req.user.email] = parsed.data.dir;
    const { rows } = await query('UPDATE suggestions SET votes=$1::jsonb WHERE id=$2 RETURNING *', [
      JSON.stringify(votes),
      req.params.id,
    ]);
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    if (!isStaff(req.user)) return res.status(403).json({ error: 'Staff only.' });
    const parsed = z
      .object({ status: z.enum(STATUSES) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const { rows } = await query(
      'UPDATE suggestions SET status=$1, updated_at=now() WHERE id=$2 RETURNING *',
      [parsed.data.status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Suggestion not found.' });
    await writeAudit(req.user.email, 'suggestion.status', rows[0].title.slice(0, 80), {
      status: parsed.data.status,
    });
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const s = await getOne(req.params.id);
    if (!s) return res.status(404).json({ error: 'Suggestion not found.' });
    if (s.author_email !== req.user.email && !isStaff(req.user))
      return res.status(403).json({ error: 'Only the author or staff can delete this.' });
    await query('DELETE FROM suggestions WHERE id=$1', [req.params.id]);
    await writeAudit(req.user.email, 'suggestion.delete', s.title.slice(0, 80));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/comments', async (req, res, next) => {
  try {
    const schema = z
      .object({
        id: z.string().regex(ID_RE).max(40),
        parentId: z.string().max(40).nullable().default(null),
        body: z.string().max(10000).default(''),
        // Image data-URLs / video links in the client's attachment shape.
        attachments: z.array(z.object({}).passthrough()).max(6).default([]),
        authorRoleLabel: z.string().max(60).default('User'),
        authorRoleColor: z.string().max(20).default('#52525B'),
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const d = parsed.data;
    const s = await getOne(req.params.id);
    if (!s) return res.status(404).json({ error: 'Suggestion not found.' });
    const comment = {
      id: d.id,
      parentId: d.parentId,
      authorName: req.user.name,
      authorEmail: req.user.email,
      authorRoleLabel: d.authorRoleLabel,
      authorRoleColor: d.authorRoleColor,
      isStaff: isStaff(req.user),
      body: d.body,
      attachments: d.attachments,
      createdAt: new Date().toISOString(),
    };
    const comments = [...(s.comments || []).filter(c => c.id !== d.id), comment];
    const { rows } = await query(
      'UPDATE suggestions SET comments=$1::jsonb, updated_at=now() WHERE id=$2 RETURNING *',
      [JSON.stringify(comments), req.params.id]
    );
    res.status(201).json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/comments/:commentId', async (req, res, next) => {
  try {
    const s = await getOne(req.params.id);
    if (!s) return res.status(404).json({ error: 'Suggestion not found.' });
    const target = (s.comments || []).find(c => c.id === req.params.commentId);
    if (!target) return res.status(404).json({ error: 'Comment not found.' });
    if (target.authorEmail !== req.user.email && !isStaff(req.user))
      return res.status(403).json({ error: 'Only the author or staff can delete this.' });
    // Drop the comment and any direct replies (client parity).
    const comments = (s.comments || []).filter(
      c => c.id !== req.params.commentId && c.parentId !== req.params.commentId
    );
    const { rows } = await query(
      'UPDATE suggestions SET comments=$1::jsonb WHERE id=$2 RETURNING *',
      [JSON.stringify(comments), req.params.id]
    );
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

export default router;
