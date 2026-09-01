// server/routes/feedback.js
// Platform feedback from the floating bubble. Any authenticated user may
// submit; reading, triaging and deleting require feedback.view (admin tier).
// Each submission notifies every superadmin through the bell. Mounted at
// /api/feedback when DATABASE_URL is set.

import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, requireCapability, writeAudit } from '../auth.js';

const router = Router();
router.use(requireAuth);

const STATUSES = ['New', 'Reviewed'];

const serialize = r => ({
  id: r.id,
  authorName: r.author_name,
  authorEmail: r.author_email,
  page: r.page,
  pageLabel: r.page_label,
  title: r.title,
  body: r.body,
  status: r.status,
  createdAt: r.created_at,
});

// ─── Submit (any authenticated user) ──────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const schema = z
      .object({
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(5000),
        page: z.string().min(1).max(60),
        pageLabel: z.string().max(80).default(''),
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const d = parsed.data;
    const { rows } = await query(
      `INSERT INTO feedback (author_name, author_email, page, page_label, title, body)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.name, req.user.email, d.page, d.pageLabel, d.title, d.body]
    );
    // Bell fan-out to superadmins (same pattern as ticket milestones).
    const admins = await query(
      `SELECT email FROM users WHERE active = TRUE AND role_id = 'role_superadmin'`
    );
    for (const a of admins.rows) {
      await query(
        `INSERT INTO notifications (user_email, type, title, body)
         VALUES ($1,'feedback',$2,$3)`,
        [
          a.email,
          `New feedback: ${d.title.slice(0, 120)}`,
          `${req.user.name} · from ${d.pageLabel || d.page}`,
        ]
      );
    }
    await writeAudit(req.user.email, 'feedback.create', d.title.slice(0, 80), { page: d.page });
    res.status(201).json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ─── Admin inbox ──────────────────────────────────────────────────────────────
router.get('/', requireCapability('feedback.view'), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM feedback ORDER BY created_at DESC LIMIT 200');
    res.json({ feedback: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireCapability('feedback.view'), async (req, res, next) => {
  try {
    const parsed = z
      .object({ status: z.enum(STATUSES) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const { rows } = await query('UPDATE feedback SET status=$1 WHERE id=$2 RETURNING *', [
      parsed.data.status,
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Feedback not found.' });
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireCapability('feedback.view'), async (req, res, next) => {
  try {
    const cur = await query('SELECT title FROM feedback WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Feedback not found.' });
    await query('DELETE FROM feedback WHERE id=$1', [req.params.id]);
    await writeAudit(req.user.email, 'feedback.delete', cur.rows[0].title.slice(0, 80));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
