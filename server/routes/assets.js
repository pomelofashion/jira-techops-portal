// server/routes/assets.js
// Asset registry (CMDB-lite). Mounted at /api/assets.
//   • Viewing needs assets.view; mutations need assets.manage.
//   • assign/return maintain asset_assignments history and flip status.
//   • Status transitions are validated (retired is terminal).
//   • CSV export via system.export_data; import accepts a JSON array parsed
//     client-side from CSV (no server CSV dependency).

import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireCapability, writeAudit } from '../auth.js';

const router = Router();
router.use(requireAuth);

const TYPES = ['hardware', 'software', 'license'];
const STATUSES = ['in-stock', 'assigned', 'repair', 'retired'];
// From → allowed next statuses. Assign/return flip in-stock↔assigned via
// their own endpoints; direct status PATCH covers repair/retire flows.
const TRANSITIONS = {
  'in-stock': ['repair', 'retired'],
  assigned: ['repair'],
  repair: ['in-stock', 'retired'],
  retired: [],
};

const serialize = a => ({
  id: a.id,
  tag: a.tag,
  name: a.name,
  type: a.type,
  status: a.status,
  serial: a.serial,
  model: a.model,
  vendor: a.vendor,
  assigneeEmail: a.assignee_email,
  assigneeName: a.assignee_name,
  purchaseDate: a.purchase_date,
  warrantyExpires: a.warranty_expires,
  cost: a.cost === null ? null : Number(a.cost),
  notes: a.notes,
  meta: a.meta || {},
  createdAt: a.created_at,
  updatedAt: a.updated_at,
});

async function generateTag() {
  const { rows } = await query(
    `SELECT tag FROM assets WHERE tag ~ '^AST-\\d+$' ORDER BY length(tag) DESC, tag DESC LIMIT 1`
  );
  const last = rows.length ? parseInt(rows[0].tag.slice(4), 10) : 0;
  return `AST-${String(last + 1).padStart(4, '0')}`;
}

const baseSchema = z
  .object({
    name: z.string().min(1).max(160),
    type: z.enum(TYPES).default('hardware'),
    serial: z.string().max(120).nullable().optional(),
    model: z.string().max(160).nullable().optional(),
    vendor: z.string().max(160).nullable().optional(),
    purchaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    warrantyExpires: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    cost: z.number().min(0).max(99_999_999).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
  })
  .strict();

// ─── List / read ─────────────────────────────────────────────────────────────
router.get('/', requireCapability('assets.view'), async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    if (req.query.status && STATUSES.includes(req.query.status)) {
      params.push(req.query.status);
      where.push(`status = $${params.length}`);
    }
    if (req.query.type && TYPES.includes(req.query.type)) {
      params.push(req.query.type);
      where.push(`type = $${params.length}`);
    }
    if (req.query.assignee) {
      params.push(req.query.assignee.toLowerCase());
      where.push(`assignee_email = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${req.query.search}%`);
      where.push(
        `(name ILIKE $${params.length} OR tag ILIKE $${params.length} OR serial ILIKE $${params.length} OR model ILIKE $${params.length} OR assignee_name ILIKE $${params.length})`
      );
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const { rows } = await query(
      `SELECT * FROM assets ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY created_at DESC LIMIT ${limit}`,
      params
    );
    const counts = await query(`SELECT status, count(*)::int AS n FROM assets GROUP BY status`);
    res.json({
      assets: rows.map(serialize),
      counts: Object.fromEntries(counts.rows.map(r => [r.status, r.n])),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/export.csv', requireCapability('system.export_data'), async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM assets ORDER BY tag ASC');
    const cols = [
      'tag',
      'name',
      'type',
      'status',
      'serial',
      'model',
      'vendor',
      'assignee_email',
      'assignee_name',
      'purchase_date',
      'warranty_expires',
      'cost',
      'notes',
    ];
    const esc = v => {
      if (v === null || v === undefined) return '';
      // pg returns DATE columns as local-midnight Date objects — format in
      // local time; toISOString would shift the calendar day west of UTC.
      const s =
        v instanceof Date
          ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
          : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="assets.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireCapability('assets.view'), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM assets WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Asset not found.' });
    const history = await query(
      'SELECT * FROM asset_assignments WHERE asset_id=$1 ORDER BY assigned_at DESC LIMIT 50',
      [req.params.id]
    );
    const tickets = await query(
      `SELECT t.id, t.key, t.title, t.status FROM asset_tickets at
       JOIN tickets t ON t.id = at.ticket_id WHERE at.asset_id=$1
       ORDER BY at.created_at DESC`,
      [req.params.id]
    );
    res.json({
      asset: serialize(rows[0]),
      history: history.rows.map(h => ({
        id: h.id,
        userEmail: h.user_email,
        userName: h.user_name,
        assignedBy: h.assigned_by,
        assignedAt: h.assigned_at,
        returnedAt: h.returned_at,
      })),
      tickets: tickets.rows.map(t => ({ id: t.id, key: t.key, title: t.title, status: t.status })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── Create / update / delete ────────────────────────────────────────────────
router.post('/', requireCapability('assets.manage'), async (req, res, next) => {
  try {
    const parsed = baseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const d = parsed.data;
    const tag = await generateTag();
    const { rows } = await query(
      `INSERT INTO assets (tag, name, type, serial, model, vendor, purchase_date, warranty_expires, cost, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        tag,
        d.name,
        d.type,
        d.serial || null,
        d.model || null,
        d.vendor || null,
        d.purchaseDate || null,
        d.warrantyExpires || null,
        d.cost ?? null,
        d.notes || null,
      ]
    );
    await writeAudit(req.user.email, 'asset.create', tag);
    res.status(201).json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.post('/import', requireCapability('assets.manage'), async (req, res, next) => {
  try {
    const schema = z.object({ assets: z.array(baseSchema).min(1).max(1000) }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    let created = 0;
    await withTransaction(async client => {
      for (const d of parsed.data.assets) {
        const { rows } = await client.query(
          `SELECT tag FROM assets WHERE tag ~ '^AST-\\d+$' ORDER BY length(tag) DESC, tag DESC LIMIT 1`
        );
        const last = rows.length ? parseInt(rows[0].tag.slice(4), 10) : 0;
        await client.query(
          `INSERT INTO assets (tag, name, type, serial, model, vendor, purchase_date, warranty_expires, cost, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            `AST-${String(last + 1).padStart(4, '0')}`,
            d.name,
            d.type,
            d.serial || null,
            d.model || null,
            d.vendor || null,
            d.purchaseDate || null,
            d.warrantyExpires || null,
            d.cost ?? null,
            d.notes || null,
          ]
        );
        created += 1;
      }
    });
    await writeAudit(req.user.email, 'asset.import', `${created} assets`);
    res.status(201).json({ ok: true, created });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireCapability('assets.manage'), async (req, res, next) => {
  try {
    const schema = baseSchema
      .partial()
      .extend({ status: z.enum(STATUSES).optional() })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const d = parsed.data;
    const cur = await query('SELECT * FROM assets WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Asset not found.' });
    const asset = cur.rows[0];

    if (d.status && d.status !== asset.status) {
      if (!TRANSITIONS[asset.status].includes(d.status))
        return res.status(400).json({
          error: `Cannot move ${asset.status} → ${d.status}. Use assign/return for assignment.`,
        });
    }

    const sets = [];
    const params = [];
    for (const [col, val] of [
      ['name', d.name],
      ['type', d.type],
      ['status', d.status],
      ['serial', d.serial],
      ['model', d.model],
      ['vendor', d.vendor],
      ['purchase_date', d.purchaseDate],
      ['warranty_expires', d.warrantyExpires],
      ['cost', d.cost],
      ['notes', d.notes],
    ]) {
      if (val !== undefined) {
        params.push(val);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (!sets.length) return res.json(serialize(asset));
    sets.push('updated_at = now()');
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE assets SET ${sets.join(', ')} WHERE id=$${params.length} RETURNING *`,
      params
    );
    await writeAudit(req.user.email, 'asset.update', asset.tag, { status: d.status });
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireCapability('assets.manage'), async (req, res, next) => {
  try {
    const cur = await query('SELECT tag, status FROM assets WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Asset not found.' });
    if (cur.rows[0].status === 'assigned')
      return res.status(400).json({ error: 'Return the asset before deleting it.' });
    await query('DELETE FROM assets WHERE id=$1', [req.params.id]);
    await writeAudit(req.user.email, 'asset.delete', cur.rows[0].tag);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── Assign / return ─────────────────────────────────────────────────────────
router.post('/:id/assign', requireCapability('assets.manage'), async (req, res, next) => {
  try {
    const schema = z
      .object({ userEmail: z.string().email(), userName: z.string().max(120).optional() })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const cur = await query('SELECT * FROM assets WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Asset not found.' });
    const asset = cur.rows[0];
    if (asset.status !== 'in-stock')
      return res
        .status(400)
        .json({ error: `Only in-stock assets can be assigned (currently ${asset.status}).` });

    const email = parsed.data.userEmail.toLowerCase();
    const updated = await withTransaction(async client => {
      await client.query(
        `INSERT INTO asset_assignments (asset_id, user_email, user_name, assigned_by)
         VALUES ($1,$2,$3,$4)`,
        [asset.id, email, parsed.data.userName || null, req.user.email]
      );
      const { rows } = await client.query(
        `UPDATE assets SET status='assigned', assignee_email=$1, assignee_name=$2, updated_at=now()
         WHERE id=$3 RETURNING *`,
        [email, parsed.data.userName || null, asset.id]
      );
      return rows[0];
    });
    await writeAudit(req.user.email, 'asset.assign', asset.tag, { to: email });
    res.json(serialize(updated));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/return', requireCapability('assets.manage'), async (req, res, next) => {
  try {
    const cur = await query('SELECT * FROM assets WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Asset not found.' });
    const asset = cur.rows[0];
    if (asset.status !== 'assigned')
      return res.status(400).json({ error: 'Asset is not assigned.' });

    const updated = await withTransaction(async client => {
      await client.query(
        `UPDATE asset_assignments SET returned_at = now()
         WHERE asset_id=$1 AND returned_at IS NULL`,
        [asset.id]
      );
      const { rows } = await client.query(
        `UPDATE assets SET status='in-stock', assignee_email=NULL, assignee_name=NULL, updated_at=now()
         WHERE id=$1 RETURNING *`,
        [asset.id]
      );
      return rows[0];
    });
    await writeAudit(req.user.email, 'asset.return', asset.tag);
    res.json(serialize(updated));
  } catch (err) {
    next(err);
  }
});

// ─── Ticket links ────────────────────────────────────────────────────────────
router.post('/:id/tickets', requireCapability('assets.manage'), async (req, res, next) => {
  try {
    const schema = z.object({ ticketId: z.string().uuid() }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const a = await query('SELECT tag FROM assets WHERE id=$1', [req.params.id]);
    if (!a.rows.length) return res.status(404).json({ error: 'Asset not found.' });
    const t = await query('SELECT key FROM tickets WHERE id=$1', [parsed.data.ticketId]);
    if (!t.rows.length) return res.status(404).json({ error: 'Ticket not found.' });
    await query(
      `INSERT INTO asset_tickets (asset_id, ticket_id, created_by) VALUES ($1,$2,$3)
       ON CONFLICT DO NOTHING`,
      [req.params.id, parsed.data.ticketId, req.user.email]
    );
    await query('INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)', [
      parsed.data.ticketId,
      `Asset ${a.rows[0].tag} linked`,
      req.user.email,
    ]);
    await writeAudit(req.user.email, 'asset.link_ticket', a.rows[0].tag, { ticket: t.rows[0].key });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete(
  '/:id/tickets/:ticketId',
  requireCapability('assets.manage'),
  async (req, res, next) => {
    try {
      const { rowCount } = await query(
        'DELETE FROM asset_tickets WHERE asset_id=$1 AND ticket_id=$2',
        [req.params.id, req.params.ticketId]
      );
      if (!rowCount) return res.status(404).json({ error: 'Link not found.' });
      await writeAudit(req.user.email, 'asset.unlink_ticket', req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// Assets linked to a ticket (consumed by ticket detail).
router.get('/by-ticket/:ticketId', requireCapability('assets.view'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT a.* FROM asset_tickets at JOIN assets a ON a.id = at.asset_id
       WHERE at.ticket_id = $1 ORDER BY a.tag ASC`,
      [req.params.ticketId]
    );
    res.json({ assets: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
});

export default router;
