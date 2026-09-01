// server/routes/problems.js
// Problem management. Problems are ticket rows (record_type='problem', key
// PRB-YYYY-NNNN) with a 1:1 problem_details extension (root cause, workaround,
// known-error flag, impact). Incident↔problem relations reuse ticket_links
// with the 'caused by' relation. Mounted at /api/problems.
//
// Visibility rides tickets.view_all (staff); mutations need problems.manage.

import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireCapability, writeAudit } from '../auth.js';
import { generateKey, defaultBoardId } from './tickets.js';

const router = Router();
router.use(requireAuth);
router.use(requireCapability('tickets.view_all'));

// Problems use a slim workflow, not the 11-column board.
const PROBLEM_STATUSES = ['To Do', 'In Progress', 'Live'];

const serialize = (r, extra = {}) => ({
  id: r.id,
  key: r.key,
  title: r.title,
  description: r.description,
  category: r.category,
  priority: r.priority,
  status: r.status,
  assignee: r.assignee_name,
  assigneeEmail: r.assignee_email,
  rootCause: r.root_cause ?? null,
  workaround: r.workaround ?? null,
  knownError: Boolean(r.known_error),
  impact: r.impact ?? null,
  created: r.created_at,
  updated: r.updated_at,
  ...extra,
});

router.get('/', async (req, res, next) => {
  try {
    const where = [`t.record_type = 'problem'`];
    const params = [];
    if (req.query.knownError === '1') where.push('pd.known_error = TRUE');
    if (req.query.status && PROBLEM_STATUSES.includes(req.query.status)) {
      params.push(req.query.status);
      where.push(`t.status = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${req.query.search}%`);
      where.push(`(t.title ILIKE $${params.length} OR t.key ILIKE $${params.length})`);
    }
    const { rows } = await query(
      `SELECT t.*, pd.root_cause, pd.workaround, pd.known_error, pd.impact
       FROM tickets t LEFT JOIN problem_details pd ON pd.ticket_id = t.id
       WHERE ${where.join(' AND ')}
       ORDER BY t.created_at DESC LIMIT 200`,
      params
    );
    res.json({ problems: rows.map(r => serialize(r)) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT t.*, pd.root_cause, pd.workaround, pd.known_error, pd.impact
       FROM tickets t LEFT JOIN problem_details pd ON pd.ticket_id = t.id
       WHERE t.id = $1 AND t.record_type = 'problem'`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Problem not found.' });
    // Linked records (both directions; 'caused by' links carry the incidents).
    const links = await query(
      `SELECT l.relation, l.source_id, l.target_id,
              s.key AS source_key, s.title AS source_title, s.status AS source_status,
              tt.key AS target_key, tt.title AS target_title, tt.status AS target_status
       FROM ticket_links l
       JOIN tickets s ON s.id = l.source_id
       JOIN tickets tt ON tt.id = l.target_id
       WHERE l.source_id = $1 OR l.target_id = $1`,
      [req.params.id]
    );
    const linked = links.rows.map(l =>
      l.source_id === req.params.id
        ? {
            direction: 'out',
            relation: l.relation,
            id: l.target_id,
            key: l.target_key,
            title: l.target_title,
            status: l.target_status,
          }
        : {
            direction: 'in',
            relation: l.relation,
            id: l.source_id,
            key: l.source_key,
            title: l.source_title,
            status: l.source_status,
          }
    );
    const timeline = await query(
      'SELECT * FROM ticket_timeline WHERE ticket_id=$1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(
      serialize(rows[0], {
        linked,
        timeline: timeline.rows.map(t => ({
          id: t.id,
          action: t.action,
          actor: t.actor,
          date: t.created_at,
        })),
      })
    );
  } catch (err) {
    next(err);
  }
});

const createSchema = z
  .object({
    title: z.string().min(1).max(300),
    description: z.string().max(20000).default(''),
    category: z.string().max(120).optional(),
    priority: z.enum(['Critical', 'High', 'Medium', 'Low']).default('Medium'),
    impact: z.string().max(4000).optional(),
  })
  .strict();

router.post('/', requireCapability('problems.manage'), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const d = parsed.data;
    const key = await generateKey('PRB');
    const boardId = await defaultBoardId(); // problem board routing is future work
    const problem = await withTransaction(async client => {
      const { rows } = await client.query(
        `INSERT INTO tickets (key, title, description, category, priority, status,
           requester_name, requester_email, record_type, issue_type, jira_sync_state, board_id)
         VALUES ($1,$2,$3,$4,$5,'To Do',$6,$7,'problem','Task','local-only',$8) RETURNING *`,
        [
          key,
          d.title,
          d.description,
          d.category || null,
          d.priority,
          req.user.name,
          req.user.email,
          boardId,
        ]
      );
      const p = rows[0];
      await client.query('INSERT INTO problem_details (ticket_id, impact) VALUES ($1,$2)', [
        p.id,
        d.impact || null,
      ]);
      await client.query(
        'INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)',
        [p.id, 'Problem record created', req.user.email]
      );
      return p;
    });
    await writeAudit(req.user.email, 'problem.create', key);
    res.status(201).json(serialize({ ...problem, known_error: false }));
  } catch (err) {
    next(err);
  }
});

// Promote a ticket/incident into a problem record: copies title/category,
// links incident --caused by--> problem, timelines both sides.
router.post(
  '/from-ticket/:ticketId',
  requireCapability('problems.manage'),
  async (req, res, next) => {
    try {
      const src = await query(`SELECT * FROM tickets WHERE id=$1 AND record_type='ticket'`, [
        req.params.ticketId,
      ]);
      if (!src.rows.length) return res.status(404).json({ error: 'Source ticket not found.' });
      const s = src.rows[0];
      const key = await generateKey('PRB');
      const problem = await withTransaction(async client => {
        const { rows } = await client.query(
          `INSERT INTO tickets (key, title, description, category, priority, status,
           requester_name, requester_email, record_type, issue_type, jira_sync_state, board_id)
         VALUES ($1,$2,$3,$4,$5,'To Do',$6,$7,'problem','Task','local-only',$8) RETURNING *`,
          [
            key,
            `Root cause: ${s.title}`.slice(0, 300),
            `Problem record opened from ${s.key}.\n\n${s.description || ''}`.slice(0, 20000),
            s.category,
            s.priority,
            req.user.name,
            req.user.email,
            s.board_id, // inherit the source ticket's board
          ]
        );
        const p = rows[0];
        await client.query('INSERT INTO problem_details (ticket_id) VALUES ($1)', [p.id]);
        await client.query(
          `INSERT INTO ticket_links (source_id, target_id, relation, created_by)
         VALUES ($1,$2,'caused by',$3) ON CONFLICT DO NOTHING`,
          [s.id, p.id, req.user.email]
        );
        await client.query(
          'INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)',
          [p.id, `Created from ${s.key}`, req.user.email]
        );
        await client.query(
          'INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)',
          [s.id, `Problem record ${key} opened for this ticket`, req.user.email]
        );
        return p;
      });
      await writeAudit(req.user.email, 'problem.from_ticket', key, { source: s.key });
      res.status(201).json(serialize({ ...problem, known_error: false }));
    } catch (err) {
      next(err);
    }
  }
);

router.patch('/:id', requireCapability('problems.manage'), async (req, res, next) => {
  try {
    const schema = z
      .object({
        title: z.string().min(1).max(300).optional(),
        description: z.string().max(20000).optional(),
        priority: z.enum(['Critical', 'High', 'Medium', 'Low']).optional(),
        status: z.enum(PROBLEM_STATUSES).optional(),
        rootCause: z.string().max(8000).nullable().optional(),
        workaround: z.string().max(8000).nullable().optional(),
        knownError: z.boolean().optional(),
        impact: z.string().max(4000).nullable().optional(),
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const d = parsed.data;
    const cur = await query(`SELECT * FROM tickets WHERE id=$1 AND record_type='problem'`, [
      req.params.id,
    ]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Problem not found.' });

    await withTransaction(async client => {
      const sets = [];
      const params = [];
      for (const [col, val] of [
        ['title', d.title],
        ['description', d.description],
        ['priority', d.priority],
        ['status', d.status],
      ]) {
        if (val !== undefined) {
          params.push(val);
          sets.push(`${col} = $${params.length}`);
        }
      }
      if (sets.length) {
        sets.push('updated_at = now()');
        params.push(req.params.id);
        await client.query(
          `UPDATE tickets SET ${sets.join(', ')} WHERE id=$${params.length}`,
          params
        );
      }
      const dsets = [];
      const dparams = [];
      for (const [col, val] of [
        ['root_cause', d.rootCause],
        ['workaround', d.workaround],
        ['known_error', d.knownError],
        ['impact', d.impact],
      ]) {
        if (val !== undefined) {
          dparams.push(val);
          dsets.push(`${col} = $${dparams.length}`);
        }
      }
      if (dsets.length) {
        await client.query(
          'INSERT INTO problem_details (ticket_id) VALUES ($1) ON CONFLICT (ticket_id) DO NOTHING',
          [req.params.id]
        );
        dparams.push(req.params.id);
        await client.query(
          `UPDATE problem_details SET ${dsets.join(', ')} WHERE ticket_id=$${dparams.length}`,
          dparams
        );
      }
      if (d.status && d.status !== cur.rows[0].status) {
        await client.query(
          'INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)',
          [req.params.id, `Status → ${d.status}`, req.user.email]
        );
      }
      if (d.knownError === true && !cur.rows[0].known_error) {
        await client.query(
          'INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)',
          [req.params.id, 'Marked as known error', req.user.email]
        );
      }
    });
    await writeAudit(req.user.email, 'problem.update', cur.rows[0].key);
    const { rows } = await query(
      `SELECT t.*, pd.root_cause, pd.workaround, pd.known_error, pd.impact
       FROM tickets t LEFT JOIN problem_details pd ON pd.ticket_id = t.id WHERE t.id=$1`,
      [req.params.id]
    );
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

export default router;
