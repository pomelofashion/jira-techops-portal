// server/routes/approvals.js
// Generic approval records. Mounted at /api/approvals.
//   • GET /mine                     — pending approvals addressed to me
//   • GET /subject/:type/:id        — all approvals on a subject (visible ticket)
//   • POST /                        — request an approval (staff)
//   • POST /:id/decide              — approve/reject (named approver, or
//                                     approvals.override for admin unblocking)
// Every decision writes the subject ticket's timeline + audit log and
// notifies the requester (bell + email). Phase 7 hooks change_details.

import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, writeAudit } from '../auth.js';
import { sendApprovalEmail, sendApprovalDecidedEmail } from '../email.js';
import { canSeeBoard } from '../lib/spacesAccess.js';

const router = Router();
router.use(requireAuth);

const can = (user, cap) =>
  Array.isArray(user.role?.capabilities) && user.role.capabilities.includes(cap);

const serialize = a => ({
  id: a.id,
  subjectType: a.subject_type,
  subjectId: a.subject_id,
  ticketKey: a.ticket_key || null,
  ticketTitle: a.ticket_title || null,
  approverEmail: a.approver_email,
  requestedBy: a.requested_by,
  status: a.status,
  comment: a.comment,
  decidedAt: a.decided_at,
  createdAt: a.created_at,
});

// Create an approval + notify the approver. Shared with tickets.js (catalog
// requires_approval hook) — exported for reuse.
export async function createApproval({ subjectType, subjectId, approverEmail, requestedBy }) {
  const { rows } = await query(
    `INSERT INTO approvals (subject_type, subject_id, approver_email, requested_by)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (subject_type, subject_id, approver_email) DO NOTHING
     RETURNING *`,
    [subjectType, subjectId, approverEmail.toLowerCase(), requestedBy]
  );
  if (!rows.length) return null; // duplicate request — already pending/decided
  const t = await query('SELECT key, title FROM tickets WHERE id=$1', [subjectId]);
  const ticket = t.rows[0];
  await query(
    `INSERT INTO notifications (user_email, type, title, body, ticket_id)
     VALUES ($1,'approval_request',$2,$3,$4)`,
    [
      approverEmail.toLowerCase(),
      `Approval needed on ${ticket.key}`,
      `${requestedBy} requested your approval — ${ticket.title}`,
      subjectId,
    ]
  );
  sendApprovalEmail(approverEmail, ticket.key, ticket.title, requestedBy).catch(err =>
    console.error(
      JSON.stringify({ level: 'error', msg: 'approval email failed', error: err.message })
    )
  );
  await query('INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)', [
    subjectId,
    `Approval requested from ${approverEmail}`,
    requestedBy,
  ]);
  return rows[0];
}

router.get('/mine', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.*, t.key AS ticket_key, t.title AS ticket_title
       FROM approvals a JOIN tickets t ON t.id = a.subject_id
       WHERE a.approver_email = $1 AND a.status = 'pending'
       ORDER BY a.created_at ASC`,
      [req.user.email]
    );
    res.json({ approvals: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
});

router.get('/subject/:type/:id', async (req, res, next) => {
  try {
    // Visibility: global staff, the subject ticket's requester/assignee,
    // members of its board, or an approver on the thread. This route used to
    // leak ticket titles to any authenticated user who knew a uuid.
    const t = await query(
      'SELECT board_id, requester_email, assignee_email FROM tickets WHERE id=$1',
      [req.params.id]
    );
    if (!t.rows.length) return res.json({ approvals: [] });
    const { rows } = await query(
      `SELECT a.*, t.key AS ticket_key, t.title AS ticket_title
       FROM approvals a JOIN tickets t ON t.id = a.subject_id
       WHERE a.subject_type = $1 AND a.subject_id = $2
       ORDER BY a.created_at ASC`,
      [req.params.type, req.params.id]
    );
    const tk = t.rows[0];
    const visible =
      can(req.user, 'tickets.view_all') ||
      tk.requester_email === req.user.email ||
      tk.assignee_email === req.user.email ||
      canSeeBoard(req.user, tk.board_id) ||
      rows.some(a => a.approver_email === req.user.email);
    if (!visible) return res.status(403).json({ error: 'Insufficient permissions.' });
    res.json({ approvals: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (!can(req.user, 'tickets.view_all'))
      return res.status(403).json({ error: 'Insufficient permissions to request approvals.' });
    const schema = z
      .object({
        subjectType: z.enum(['ticket', 'change']).default('ticket'),
        subjectId: z.string().uuid(),
        approverEmail: z.string().email(),
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const t = await query('SELECT id FROM tickets WHERE id=$1', [parsed.data.subjectId]);
    if (!t.rows.length) return res.status(404).json({ error: 'Subject ticket not found.' });
    const created = await createApproval({
      subjectType: parsed.data.subjectType,
      subjectId: parsed.data.subjectId,
      approverEmail: parsed.data.approverEmail,
      requestedBy: req.user.email,
    });
    if (!created)
      return res.status(409).json({ error: 'An approval for that approver already exists.' });
    await writeAudit(req.user.email, 'approval.request', created.id);
    res.status(201).json(serialize(created));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/decide', async (req, res, next) => {
  try {
    const schema = z
      .object({
        decision: z.enum(['approved', 'rejected']),
        comment: z.string().max(2000).default(''),
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });

    const cur = await query(
      `SELECT a.*, t.key AS ticket_key, t.title AS ticket_title, t.requester_email
       FROM approvals a JOIN tickets t ON t.id = a.subject_id WHERE a.id=$1`,
      [req.params.id]
    );
    if (!cur.rows.length) return res.status(404).json({ error: 'Approval not found.' });
    const a = cur.rows[0];
    if (a.status !== 'pending') return res.status(409).json({ error: `Already ${a.status}.` });
    const isApprover = a.approver_email === req.user.email;
    if (!isApprover && !can(req.user, 'approvals.override'))
      return res.status(403).json({ error: 'Only the named approver can decide this.' });

    const { decision, comment } = parsed.data;
    const { rows } = await query(
      `UPDATE approvals SET status=$1, comment=$2, decided_at=now() WHERE id=$3 RETURNING *`,
      [decision, comment || null, req.params.id]
    );

    await query('INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)', [
      a.subject_id,
      `Approval ${decision}${comment ? ` — “${comment}”` : ''}`,
      req.user.email,
    ]);
    if (a.requester_email) {
      await query(
        `INSERT INTO notifications (user_email, type, title, body, ticket_id)
         VALUES ($1,'approval_decided',$2,$3,$4)`,
        [
          a.requester_email,
          `${a.ticket_key} ${decision}`,
          `${req.user.name} ${decision} your request.${comment ? ` “${comment}”` : ''}`,
          a.subject_id,
        ]
      );
      sendApprovalDecidedEmail(
        a.requester_email,
        a.ticket_key,
        a.ticket_title,
        decision,
        comment
      ).catch(err =>
        console.error(
          JSON.stringify({
            level: 'error',
            msg: 'approval decided email failed',
            error: err.message,
          })
        )
      );
    }
    // Phase 7: change approvals flip the change record's approval_state when
    // every pending approval on the subject is resolved.
    if (a.subject_type === 'change') {
      const pending = await query(
        `SELECT count(*)::int AS n FROM approvals
         WHERE subject_type='change' AND subject_id=$1 AND status='pending'`,
        [a.subject_id]
      );
      const anyRejected = await query(
        `SELECT count(*)::int AS n FROM approvals
         WHERE subject_type='change' AND subject_id=$1 AND status='rejected'`,
        [a.subject_id]
      );
      if (anyRejected.rows[0].n > 0) {
        await query(`UPDATE change_details SET approval_state='rejected' WHERE ticket_id=$1`, [
          a.subject_id,
        ]).catch(() => {});
      } else if (pending.rows[0].n === 0) {
        await query(`UPDATE change_details SET approval_state='approved' WHERE ticket_id=$1`, [
          a.subject_id,
        ]).catch(() => {});
      }
    }
    await writeAudit(req.user.email, `approval.${decision}`, a.id);
    res.json(serialize({ ...rows[0], ticket_key: a.ticket_key, ticket_title: a.ticket_title }));
  } catch (err) {
    next(err);
  }
});

export default router;
