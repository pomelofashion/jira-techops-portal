// server/routes/tickets.js
// Ticket CRUD + comments + transitions + assignment, Postgres-backed.
// Mounted at /api/tickets, only when DATABASE_URL is set.
//
// Authorization model (enforced server-side; the client is never trusted):
//   • Any authenticated user may submit a ticket (customers are the point).
//   • Listing/reading:
//       - tickets.view_all      → every ticket
//       - board membership      → every ticket on boards you belong to
//                                 (space_members / board_members, migration 014)
//       - tickets.view_assigned → plus tickets assigned to you
//       - otherwise             → plus tickets you requested
//   • Status change: tickets.status_change_any, OR tickets.status_change_own
//     when you are the assignee.
//   • Assign: tickets.assign (assign/claim), tickets.reassign_any to move a
//     ticket off someone else.
//   • Conversation (public messages): requester + assignee + superadmins only
//     (canSeeConversation). Internal notes: tickets.internal_notes (admin tier).
//   • Delete: tickets.delete.

import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth, writeAudit, makeToken, hashToken } from '../auth.js';
import {
  sendCsatEmail,
  sendTicketCreatedEmail,
  sendStatusChangeEmail,
  sendReplyEmail,
  sendMentionEmail,
} from '../email.js';
import {
  computeDueDates,
  recomputeDueDates,
  resumeFromPause,
  SLA_PAUSED_STATUSES,
  SLA_DONE_STATUSES,
} from '../lib/sla.js';
import { createApproval } from './approvals.js';
import { canSeeBoard, canSubmitToBoard, memberBoardIds } from '../lib/spacesAccess.js';

const router = Router();
router.use(requireAuth);

const can = (user, cap) =>
  Array.isArray(user.role?.capabilities) && user.role.capabilities.includes(cap);

// Superadmin is a role-tier check, not a capability — conversation privacy
// shouldn't be acquirable by toggling capabilities on a custom role.
const isSuperadmin = user => user.roleId === 'role_superadmin';

// The ticket CONVERSATION is narrower than ticket visibility: only the
// requester, the current assignee, and superadmins may read or post messages.
// Board members still see the ticket's fields — never its thread.
const canSeeConversation = (user, t) =>
  isSuperadmin(user) || t.requester_email === user.email || t.assignee_email === user.email;

// Policy lookup for SLA due-date stamping. Missing row → no deadlines (SLA
// simply not tracked for that priority) rather than an error.
async function slaPolicyFor(priority) {
  const { rows } = await query('SELECT * FROM sla_policies WHERE priority=$1', [priority]);
  return rows[0] || null;
}

// ─── Serializers (snake_case row → client camelCase shape) ────────────────────
const serializeTicket = (r, extra = {}) => ({
  id: r.id,
  key: r.key,
  title: r.title,
  description: r.description,
  category: r.category,
  priority: r.priority,
  status: r.status,
  requester: { name: r.requester_name, email: r.requester_email },
  assignee: r.assignee_name,
  assigneeEmail: r.assignee_email,
  department: r.department,
  shop: r.shop,
  platforms: r.platforms || [],
  labels: r.labels || [],
  dueDate: r.due_date,
  problemCategory: r.problem_category,
  issueType: r.issue_type || 'Task',
  rank: r.rank,
  watchers: r.watchers || [],
  parentId: r.parent_id,
  currentResult: r.current_result,
  expectedResult: r.expected_result,
  boardId: r.board_id || null,
  jiraKey: r.jira_key,
  jiraSyncState: r.jira_sync_state,
  jiraSyncedAt: r.jira_synced_at,
  requestTypeId: r.request_type_id,
  formValues: r.form_values || {},
  severity: r.severity || null,
  majorIncident: Boolean(r.major_incident),
  postmortemDocId: r.postmortem_doc_id || null,
  sla: {
    firstResponseAt: r.first_response_at || null,
    responseDueAt: r.response_due_at || null,
    resolutionDueAt: r.resolution_due_at || null,
    resolvedAt: r.resolved_at || null,
    pausedAt: r.sla_paused_at || null,
    responseBreached: Boolean(r.response_breached),
    resolutionBreached: Boolean(r.resolution_breached),
  },
  created: r.created_at,
  updated: r.updated_at,
  ...extra,
});
const serializeComment = c => ({
  id: c.id,
  author: c.author,
  authorEmail: c.author_email || null,
  body: c.body,
  internal: c.internal,
  mentions: c.mentions || [],
  time: c.created_at,
});
const serializeTimeline = t => ({ id: t.id, action: t.action, actor: t.actor, date: t.created_at });

// Unique-ish human key with a short retry on collision. prefix distinguishes
// record types sharing the tickets table: TKT (tickets), PRB (problems),
// CHG (changes).
export async function generateKey(prefix = 'TKT') {
  const year = new Date().getFullYear();
  for (let i = 0; i < 6; i++) {
    const n = String(Math.floor(1000 + Math.random() * 9000));
    const key = `${prefix}-${year}-${n}`;
    const { rows } = await query('SELECT 1 FROM tickets WHERE key=$1', [key]);
    if (!rows.length) return key;
  }
  return `${prefix}-${year}-${Date.now().toString().slice(-6)}`;
}

// Default board (PESD1) — where records land when no routing applies. Also
// used by problems/changes creation (their board routing is future work).
// Null on a pre-014 database.
export async function defaultBoardId() {
  const { rows } = await query(`SELECT id FROM boards WHERE key='PESD1' LIMIT 1`);
  return rows[0]?.id || null;
}

// ─── List ─────────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const where = [];
    const params = [];

    // Visibility scope. Global staff see everything; everyone else sees the
    // union of: tickets they requested, tickets assigned to them (with
    // tickets.view_assigned), and every ticket on boards they belong to
    // (space membership or per-account board grant — migration 014).
    if (can(req.user, 'tickets.view_all')) {
      // no scope filter
    } else {
      const ors = [];
      params.push(req.user.email);
      ors.push(`requester_email = $${params.length}`);
      if (can(req.user, 'tickets.view_assigned')) {
        params.push(req.user.email);
        ors.push(`assignee_email = $${params.length}`);
      }
      const memberBoards = memberBoardIds(req.user);
      if (memberBoards.length) {
        params.push(memberBoards);
        ors.push(`board_id = ANY($${params.length}::uuid[])`);
      }
      where.push(`(${ors.join(' OR ')})`);
    }

    // Plain tickets only — problems (PRB) and changes (CHG) share the table
    // but have their own routers and views.
    where.push(`record_type = 'ticket'`);

    // Optional board filter (the board view). Reject malformed uuids with a
    // 400 instead of letting Postgres 500 on the cast.
    if (req.query.boardId) {
      const boardId = String(req.query.boardId);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(boardId))
        return res.status(400).json({ error: 'Invalid boardId.' });
      params.push(boardId);
      where.push(`board_id = $${params.length}`);
    }

    // Optional filters.
    if (req.query.status) {
      params.push(req.query.status);
      where.push(`status = $${params.length}`);
    }
    if (req.query.priority) {
      params.push(req.query.priority);
      where.push(`priority = $${params.length}`);
    }
    if (req.query.assignee) {
      params.push(String(req.query.assignee).toLowerCase());
      where.push(`assignee_email = $${params.length}`);
    }
    if (req.query.issueType) {
      params.push(req.query.issueType);
      where.push(`issue_type = $${params.length}`);
    }
    if (req.query.severity) {
      params.push(req.query.severity);
      where.push(`severity = $${params.length}`);
    }
    if (req.query.major === '1') {
      where.push('major_incident = TRUE');
    }
    if (req.query.search) {
      params.push(`%${req.query.search}%`);
      where.push(`(title ILIKE $${params.length} OR key ILIKE $${params.length})`);
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    // Latest public message + the caller's read cursor power unread badges.
    // The count query reuses `clause` but not the join params — the email,
    // limit, and offset params are appended AFTER every filter param and all
    // three are sliced off for the count. Keep that invariant.
    params.push(req.user.email);
    const readParam = params.length;
    params.push(limit, offset);
    const { rows } = await query(
      `SELECT t.*, lm.last_message_at, lm.last_message_author_email, tr.last_read_at
         FROM tickets t
         LEFT JOIN LATERAL (
           SELECT c.created_at AS last_message_at, c.author_email AS last_message_author_email
             FROM ticket_comments c
            WHERE c.ticket_id = t.id AND NOT c.internal
            ORDER BY c.created_at DESC LIMIT 1
         ) lm ON TRUE
         LEFT JOIN ticket_reads tr ON tr.ticket_id = t.id AND tr.user_email = $${readParam}
         ${clause} ORDER BY t.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countRes = await query(
      `SELECT count(*)::int AS total FROM tickets ${clause}`,
      params.slice(0, -3)
    );
    res.json({
      tickets: rows.map(r =>
        serializeTicket(r, {
          lastMessageAt: r.last_message_at || null,
          lastMessageAuthorEmail: r.last_message_author_email || null,
          lastReadAt: r.last_read_at || null,
        })
      ),
      total: countRes.rows[0].total,
    });
  } catch (err) {
    next(err);
  }
});

// Fetch a ticket row and apply read authorization. Returns null if not allowed.
async function loadVisible(req, id) {
  const { rows } = await query('SELECT * FROM tickets WHERE id=$1', [id]);
  const t = rows[0];
  if (!t) return { notFound: true };
  const allowed =
    can(req.user, 'tickets.view_all') ||
    t.assignee_email === req.user.email ||
    t.requester_email === req.user.email ||
    canSeeBoard(req.user, t.board_id);
  if (!allowed) return { forbidden: true };
  return { ticket: t };
}

// ─── Read one (with comments + timeline) ──────────────────────────────────────
// Typed link relations. One row is stored per link; viewed from the target
// side the inverse label applies.
const LINK_RELATIONS = ['blocks', 'clones', 'duplicates', 'relates to', 'caused by'];
const INVERSE_RELATION = {
  blocks: 'is blocked by',
  clones: 'is cloned by',
  duplicates: 'is duplicated by',
  'relates to': 'relates to',
  'caused by': 'causes',
};

const summarizeLinked = r => ({
  id: r.id,
  key: r.key,
  title: r.title,
  status: r.status,
  priority: r.priority,
  assignee: r.assignee_name,
});

async function loadLinks(ticketId) {
  const { rows } = await query(
    `SELECT l.id AS link_id, l.relation, l.source_id, t.*
       FROM ticket_links l
       JOIN tickets t ON t.id = CASE WHEN l.source_id = $1 THEN l.target_id ELSE l.source_id END
      WHERE l.source_id = $1 OR l.target_id = $1
      ORDER BY l.created_at ASC`,
    [ticketId]
  );
  return rows.map(r => ({
    linkId: r.link_id,
    relation: r.source_id === ticketId ? r.relation : INVERSE_RELATION[r.relation] || r.relation,
    ticket: summarizeLinked(r),
  }));
}

router.get('/:id', async (req, res, next) => {
  try {
    const { ticket, notFound, forbidden } = await loadVisible(req, req.params.id);
    if (notFound) return res.status(404).json({ error: 'Ticket not found.' });
    if (forbidden) return res.status(403).json({ error: 'Insufficient permissions.' });
    const comments = await query(
      'SELECT * FROM ticket_comments WHERE ticket_id=$1 ORDER BY created_at ASC',
      [ticket.id]
    );
    const timeline = await query(
      'SELECT * FROM ticket_timeline WHERE ticket_id=$1 ORDER BY created_at ASC',
      [ticket.id]
    );
    const subtasks = await query(
      'SELECT * FROM tickets WHERE parent_id=$1 ORDER BY created_at ASC',
      [ticket.id]
    );
    // Two independent audiences: the conversation (requester + assignee +
    // superadmins) and internal notes (tickets.internal_notes holders).
    const seeConvo = canSeeConversation(req.user, ticket);
    const seeInternal = can(req.user, 'tickets.internal_notes');
    const visibleComments = comments.rows.filter(c => (c.internal ? seeInternal : seeConvo));
    res.json(
      serializeTicket(ticket, {
        conversationHidden: !seeConvo,
        comments: visibleComments.map(serializeComment),
        timeline: timeline.rows.map(serializeTimeline),
        links: await loadLinks(ticket.id),
        subtasks: subtasks.rows.map(summarizeLinked),
      })
    );
  } catch (err) {
    next(err);
  }
});

// ─── Links (staff) ────────────────────────────────────────────────────────────
router.post('/:id/links', async (req, res, next) => {
  try {
    const schema = z
      .object({ targetId: z.string().uuid(), relation: z.enum(LINK_RELATIONS) })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const { targetId, relation } = parsed.data;
    if (targetId === req.params.id)
      return res.status(400).json({ error: 'A ticket cannot link to itself.' });
    // Linking requires read access to BOTH ends — otherwise a member of one
    // board could harvest titles from another board via the link summaries.
    const src = await loadVisible(req, req.params.id);
    if (src.notFound) return res.status(404).json({ error: 'Ticket not found.' });
    if (src.forbidden) return res.status(403).json({ error: 'Insufficient permissions.' });
    const tgt = await loadVisible(req, targetId);
    if (tgt.notFound) return res.status(404).json({ error: 'Ticket not found.' });
    if (tgt.forbidden) return res.status(403).json({ error: 'Insufficient permissions.' });
    const { rows } = await query(
      `INSERT INTO ticket_links (source_id, target_id, relation, created_by)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (source_id, target_id, relation) DO UPDATE SET relation = EXCLUDED.relation
       RETURNING id`,
      [req.params.id, targetId, relation, req.user.email]
    );
    await writeAudit(req.user.email, 'ticket.link', req.params.id, { targetId, relation });
    res.status(201).json({ linkId: rows[0].id, links: await loadLinks(req.params.id) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/links/:linkId', async (req, res, next) => {
  try {
    const vis = await loadVisible(req, req.params.id);
    if (vis.notFound) return res.status(404).json({ error: 'Ticket not found.' });
    if (vis.forbidden) return res.status(403).json({ error: 'Insufficient permissions.' });
    const { rows } = await query(
      'DELETE FROM ticket_links WHERE id=$1 AND (source_id=$2 OR target_id=$2) RETURNING id',
      [req.params.linkId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Link not found.' });
    await writeAudit(req.user.email, 'ticket.unlink', req.params.id, {
      linkId: req.params.linkId,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── Watchers (self-service: any user who can read the ticket) ────────────────
router.put('/:id/watchers/me', async (req, res, next) => {
  try {
    const { ticket, notFound, forbidden } = await loadVisible(req, req.params.id);
    if (notFound) return res.status(404).json({ error: 'Ticket not found.' });
    if (forbidden) return res.status(403).json({ error: 'Insufficient permissions.' });
    const watchers = new Set(ticket.watchers || []);
    watchers.add(req.user.email);
    const { rows } = await query(
      'UPDATE tickets SET watchers=$1::jsonb WHERE id=$2 RETURNING watchers',
      [JSON.stringify([...watchers]), ticket.id]
    );
    res.json({ watchers: rows[0].watchers });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/watchers/me', async (req, res, next) => {
  try {
    const { ticket, notFound, forbidden } = await loadVisible(req, req.params.id);
    if (notFound) return res.status(404).json({ error: 'Ticket not found.' });
    if (forbidden) return res.status(403).json({ error: 'Insufficient permissions.' });
    const watchers = (ticket.watchers || []).filter(w => w !== req.user.email);
    const { rows } = await query(
      'UPDATE tickets SET watchers=$1::jsonb WHERE id=$2 RETURNING watchers',
      [JSON.stringify(watchers), ticket.id]
    );
    res.json({ watchers: rows[0].watchers });
  } catch (err) {
    next(err);
  }
});

// ─── Create (any authenticated user) ──────────────────────────────────────────
const labelsSchema = z.array(z.string().min(1).max(60)).max(20);
const issueTypeSchema = z.enum(['Task', 'Bug', 'Support Request', 'Incident', 'Sub-task']);
const severitySchema = z.enum(['SEV1', 'SEV2', 'SEV3', 'SEV4']);
// ISO date (YYYY-MM-DD); nullable so PATCH can clear it.
const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const createSchema = z
  .object({
    title: z.string().min(1).max(300),
    description: z.string().max(20000).default(''),
    category: z.string().max(120).optional(),
    priority: z.enum(['Critical', 'High', 'Medium', 'Low']).default('Medium'),
    department: z.string().max(120).optional(),
    shop: z.string().max(120).optional(),
    platforms: z.array(z.string().max(60)).max(40).default([]),
    assigneeEmail: z.string().email().optional(),
    assigneeName: z.string().max(120).optional(),
    labels: labelsSchema.default([]),
    dueDate: dueDateSchema.optional(),
    problemCategory: z.string().max(120).optional(),
    issueType: issueTypeSchema.default('Task'),
    parentId: z.string().uuid().optional(),
    currentResult: z.string().max(4000).optional(),
    expectedResult: z.string().max(4000).optional(),
    boardId: z.string().uuid().optional(),
    requestTypeId: z.string().uuid().optional(),
    formValues: z.record(z.union([z.string().max(4000), z.boolean()])).optional(),
  })
  .strict();

// Validate submitted form values against a request type's stored field schema.
// Returns an error string, or null when valid. Unknown keys are rejected so
// form_values always mirrors the fields the type declared.
function validateFormValues(fields, values) {
  const byId = new Map(fields.map(f => [f.id, f]));
  for (const key of Object.keys(values)) {
    if (!byId.has(key)) return `Unknown form field "${key}".`;
  }
  for (const f of fields) {
    const v = values[f.id];
    const empty = v === undefined || v === '' || v === false;
    if (f.required && empty) return `"${f.label}" is required.`;
    if (empty) continue;
    if (f.type === 'checkbox' && typeof v !== 'boolean') return `"${f.label}" must be a boolean.`;
    if (f.type !== 'checkbox' && typeof v !== 'string') return `"${f.label}" must be a string.`;
    if (f.type === 'select' && !f.options.includes(v))
      return `"${f.label}" must be one of the listed options.`;
    if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v))
      return `"${f.label}" must be a date (YYYY-MM-DD).`;
  }
  return null;
}

router.post('/', async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Invalid input.', details: parsed.error.flatten() });
    const d = parsed.data;
    // Setting an assignee at creation is the same privilege as assigning later
    // (the /:id/assign route already enforces it).
    if ((d.assigneeEmail || d.assigneeName) && !can(req.user, 'tickets.assign'))
      return res.status(403).json({ error: 'Insufficient permissions to assign tickets.' });
    if (d.parentId) {
      const parent = await query('SELECT 1 FROM tickets WHERE id=$1', [d.parentId]);
      if (!parent.rows.length) return res.status(400).json({ error: 'Parent ticket not found.' });
    }

    // Service catalog submission: apply the type's defaults, validate answers.
    let requestType = null;
    if (d.requestTypeId) {
      const rt = await query('SELECT * FROM request_types WHERE id=$1 AND active=TRUE', [
        d.requestTypeId,
      ]);
      if (!rt.rows.length) return res.status(400).json({ error: 'Request type not found.' });
      requestType = rt.rows[0];
      const problem = validateFormValues(requestType.fields || [], d.formValues || {});
      if (problem) return res.status(400).json({ error: problem });
      const defs = requestType.defaults || {};
      if (defs.priority && !req.body.priority) d.priority = defs.priority;
      if (defs.issueType) d.issueType = defs.issueType;
      if (defs.category && !d.category) d.category = defs.category;
      if (defs.labels?.length) d.labels = [...new Set([...d.labels, ...defs.labels])];
      // Default assignee routing is a type-level decision, not a requester
      // privilege — bypasses the tickets.assign gate deliberately.
      if (defs.assigneeEmail && !d.assigneeEmail) d.assigneeEmail = defs.assigneeEmail;
    } else if (d.formValues && Object.keys(d.formValues).length) {
      return res.status(400).json({ error: 'formValues requires a requestTypeId.' });
    }

    // Board routing: explicit boardId (requires submit rights on that board)
    // → request-type default (type-level routing may bypass membership, like
    // defs.assigneeEmail above) → the default PESD1 board.
    let boardId = null;
    if (d.boardId) {
      if (!canSubmitToBoard(req.user, d.boardId))
        return res.status(403).json({ error: 'You cannot create tickets on that board.' });
      boardId = d.boardId;
    } else if (requestType?.defaults?.boardId) {
      boardId = requestType.defaults.boardId;
    }
    if (boardId) {
      const b = await query('SELECT id FROM boards WHERE id=$1 AND archived=FALSE', [boardId]);
      if (!b.rows.length) return res.status(400).json({ error: 'Board not found.' });
    } else {
      boardId = await defaultBoardId();
    }

    const ticket = await withTransaction(async client => {
      // Per-board sequential key (KEY-n): the UPDATE takes a row lock on the
      // board, serializing concurrent creates so numbers never collide. It
      // MUST stay inside this transaction with the INSERT below.
      let key;
      if (boardId) {
        const seq = await client.query(
          'UPDATE boards SET next_seq = next_seq + 1 WHERE id=$1 RETURNING key, next_seq',
          [boardId]
        );
        key = `${seq.rows[0].key}-${Number(seq.rows[0].next_seq) - 1}`;
      } else {
        key = await generateKey(); // pre-014 database — legacy random keys
      }
      const { rows } = await client.query(
        `INSERT INTO tickets
           (key, title, description, category, priority, status,
            requester_name, requester_email, assignee_name, assignee_email,
            department, shop, platforms, labels, due_date, problem_category,
            issue_type, parent_id, current_result, expected_result, jira_sync_state,
            request_type_id, form_values, board_id)
         VALUES ($1,$2,$3,$4,$5,'To Do',$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,
                 $14,$15,$16,$17,$18,$19,'local-only',$20,$21::jsonb,$22)
         RETURNING *`,
        [
          key,
          d.title,
          d.description,
          d.category || null,
          d.priority,
          req.user.name,
          req.user.email,
          d.assigneeName || null,
          d.assigneeEmail?.toLowerCase() || null,
          d.department || req.user.department || null,
          d.shop || null,
          JSON.stringify(d.platforms),
          JSON.stringify(d.labels),
          d.dueDate || null,
          d.problemCategory || null,
          d.parentId ? 'Sub-task' : d.issueType,
          d.parentId || null,
          d.currentResult || null,
          d.expectedResult || null,
          requestType?.id || null,
          JSON.stringify(d.formValues || {}),
          boardId,
        ]
      );
      let t = rows[0];
      // Stamp SLA deadlines from the priority's policy (if one exists).
      const policy = await slaPolicyFor(t.priority);
      if (policy) {
        const due = computeDueDates(t.created_at, policy);
        const upd = await client.query(
          'UPDATE tickets SET response_due_at=$1, resolution_due_at=$2 WHERE id=$3 RETURNING *',
          [due.responseDueAt, due.resolutionDueAt, t.id]
        );
        t = upd.rows[0];
      }
      await client.query(
        'INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)',
        [
          t.id,
          requestType ? `Ticket created via ${requestType.name}` : 'Ticket created',
          req.user.email,
        ]
      );
      return t;
    });
    // Approval-gated catalog types: file the approval after the ticket commits
    // so the approver's notification always references a persisted row.
    if (requestType?.requires_approval && requestType.approver_email) {
      await createApproval({
        subjectType: 'ticket',
        subjectId: ticket.id,
        approverEmail: requestType.approver_email,
        requestedBy: req.user.email,
      });
    }
    await writeAudit(req.user.email, 'ticket.create', ticket.key);
    // Receipt: confirm to the requester that their ticket is in the queue.
    if (ticket.requester_email) {
      sendTicketCreatedEmail(ticket.requester_email, ticket.key, ticket.title).catch(err =>
        console.error(
          JSON.stringify({ level: 'error', msg: 'ticket-created email failed', error: err.message })
        )
      );
    }
    res.status(201).json(serializeTicket(ticket));
  } catch (err) {
    next(err);
  }
});

// ─── Update fields / status ───────────────────────────────────────────────────
const patchSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(20000).optional(),
    category: z.string().max(120).optional(),
    priority: z.enum(['Critical', 'High', 'Medium', 'Low']).optional(),
    status: z.string().max(60).optional(),
    labels: labelsSchema.optional(),
    dueDate: dueDateSchema.optional(),
    problemCategory: z.string().max(120).nullable().optional(),
    issueType: issueTypeSchema.optional(),
    rank: z.number().finite().optional(),
    parentId: z.string().uuid().nullable().optional(),
    currentResult: z.string().max(4000).nullable().optional(),
    expectedResult: z.string().max(4000).nullable().optional(),
    severity: severitySchema.nullable().optional(),
    majorIncident: z.boolean().optional(),
    postmortemDocId: z.string().uuid().nullable().optional(),
    // Admin-only fields (gated below by tickets.edit_all).
    department: z.string().max(120).nullable().optional(),
    shop: z.string().max(120).nullable().optional(),
    platforms: z.array(z.string().max(60)).max(40).optional(),
    requesterName: z.string().max(120).nullable().optional(),
    requesterEmail: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
  })
  .strict();

router.patch('/:id', async (req, res, next) => {
  try {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Invalid input.', details: parsed.error.flatten() });
    const { ticket, notFound, forbidden } = await loadVisible(req, req.params.id);
    if (notFound) return res.status(404).json({ error: 'Ticket not found.' });
    if (forbidden) return res.status(403).json({ error: 'Insufficient permissions.' });

    const d = parsed.data;
    const isAssignee = ticket.assignee_email === req.user.email;

    // Status changes have their own capability gate. Board members (space or
    // account-level grant, non-viewer) may work cards on their own board even
    // without the global status capabilities — mirrors the board UI's canDrag.
    if (d.status && d.status !== ticket.status) {
      const boardRole = req.user.boardRoles?.[ticket.board_id];
      const allowed =
        can(req.user, 'tickets.status_change_any') ||
        (can(req.user, 'tickets.status_change_own') && isAssignee) ||
        boardRole === 'admin' ||
        boardRole === 'member';
      if (!allowed) return res.status(403).json({ error: 'Cannot change status of this ticket.' });
    }
    // Editing content requires staff-level access (view_all) or being the assignee.
    const editsContent =
      d.title ||
      d.description ||
      d.category ||
      d.priority ||
      d.labels !== undefined ||
      d.dueDate !== undefined ||
      d.problemCategory !== undefined ||
      d.issueType !== undefined ||
      d.rank !== undefined ||
      d.parentId !== undefined ||
      d.currentResult !== undefined ||
      d.expectedResult !== undefined;
    if (editsContent && !can(req.user, 'tickets.view_all') && !isAssignee) {
      return res.status(403).json({ error: 'Insufficient permissions to edit this ticket.' });
    }
    // Incident fields have their own gate (severity, major flag, postmortem).
    const editsIncident =
      d.severity !== undefined || d.majorIncident !== undefined || d.postmortemDocId !== undefined;
    if (editsIncident && !can(req.user, 'incidents.manage'))
      return res.status(403).json({ error: 'Insufficient permissions to manage incidents.' });
    // Requester/department/shop/platforms are admin-only edits (tickets.edit_all).
    const editsAdminFields =
      d.department !== undefined ||
      d.shop !== undefined ||
      d.platforms !== undefined ||
      d.requesterName !== undefined ||
      d.requesterEmail !== undefined;
    if (editsAdminFields && !can(req.user, 'tickets.edit_all'))
      return res.status(403).json({ error: 'Only admins can edit these ticket fields.' });
    if (d.parentId) {
      if (d.parentId === ticket.id)
        return res.status(400).json({ error: 'A ticket cannot be its own parent.' });
      const parent = await query('SELECT 1 FROM tickets WHERE id=$1', [d.parentId]);
      if (!parent.rows.length) return res.status(400).json({ error: 'Parent ticket not found.' });
    }

    const sets = [];
    const params = [];
    for (const [col, val] of [
      ['title', d.title],
      ['description', d.description],
      ['category', d.category],
      ['priority', d.priority],
      ['status', d.status],
      ['due_date', d.dueDate],
      ['problem_category', d.problemCategory],
      ['issue_type', d.issueType],
      ['rank', d.rank],
      ['parent_id', d.parentId],
      ['current_result', d.currentResult],
      ['expected_result', d.expectedResult],
      ['severity', d.severity],
      ['major_incident', d.majorIncident],
      ['postmortem_doc_id', d.postmortemDocId],
      ['department', d.department],
      ['shop', d.shop],
      ['requester_name', d.requesterName],
      ['requester_email', d.requesterEmail === '' ? null : d.requesterEmail],
    ]) {
      if (val !== undefined) {
        params.push(val);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (d.labels !== undefined) {
      params.push(JSON.stringify(d.labels));
      sets.push(`labels = $${params.length}::jsonb`);
    }
    if (d.platforms !== undefined) {
      params.push(JSON.stringify(d.platforms));
      sets.push(`platforms = $${params.length}::jsonb`);
    }
    if (!sets.length) return res.json(serializeTicket(ticket));
    sets.push('updated_at = now()');
    params.push(ticket.id);

    const updated = await withTransaction(async client => {
      const { rows } = await client.query(
        `UPDATE tickets SET ${sets.join(', ')} WHERE id=$${params.length} RETURNING *`,
        params
      );
      let t = rows[0];
      if (d.status && d.status !== ticket.status) {
        await client.query(
          'INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)',
          [ticket.id, `Status → ${d.status}`, req.user.email]
        );
      }

      // ── SLA clock transitions ────────────────────────────────────────────
      const slaSets = [];
      const slaParams = [];
      const push = (frag, val) => {
        slaParams.push(val);
        slaSets.push(`${frag} $${slaParams.length}`);
      };
      const statusChanged = d.status && d.status !== ticket.status;
      const wasPaused = SLA_PAUSED_STATUSES.has(ticket.status);
      const nowPaused = statusChanged && SLA_PAUSED_STATUSES.has(d.status);
      const wasDone = SLA_DONE_STATUSES.has(ticket.status);
      const nowDone = statusChanged && SLA_DONE_STATUSES.has(d.status);

      if (statusChanged && wasPaused && !nowPaused && t.sla_paused_at) {
        // Resuming: bank the pause and shift live deadlines forward.
        const resumed = resumeFromPause(t);
        if (resumed) {
          push('sla_paused_ms =', resumed.slaPausedMs);
          push('response_due_at =', resumed.responseDueAt);
          push('resolution_due_at =', resumed.resolutionDueAt);
          slaSets.push('sla_paused_at = NULL');
        }
      } else if (statusChanged && !wasPaused && nowPaused && !t.sla_paused_at) {
        slaSets.push('sla_paused_at = now()');
        await client.query(
          'INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)',
          [ticket.id, 'SLA clock paused (waiting for customer)', req.user.email]
        );
      }
      if (statusChanged && nowDone && !wasDone) {
        slaSets.push('resolved_at = now()');
      } else if (statusChanged && wasDone && !nowDone && t.resolved_at) {
        slaSets.push('resolved_at = NULL');
      }
      // Priority change on an open ticket re-targets both deadlines.
      if (d.priority && d.priority !== ticket.priority && !t.resolved_at) {
        const policy = await slaPolicyFor(d.priority);
        if (policy) {
          const due = recomputeDueDates(t, policy);
          push('response_due_at =', due.responseDueAt);
          push('resolution_due_at =', due.resolutionDueAt);
          // Retarget resets warning dedupe/breach flags — the sweeper re-evaluates.
          slaSets.push("sla_warned = '{}'::jsonb");
          slaSets.push('response_breached = FALSE');
          slaSets.push('resolution_breached = FALSE');
        }
      }
      if (slaSets.length) {
        slaParams.push(t.id);
        const upd = await client.query(
          `UPDATE tickets SET ${slaSets.join(', ')} WHERE id = $${slaParams.length} RETURNING *`,
          slaParams
        );
        t = upd.rows[0];
      }
      return t;
    });
    // Milestone status changes notify + email. Silent for the internal
    // shuffling statuses (QA / code review columns); re-entering a milestone
    // re-notifies by design.
    const MILESTONE_STATUSES = new Set([
      'In Progress',
      'Waiting for Customer',
      'Ready to Release',
      'Live',
      "Closed - Won't Do",
    ]);
    if (
      d.status &&
      d.status !== ticket.status &&
      ticket.record_type === 'ticket' &&
      MILESTONE_STATUSES.has(d.status)
    ) {
      // Bell: the people living with this ticket (requester/assignee/watchers).
      const bellTargets = [
        updated.requester_email,
        updated.assignee_email,
        ...(updated.watchers || []),
      ];
      for (const email of [...new Set(bellTargets)].filter(e => e && e !== req.user.email)) {
        await query(
          `INSERT INTO notifications (user_email, type, title, body, ticket_id)
           VALUES ($1,'status_change',$2,$3,$4)`,
          [email, `${ticket.key} is now ${d.status}`, updated.title, ticket.id]
        );
      }
      // Email: every active superadmin + the requester (dedupe, skip actor).
      const supers = await query(
        `SELECT email FROM users WHERE active = TRUE AND role_id = 'role_superadmin'`
      );
      const emailTargets = new Set(supers.rows.map(r => r.email));
      if (updated.requester_email) emailTargets.add(updated.requester_email);
      emailTargets.delete(req.user.email);
      for (const email of emailTargets) {
        sendStatusChangeEmail(email, ticket.key, updated.title, d.status).catch(err =>
          console.error(
            JSON.stringify({ level: 'error', msg: 'status email failed', error: err.message })
          )
        );
      }
    }

    // Resolution CSAT: first transition into a satisfied-done status invites
    // the requester to rate. "Closed - Won't Do" is excluded — no satisfied
    // resolution happened. One survey per ticket (UNIQUE ticket_id).
    const CSAT_STATUSES = new Set(['Live', 'Resolved', 'Done', 'Closed']);
    if (
      d.status &&
      d.status !== ticket.status &&
      CSAT_STATUSES.has(d.status) &&
      ticket.record_type === 'ticket' &&
      updated.requester_email
    ) {
      const rawToken = makeToken();
      const inserted = await query(
        `INSERT INTO csat_responses (ticket_id, requester_email, token_hash, expires_at)
         VALUES ($1,$2,$3, now() + interval '14 days')
         ON CONFLICT (ticket_id) DO NOTHING RETURNING id`,
        [ticket.id, updated.requester_email, hashToken(rawToken)]
      );
      if (inserted.rows.length) {
        await query(
          `INSERT INTO notifications (user_email, type, title, body, ticket_id)
           VALUES ($1,'csat_prompt',$2,$3,$4)`,
          [
            updated.requester_email,
            `How did we do on ${ticket.key}?`,
            `${updated.title} was resolved — tap to rate the support you received.`,
            ticket.id,
          ]
        );
        sendCsatEmail(updated.requester_email, ticket.key, updated.title, rawToken).catch(err =>
          console.error(
            JSON.stringify({ level: 'error', msg: 'csat email failed', error: err.message })
          )
        );
      }
    }

    // Declaring a major incident broadcasts to global staff plus the members
    // of the ticket's board (space membership and per-account board grants).
    if (d.majorIncident === true && !ticket.major_incident) {
      const staff = await query(
        `SELECT DISTINCT u.email FROM users u JOIN roles r ON r.id = u.role_id
         WHERE u.active AND (
           r.capabilities @> '["tickets.view_all"]'::jsonb
           OR u.id IN (
             SELECT sm.user_id FROM space_members sm
               JOIN boards b ON b.space_id = sm.space_id
              WHERE b.id = $1
             UNION
             SELECT bm.user_id FROM board_members bm WHERE bm.board_id = $1
           )
         )`,
        [ticket.board_id]
      );
      for (const s of staff.rows) {
        await query(
          `INSERT INTO notifications (user_email, type, title, body, ticket_id)
           VALUES ($1,'major_incident',$2,$3,$4)`,
          [
            s.email,
            `MAJOR INCIDENT declared: ${ticket.key}`,
            `${updated.title}${updated.severity ? ` — ${updated.severity}` : ''}. Declared by ${req.user.name}.`,
            ticket.id,
          ]
        );
      }
      await query('INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)', [
        ticket.id,
        'Declared a MAJOR INCIDENT',
        req.user.email,
      ]);
    }
    await writeAudit(req.user.email, 'ticket.update', ticket.key, { status: d.status });
    res.json(serializeTicket(updated));
  } catch (err) {
    next(err);
  }
});

// ─── Incident updates (public comms log, separate from comments) ─────────────
router.get('/:id/incident-updates', async (req, res, next) => {
  try {
    const { ticket, notFound, forbidden } = await loadVisible(req, req.params.id);
    if (notFound) return res.status(404).json({ error: 'Ticket not found.' });
    if (forbidden) return res.status(403).json({ error: 'Insufficient permissions.' });
    const { rows } = await query(
      'SELECT * FROM incident_updates WHERE ticket_id=$1 ORDER BY created_at DESC',
      [ticket.id]
    );
    res.json({
      updates: rows.map(u => ({
        id: u.id,
        author: u.author,
        body: u.body,
        statusAtPost: u.status_at_post,
        createdAt: u.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/incident-updates', async (req, res, next) => {
  try {
    if (!can(req.user, 'incidents.manage'))
      return res.status(403).json({ error: 'Insufficient permissions to post incident updates.' });
    const schema = z.object({ body: z.string().min(1).max(8000) }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const { ticket, notFound, forbidden } = await loadVisible(req, req.params.id);
    if (notFound) return res.status(404).json({ error: 'Ticket not found.' });
    if (forbidden) return res.status(403).json({ error: 'Insufficient permissions.' });
    const { rows } = await query(
      `INSERT INTO incident_updates (ticket_id, author, body, status_at_post)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [ticket.id, req.user.name, parsed.data.body, ticket.status]
    );
    await query('INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)', [
      ticket.id,
      'Incident status update posted',
      req.user.email,
    ]);
    await writeAudit(req.user.email, 'incident.update_posted', ticket.key);
    const u = rows[0];
    res.status(201).json({
      id: u.id,
      author: u.author,
      body: u.body,
      statusAtPost: u.status_at_post,
      createdAt: u.created_at,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Postmortem (creates a doc from a template and links it) ─────────────────
router.post('/:id/postmortem', async (req, res, next) => {
  try {
    if (!can(req.user, 'incidents.manage'))
      return res.status(403).json({ error: 'Insufficient permissions to manage incidents.' });
    const { ticket, notFound, forbidden } = await loadVisible(req, req.params.id);
    if (notFound) return res.status(404).json({ error: 'Ticket not found.' });
    if (forbidden) return res.status(403).json({ error: 'Insufficient permissions.' });
    if (ticket.postmortem_doc_id) {
      return res.status(409).json({ error: 'A postmortem already exists for this incident.' });
    }
    const updates = await query(
      'SELECT * FROM incident_updates WHERE ticket_id=$1 ORDER BY created_at ASC',
      [ticket.id]
    );
    const timelineMd = updates.rows
      .map(
        u =>
          `- **${new Date(u.created_at).toISOString().slice(0, 16).replace('T', ' ')}** (${u.status_at_post || 'n/a'}): ${u.body}`
      )
      .join('\n');
    const content = `# Postmortem — ${ticket.key}: ${ticket.title}

> Status: **Draft** · Severity: **${ticket.severity || 'n/a'}** · Major incident: **${ticket.major_incident ? 'Yes' : 'No'}**

## Summary
_What happened, in two or three sentences._

## Impact
_Who/what was affected, for how long._

## Timeline
${timelineMd || '_Reconstruct the key moments here._'}

## Root cause
_The underlying cause — go past the trigger (5 whys)._

## What went well
-

## What went poorly
-

## Action items
- [ ] _Preventive fix_
- [ ] _Detection improvement_
`;
    const doc = await withTransaction(async client => {
      const { rows } = await client.query(
        `INSERT INTO docs (title, content, category, visibility, tags, icon, description, author)
         VALUES ($1,$2,'Postmortems','Internal','["postmortem","incident"]'::jsonb,'📋',$3,$4)
         RETURNING *`,
        [
          `Postmortem — ${ticket.key}`,
          content,
          `Incident postmortem for ${ticket.key}: ${ticket.title}`,
          req.user.name,
        ]
      );
      const d = rows[0];
      await client.query('UPDATE tickets SET postmortem_doc_id=$1, updated_at=now() WHERE id=$2', [
        d.id,
        ticket.id,
      ]);
      await client.query(
        'INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)',
        [ticket.id, 'Postmortem doc created', req.user.email]
      );
      return d;
    });
    await writeAudit(req.user.email, 'incident.postmortem_created', ticket.key);
    res.status(201).json({ ok: true, docId: doc.id, title: doc.title });
  } catch (err) {
    next(err);
  }
});

// ─── Assign ───────────────────────────────────────────────────────────────────
router.post('/:id/assign', async (req, res, next) => {
  try {
    const schema = z
      .object({
        assigneeEmail: z.string().email().nullable(),
        assigneeName: z.string().max(120).optional(),
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const { ticket, notFound, forbidden } = await loadVisible(req, req.params.id);
    if (notFound) return res.status(404).json({ error: 'Ticket not found.' });
    if (forbidden) return res.status(403).json({ error: 'Insufficient permissions.' });

    const hadAssignee = Boolean(ticket.assignee_email);
    const movingSomeoneElse = hadAssignee && ticket.assignee_email !== req.user.email;
    const allowed = movingSomeoneElse
      ? can(req.user, 'tickets.reassign_any')
      : can(req.user, 'tickets.assign');
    if (!allowed)
      return res.status(403).json({ error: 'Insufficient permissions to assign this ticket.' });

    const email = parsed.data.assigneeEmail?.toLowerCase() || null;
    const { rows } = await query(
      'UPDATE tickets SET assignee_email=$1, assignee_name=$2, updated_at=now() WHERE id=$3 RETURNING *',
      [email, parsed.data.assigneeName || null, ticket.id]
    );
    await query('INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)', [
      ticket.id,
      email ? `Assigned to ${email}` : 'Unassigned',
      req.user.email,
    ]);
    await writeAudit(req.user.email, 'ticket.assign', ticket.key, { assigneeEmail: email });
    res.json(serializeTicket(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ─── Mentions directory + read cursor ─────────────────────────────────────────
// Who a caller may @mention on this ticket. Staff (tickets.view_all) get the
// full active directory; everyone else gets the admin tier plus the current
// assignee — regular users can't harvest the employee list.
async function mentionableSetFor(user, ticket) {
  if (can(user, 'tickets.view_all')) {
    const { rows } = await query(
      'SELECT name, email FROM users WHERE active = TRUE ORDER BY name ASC LIMIT 50'
    );
    return rows;
  }
  const { rows } = await query(
    `SELECT name, email FROM users
      WHERE active = TRUE AND role_id IN ('role_superadmin','role_admin')
      ORDER BY name ASC LIMIT 50`
  );
  const out = new Map(rows.map(u => [u.email, u]));
  if (ticket.assignee_email && !out.has(ticket.assignee_email)) {
    out.set(ticket.assignee_email, {
      name: ticket.assignee_name || ticket.assignee_email,
      email: ticket.assignee_email,
    });
  }
  return Array.from(out.values());
}

router.get('/:id/mentionable', async (req, res, next) => {
  try {
    const { ticket, notFound, forbidden } = await loadVisible(req, req.params.id);
    if (notFound) return res.status(404).json({ error: 'Ticket not found.' });
    if (forbidden) return res.status(403).json({ error: 'Insufficient permissions.' });
    const users = (await mentionableSetFor(req.user, ticket)).filter(
      u => u.email !== req.user.email
    );
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

// Upsert the caller's conversation read cursor (powers unread badges).
router.post('/:id/read', async (req, res, next) => {
  try {
    const { ticket, notFound, forbidden } = await loadVisible(req, req.params.id);
    if (notFound) return res.status(404).json({ error: 'Ticket not found.' });
    if (forbidden) return res.status(403).json({ error: 'Insufficient permissions.' });
    await query(
      `INSERT INTO ticket_reads (ticket_id, user_email) VALUES ($1,$2)
       ON CONFLICT (ticket_id, user_email) DO UPDATE SET last_read_at = now()`,
      [ticket.id, req.user.email]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// One place for who hears about a new public message: mentioned users get a
// 'mention' (bell + email) and join the watchers list; the other side of the
// conversation gets a 'ticket_message' (requester wrote → superadmins +
// assignee; staff wrote → requester). Mention beats reply — nobody is pinged
// twice for one message, and the author never pings themself.
async function notifyCommentRecipients(req, ticket, body, mentions) {
  const excerpt = body.length > 200 ? `${body.slice(0, 197)}…` : body;
  const author = req.user;
  const mentionEmails = new Set(mentions.map(m => m.email));

  let replySide = [];
  if (author.email === ticket.requester_email) {
    const staff = await query(
      `SELECT email FROM users WHERE active = TRUE AND role_id = 'role_superadmin'`
    );
    replySide = staff.rows.map(r => r.email);
    if (ticket.assignee_email) replySide.push(ticket.assignee_email);
  } else if (ticket.requester_email) {
    replySide = [ticket.requester_email];
  }
  const replyEmails = [...new Set(replySide)].filter(
    e => e && e !== author.email && !mentionEmails.has(e)
  );

  for (const m of mentions) {
    await query(
      `INSERT INTO notifications (user_email, type, title, body, ticket_id)
       VALUES ($1,'mention',$2,$3,$4)`,
      [m.email, `${author.name} mentioned you on ${ticket.key}`, excerpt, ticket.id]
    );
    sendMentionEmail(m.email, ticket.key, ticket.title, author.name, excerpt).catch(err =>
      console.error(
        JSON.stringify({ level: 'error', msg: 'mention email failed', error: err.message })
      )
    );
  }
  if (mentions.length) {
    // Mentioned users start watching the ticket (SLA fan-out reaches them).
    const watchers = new Set([...(ticket.watchers || []), ...mentions.map(m => m.email)]);
    await query('UPDATE tickets SET watchers=$1::jsonb WHERE id=$2', [
      JSON.stringify([...watchers]),
      ticket.id,
    ]);
  }
  for (const email of replyEmails) {
    await query(
      `INSERT INTO notifications (user_email, type, title, body, ticket_id)
       VALUES ($1,'ticket_message',$2,$3,$4)`,
      [email, `New message on ${ticket.key}`, excerpt, ticket.id]
    );
    sendReplyEmail(email, ticket.key, ticket.title, author.name, excerpt).catch(err =>
      console.error(
        JSON.stringify({ level: 'error', msg: 'reply email failed', error: err.message })
      )
    );
  }
}

// ─── Comment ──────────────────────────────────────────────────────────────────
router.post('/:id/comments', async (req, res, next) => {
  try {
    const schema = z
      .object({
        body: z.string().min(1).max(20000),
        internal: z.boolean().default(false),
        mentions: z
          .array(z.object({ name: z.string().min(1).max(120), email: z.string().email() }).strict())
          .max(10)
          .default([]),
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    if (!can(req.user, 'tickets.comment'))
      return res.status(403).json({ error: 'Insufficient permissions.' });
    const { ticket, notFound, forbidden } = await loadVisible(req, req.params.id);
    if (notFound) return res.status(404).json({ error: 'Ticket not found.' });
    if (forbidden) return res.status(403).json({ error: 'Insufficient permissions.' });

    // Fail loudly instead of the old silent downgrade: an internal note
    // falling into the public thread would leak, and vice versa.
    if (parsed.data.internal && !can(req.user, 'tickets.internal_notes'))
      return res.status(403).json({ error: 'Internal notes are limited to the admin tier.' });
    if (!parsed.data.internal && !canSeeConversation(req.user, ticket))
      return res.status(403).json({ error: 'This conversation is private.' });
    const internal = parsed.data.internal;

    // Mentions never ride on internal notes (recipients couldn't read them),
    // and only people the caller could have autocompleted count.
    const mentions = [];
    if (!internal && parsed.data.mentions.length) {
      const allowed = new Map(
        (await mentionableSetFor(req.user, ticket)).map(u => [u.email.toLowerCase(), u])
      );
      const seen = new Set();
      for (const m of parsed.data.mentions) {
        const email = m.email.toLowerCase();
        if (email === req.user.email || seen.has(email) || !allowed.has(email)) continue;
        seen.add(email);
        mentions.push({ name: allowed.get(email).name || m.name, email });
      }
    }

    const { rows } = await query(
      `INSERT INTO ticket_comments (ticket_id, author, author_email, body, internal, mentions)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
      [
        ticket.id,
        req.user.name,
        req.user.email,
        parsed.data.body,
        internal,
        JSON.stringify(mentions),
      ]
    );
    await query('UPDATE tickets SET updated_at=now() WHERE id=$1', [ticket.id]);
    // First public non-requester reply stops the response-SLA clock. The
    // conversation is requester/assignee/superadmin only, so any other public
    // author IS the staff response (now works for non-view_all assignees too).
    if (!internal && !ticket.first_response_at && req.user.email !== ticket.requester_email) {
      await query(
        'UPDATE tickets SET first_response_at = now() WHERE id=$1 AND first_response_at IS NULL',
        [ticket.id]
      );
      await query('INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)', [
        ticket.id,
        'First response recorded (SLA)',
        req.user.email,
      ]);
    }
    // Fan-out for public messages (fire-and-forget — the comment is saved).
    if (!internal) {
      notifyCommentRecipients(req, ticket, parsed.data.body, mentions).catch(err =>
        console.error(
          JSON.stringify({ level: 'error', msg: 'comment fan-out failed', error: err.message })
        )
      );
    }
    await writeAudit(req.user.email, 'ticket.comment', ticket.key, { internal });
    res.status(201).json(serializeComment(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ─── Delete ───────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    if (!can(req.user, 'tickets.delete'))
      return res.status(403).json({ error: 'Insufficient permissions.' });
    // The capability alone is not enough — the ticket must also be visible to
    // the caller (board membership / own ticket). Closes a cross-board hole.
    const vis = await loadVisible(req, req.params.id);
    if (vis.notFound) return res.status(404).json({ error: 'Ticket not found.' });
    if (vis.forbidden) return res.status(403).json({ error: 'Insufficient permissions.' });
    const { rows } = await query('DELETE FROM tickets WHERE id=$1 RETURNING key', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Ticket not found.' });
    await writeAudit(req.user.email, 'ticket.delete', rows[0].key);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
