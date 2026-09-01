// server/routes/changes.js
// Change management. Mounted at /api/changes.
//   • CRUD gated on changes.manage; viewing rides tickets.view_all.
//   • submit-for-approval creates approvals rows (subject_type='change') for
//     chosen approvers who must hold changes.approve. Standard changes are
//     pre-approved; emergency changes may proceed with retroactive approval.
//   • The approvals decide route flips change_details.approval_state.
//   • Status can't advance past To Do while approval is pending/rejected.
//   • complete records the outcome (successful | rolled-back | failed).

import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireCapability, writeAudit } from '../auth.js';
import { generateKey, defaultBoardId } from './tickets.js';
import { createApproval } from './approvals.js';

const router = Router();
router.use(requireAuth);
router.use(requireCapability('tickets.view_all'));

const CHANGE_TYPES = ['standard', 'normal', 'emergency'];
const RISKS = ['low', 'medium', 'high'];
const CHANGE_STATUSES = ['To Do', 'In Progress', 'Live'];
const OUTCOMES = ['successful', 'rolled-back', 'failed'];

const serialize = (r, extra = {}) => ({
  id: r.id,
  key: r.key,
  title: r.title,
  description: r.description,
  priority: r.priority,
  status: r.status,
  requester: { name: r.requester_name, email: r.requester_email },
  assignee: r.assignee_name,
  assigneeEmail: r.assignee_email,
  changeType: r.change_type || 'normal',
  risk: r.risk || 'medium',
  rolloutPlan: r.rollout_plan ?? null,
  rollbackPlan: r.rollback_plan ?? null,
  testPlan: r.test_plan ?? null,
  windowStart: r.window_start ?? null,
  windowEnd: r.window_end ?? null,
  approvalState: r.approval_state || 'draft',
  outcome: r.outcome ?? null,
  created: r.created_at,
  updated: r.updated_at,
  ...extra,
});

const CHANGE_JOIN = `
  SELECT t.*, cd.change_type, cd.risk, cd.rollout_plan, cd.rollback_plan, cd.test_plan,
         cd.window_start, cd.window_end, cd.approval_state, cd.outcome
  FROM tickets t JOIN change_details cd ON cd.ticket_id = t.id`;

router.get('/', async (req, res, next) => {
  try {
    const where = [`t.record_type = 'change'`];
    const params = [];
    if (req.query.approvalState) {
      params.push(req.query.approvalState);
      where.push(`cd.approval_state = $${params.length}`);
    }
    if (req.query.type && CHANGE_TYPES.includes(req.query.type)) {
      params.push(req.query.type);
      where.push(`cd.change_type = $${params.length}`);
    }
    const { rows } = await query(
      `${CHANGE_JOIN} WHERE ${where.join(' AND ')} ORDER BY cd.window_start NULLS LAST, t.created_at DESC LIMIT 200`,
      params
    );
    res.json({ changes: rows.map(r => serialize(r)) });
  } catch (err) {
    next(err);
  }
});

// Calendar window: changes whose window intersects [from, to].
router.get('/calendar', async (req, res, next) => {
  try {
    const from = req.query.from ? new Date(req.query.from) : new Date();
    const to = req.query.to
      ? new Date(req.query.to)
      : new Date(from.getTime() + 35 * 24 * 3600 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()))
      return res.status(400).json({ error: 'Invalid from/to dates.' });
    const { rows } = await query(
      `${CHANGE_JOIN}
       WHERE t.record_type = 'change'
         AND cd.window_start IS NOT NULL
         AND cd.window_start <= $2
         AND COALESCE(cd.window_end, cd.window_start) >= $1
       ORDER BY cd.window_start ASC`,
      [from, to]
    );
    res.json({ changes: rows.map(r => serialize(r)) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(`${CHANGE_JOIN} WHERE t.id = $1 AND t.record_type = 'change'`, [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Change not found.' });
    const approvals = await query(
      `SELECT a.*, t.key AS ticket_key, t.title AS ticket_title
       FROM approvals a JOIN tickets t ON t.id = a.subject_id
       WHERE a.subject_type='change' AND a.subject_id=$1 ORDER BY a.created_at ASC`,
      [req.params.id]
    );
    const timeline = await query(
      'SELECT * FROM ticket_timeline WHERE ticket_id=$1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(
      serialize(rows[0], {
        approvals: approvals.rows.map(a => ({
          id: a.id,
          approverEmail: a.approver_email,
          status: a.status,
          comment: a.comment,
          decidedAt: a.decided_at,
        })),
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

const baseSchema = z
  .object({
    title: z.string().min(1).max(300),
    description: z.string().max(20000).default(''),
    priority: z.enum(['Critical', 'High', 'Medium', 'Low']).default('Medium'),
    changeType: z.enum(CHANGE_TYPES).default('normal'),
    risk: z.enum(RISKS).default('medium'),
    rolloutPlan: z.string().max(8000).nullable().optional(),
    rollbackPlan: z.string().max(8000).nullable().optional(),
    testPlan: z.string().max(8000).nullable().optional(),
    windowStart: z.string().datetime({ offset: true }).nullable().optional(),
    windowEnd: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

function windowValid(d) {
  if (d.windowStart && d.windowEnd && new Date(d.windowEnd) < new Date(d.windowStart))
    return 'Window end must be after window start.';
  return null;
}

router.post('/', requireCapability('changes.manage'), async (req, res, next) => {
  try {
    const parsed = baseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const d = parsed.data;
    const windowProblem = windowValid(d);
    if (windowProblem) return res.status(400).json({ error: windowProblem });
    const key = await generateKey('CHG');
    const boardId = await defaultBoardId(); // change board routing is future work
    const change = await withTransaction(async client => {
      const { rows } = await client.query(
        `INSERT INTO tickets (key, title, description, priority, status,
           requester_name, requester_email, record_type, issue_type, jira_sync_state, board_id)
         VALUES ($1,$2,$3,$4,'To Do',$5,$6,'change','Task','local-only',$7) RETURNING *`,
        [key, d.title, d.description, d.priority, req.user.name, req.user.email, boardId]
      );
      const c = rows[0];
      // Standard changes are pre-authorized by definition.
      const approvalState = d.changeType === 'standard' ? 'approved' : 'draft';
      await client.query(
        `INSERT INTO change_details
           (ticket_id, change_type, risk, rollout_plan, rollback_plan, test_plan, window_start, window_end, approval_state)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          c.id,
          d.changeType,
          d.risk,
          d.rolloutPlan || null,
          d.rollbackPlan || null,
          d.testPlan || null,
          d.windowStart || null,
          d.windowEnd || null,
          approvalState,
        ]
      );
      await client.query(
        'INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)',
        [c.id, `Change request created (${d.changeType}, risk ${d.risk})`, req.user.email]
      );
      return c;
    });
    await writeAudit(req.user.email, 'change.create', key);
    const { rows } = await query(`${CHANGE_JOIN} WHERE t.id = $1`, [change.id]);
    res.status(201).json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireCapability('changes.manage'), async (req, res, next) => {
  try {
    const schema = baseSchema
      .partial()
      .extend({ status: z.enum(CHANGE_STATUSES).optional() })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const d = parsed.data;
    const cur = await query(`${CHANGE_JOIN} WHERE t.id = $1 AND t.record_type = 'change'`, [
      req.params.id,
    ]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Change not found.' });
    const c = cur.rows[0];
    const windowProblem = windowValid({ ...serialize(c), ...d });
    if (windowProblem) return res.status(400).json({ error: windowProblem });

    // Approval gate: no work starts while approval is pending or rejected
    // (emergency changes are exempt — retroactive approval).
    if (
      d.status &&
      d.status !== 'To Do' &&
      c.change_type !== 'emergency' &&
      ['pending', 'rejected'].includes(c.approval_state)
    ) {
      return res
        .status(409)
        .json({ error: `Change is ${c.approval_state} — approval required before work starts.` });
    }

    await withTransaction(async client => {
      const tsets = [];
      const tparams = [];
      for (const [col, val] of [
        ['title', d.title],
        ['description', d.description],
        ['priority', d.priority],
        ['status', d.status],
      ]) {
        if (val !== undefined) {
          tparams.push(val);
          tsets.push(`${col} = $${tparams.length}`);
        }
      }
      if (tsets.length) {
        tsets.push('updated_at = now()');
        tparams.push(req.params.id);
        await client.query(
          `UPDATE tickets SET ${tsets.join(', ')} WHERE id=$${tparams.length}`,
          tparams
        );
      }
      const csets = [];
      const cparams = [];
      for (const [col, val] of [
        ['change_type', d.changeType],
        ['risk', d.risk],
        ['rollout_plan', d.rolloutPlan],
        ['rollback_plan', d.rollbackPlan],
        ['test_plan', d.testPlan],
        ['window_start', d.windowStart],
        ['window_end', d.windowEnd],
      ]) {
        if (val !== undefined) {
          cparams.push(val);
          csets.push(`${col} = $${cparams.length}`);
        }
      }
      if (csets.length) {
        cparams.push(req.params.id);
        await client.query(
          `UPDATE change_details SET ${csets.join(', ')} WHERE ticket_id=$${cparams.length}`,
          cparams
        );
      }
      if (d.status && d.status !== c.status) {
        await client.query(
          'INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)',
          [req.params.id, `Status → ${d.status}`, req.user.email]
        );
      }
    });
    await writeAudit(req.user.email, 'change.update', c.key);
    const { rows } = await query(`${CHANGE_JOIN} WHERE t.id = $1`, [req.params.id]);
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/submit-for-approval',
  requireCapability('changes.manage'),
  async (req, res, next) => {
    try {
      const schema = z
        .object({ approverEmails: z.array(z.string().email()).min(1).max(10) })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
      const cur = await query(`${CHANGE_JOIN} WHERE t.id = $1 AND t.record_type = 'change'`, [
        req.params.id,
      ]);
      if (!cur.rows.length) return res.status(404).json({ error: 'Change not found.' });
      const c = cur.rows[0];
      if (c.change_type === 'standard')
        return res.status(400).json({ error: 'Standard changes are pre-approved.' });
      if (c.approval_state === 'pending')
        return res.status(409).json({ error: 'Approval is already pending.' });
      if (c.approval_state === 'approved')
        return res.status(409).json({ error: 'Change is already approved.' });

      // Approvers must hold changes.approve.
      for (const email of parsed.data.approverEmails) {
        const ok = await query(
          `SELECT 1 FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.email = $1 AND u.active AND r.capabilities @> '["changes.approve"]'::jsonb`,
          [email.toLowerCase()]
        );
        if (!ok.rows.length)
          return res.status(400).json({ error: `${email} cannot approve changes.` });
      }
      for (const email of parsed.data.approverEmails) {
        await createApproval({
          subjectType: 'change',
          subjectId: req.params.id,
          approverEmail: email,
          requestedBy: req.user.email,
        });
      }
      await query(`UPDATE change_details SET approval_state='pending' WHERE ticket_id=$1`, [
        req.params.id,
      ]);
      await writeAudit(req.user.email, 'change.submit_approval', c.key);
      const { rows } = await query(`${CHANGE_JOIN} WHERE t.id = $1`, [req.params.id]);
      res.json(serialize(rows[0]));
    } catch (err) {
      next(err);
    }
  }
);

router.post('/:id/complete', requireCapability('changes.manage'), async (req, res, next) => {
  try {
    const schema = z.object({ outcome: z.enum(OUTCOMES) }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const cur = await query(`${CHANGE_JOIN} WHERE t.id = $1 AND t.record_type = 'change'`, [
      req.params.id,
    ]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Change not found.' });
    const c = cur.rows[0];
    if (c.outcome) return res.status(409).json({ error: `Already completed (${c.outcome}).` });
    await withTransaction(async client => {
      await client.query(`UPDATE change_details SET outcome=$1 WHERE ticket_id=$2`, [
        parsed.data.outcome,
        req.params.id,
      ]);
      await client.query(
        `UPDATE tickets SET status='Live', resolved_at=COALESCE(resolved_at, now()), updated_at=now() WHERE id=$1`,
        [req.params.id]
      );
      await client.query(
        'INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)',
        [req.params.id, `Change completed: ${parsed.data.outcome}`, req.user.email]
      );
    });
    await writeAudit(req.user.email, 'change.complete', c.key, { outcome: parsed.data.outcome });
    const { rows } = await query(`${CHANGE_JOIN} WHERE t.id = $1`, [req.params.id]);
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

export default router;
