// server/routes/csat.js
// Native CSAT collection. Mounted at /api/csat.
//   • GET /mine            — the signed-in requester's pending surveys
//   • POST /respond        — rate 1–5 (+comment); session-auth (requester) or
//                            token-auth (email link), single-use
//   • GET /ticket/:id      — a ticket's response (staff)
//   • GET /summary         — average + histogram (staff)

import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, hashToken } from '../auth.js';

const router = Router();

const can = (user, cap) =>
  Array.isArray(user?.role?.capabilities) && user.role.capabilities.includes(cap);

const serialize = r => ({
  id: r.id,
  ticketId: r.ticket_id,
  ticketKey: r.ticket_key || null,
  ticketTitle: r.ticket_title || null,
  rating: r.rating,
  comment: r.comment,
  respondedAt: r.responded_at,
  createdAt: r.created_at,
});

// Token-authenticated respond must work without a session (email deep link),
// so /respond does its own auth resolution instead of requireAuth.
router.post('/respond', async (req, res, next) => {
  try {
    const schema = z
      .object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(2000).default(''),
        token: z.string().min(10).max(200).optional(),
        ticketId: z.string().uuid().optional(),
      })
      .strict()
      .refine(d => d.token || d.ticketId, { message: 'token or ticketId required' });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const d = parsed.data;

    let row = null;
    if (d.token) {
      const { rows } = await query('SELECT * FROM csat_responses WHERE token_hash=$1', [
        hashToken(d.token),
      ]);
      row = rows[0];
    } else {
      // Session path: must be the requester of the ticket.
      await new Promise((resolve, reject) =>
        requireAuth(req, res, err => (err ? reject(err) : resolve()))
      );
      const { rows } = await query(
        'SELECT * FROM csat_responses WHERE ticket_id=$1 AND requester_email=$2',
        [d.ticketId, req.user.email]
      );
      row = rows[0];
    }
    if (!row) return res.status(404).json({ error: 'Survey not found.' });
    if (row.responded_at) return res.status(409).json({ error: 'Already submitted — thank you!' });
    if (new Date(row.expires_at) < new Date())
      return res.status(410).json({ error: 'This survey link has expired.' });

    const { rows } = await query(
      `UPDATE csat_responses SET rating=$1, comment=$2, responded_at=now() WHERE id=$3 RETURNING *`,
      [d.rating, d.comment || null, row.id]
    );
    await query('INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)', [
      row.ticket_id,
      `CSAT received: ${d.rating}/5${d.comment ? ` — “${d.comment.slice(0, 120)}”` : ''}`,
      row.requester_email,
    ]);
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.get('/mine', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT c.*, t.key AS ticket_key, t.title AS ticket_title
       FROM csat_responses c JOIN tickets t ON t.id = c.ticket_id
       WHERE c.requester_email = $1 AND c.responded_at IS NULL AND c.expires_at > now()
       ORDER BY c.created_at DESC`,
      [req.user.email]
    );
    res.json({ surveys: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
});

router.get('/ticket/:id', requireAuth, async (req, res, next) => {
  try {
    if (!can(req.user, 'tickets.view_all'))
      return res.status(403).json({ error: 'Insufficient permissions.' });
    const { rows } = await query(
      `SELECT c.*, t.key AS ticket_key, t.title AS ticket_title
       FROM csat_responses c JOIN tickets t ON t.id = c.ticket_id WHERE c.ticket_id=$1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No survey for this ticket.' });
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.get('/summary', requireAuth, async (req, res, next) => {
  try {
    if (!can(req.user, 'tickets.view_all') && !can(req.user, 'reports.view'))
      return res.status(403).json({ error: 'Insufficient permissions.' });
    const { rows } = await query(
      `SELECT count(*) FILTER (WHERE responded_at IS NOT NULL)::int AS responses,
              count(*)::int AS sent,
              round(avg(rating) FILTER (WHERE rating IS NOT NULL), 2)::float AS average
       FROM csat_responses`
    );
    const hist = await query(
      `SELECT rating, count(*)::int AS n FROM csat_responses
       WHERE rating IS NOT NULL GROUP BY rating ORDER BY rating`
    );
    res.json({
      ...rows[0],
      histogram: Object.fromEntries(hist.rows.map(h => [h.rating, h.n])),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
