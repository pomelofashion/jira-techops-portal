// server/routes/requestTypes.js
// Service catalog request types — structured request forms that feed ticket
// creation. Mounted at /api/request-types. Any authenticated user can list
// active types (the catalog is the submit experience); full CRUD requires
// the catalog.manage capability.

import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, requireCapability, writeAudit } from '../auth.js';

const router = Router();
router.use(requireAuth);

const FIELD_TYPES = ['text', 'textarea', 'select', 'date', 'checkbox'];

const fieldSchema = z
  .object({
    id: z.string().min(1).max(60),
    label: z.string().min(1).max(120),
    type: z.enum(FIELD_TYPES),
    options: z.array(z.string().max(120)).max(50).default([]),
    required: z.boolean().default(false),
    placeholder: z.string().max(200).optional(),
  })
  .strict();

const defaultsSchema = z
  .object({
    priority: z.enum(['Critical', 'High', 'Medium', 'Low']).optional(),
    issueType: z.string().max(40).optional(),
    labels: z.array(z.string().max(60)).max(20).optional(),
    assigneeEmail: z.string().email().optional(),
    category: z.string().max(80).optional(),
    // Type-level board routing (e.g. Hardware request → the IT Support board).
    // Validated against live boards at ticket-create time.
    boardId: z.string().uuid().optional(),
  })
  .strict();

const baseSchema = z
  .object({
    name: z.string().min(1).max(80),
    description: z.string().max(400).default(''),
    icon: z.string().max(40).default('ClipboardList'),
    category: z.string().min(1).max(60).default('General'),
    fields: z.array(fieldSchema).max(30).default([]),
    defaults: defaultsSchema.default({}),
    requiresApproval: z.boolean().default(false),
    approverEmail: z.string().email().nullable().optional(),
    active: z.boolean().default(true),
    sort: z.number().int().min(0).max(10000).default(0),
  })
  .strict();

const serialize = r => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  description: r.description,
  icon: r.icon,
  category: r.category,
  fields: r.fields || [],
  defaults: r.defaults || {},
  requiresApproval: r.requires_approval,
  approverEmail: r.approver_email,
  active: r.active,
  sort: r.sort,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// Duplicate field ids would make form_values ambiguous.
function fieldIdsValid(fields) {
  const ids = fields.map(f => f.id);
  return new Set(ids).size === ids.length;
}

router.get('/', async (req, res, next) => {
  try {
    const includeInactive = req.query.all === '1';
    const { rows } = await query(
      includeInactive
        ? 'SELECT * FROM request_types ORDER BY category ASC, sort ASC, name ASC'
        : 'SELECT * FROM request_types WHERE active = TRUE ORDER BY category ASC, sort ASC, name ASC'
    );
    res.json({ requestTypes: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireCapability('catalog.manage'), async (req, res, next) => {
  try {
    const parsed = baseSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Invalid input.', details: parsed.error.flatten() });
    const d = parsed.data;
    if (!fieldIdsValid(d.fields))
      return res.status(400).json({ error: 'Field ids must be unique.' });
    if (d.requiresApproval && !d.approverEmail)
      return res.status(400).json({ error: 'Approval-gated types need an approver email.' });

    const base =
      d.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'request';
    const slug = `${base}-${Date.now().toString(36)}`;
    const { rows } = await query(
      `INSERT INTO request_types
        (slug, name, description, icon, category, fields, defaults, requires_approval, approver_email, active, sort)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11) RETURNING *`,
      [
        slug,
        d.name,
        d.description,
        d.icon,
        d.category,
        JSON.stringify(d.fields),
        JSON.stringify(d.defaults),
        d.requiresApproval,
        d.approverEmail || null,
        d.active,
        d.sort,
      ]
    );
    await writeAudit(req.user.email, 'catalog.create', slug);
    res.status(201).json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireCapability('catalog.manage'), async (req, res, next) => {
  try {
    const parsed = baseSchema.partial().safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Invalid input.', details: parsed.error.flatten() });
    const d = parsed.data;
    if (d.fields && !fieldIdsValid(d.fields))
      return res.status(400).json({ error: 'Field ids must be unique.' });

    const cur = await query('SELECT * FROM request_types WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Request type not found.' });

    const sets = [];
    const params = [];
    for (const [col, val, isJson] of [
      ['name', d.name],
      ['description', d.description],
      ['icon', d.icon],
      ['category', d.category],
      ['fields', d.fields ? JSON.stringify(d.fields) : undefined, true],
      ['defaults', d.defaults ? JSON.stringify(d.defaults) : undefined, true],
      ['requires_approval', d.requiresApproval],
      ['approver_email', d.approverEmail],
      ['active', d.active],
      ['sort', d.sort],
    ]) {
      if (val !== undefined) {
        params.push(val);
        sets.push(`${col} = $${params.length}${isJson ? '::jsonb' : ''}`);
      }
    }
    if (!sets.length) return res.json(serialize(cur.rows[0]));
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE request_types SET ${sets.join(', ')}, updated_at = now() WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (rows[0].requires_approval && !rows[0].approver_email)
      return res.status(400).json({ error: 'Approval-gated types need an approver email.' });
    await writeAudit(req.user.email, 'catalog.update', rows[0].slug);
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireCapability('catalog.manage'), async (req, res, next) => {
  try {
    const cur = await query('SELECT slug FROM request_types WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Request type not found.' });
    const used = await query('SELECT count(*)::int AS n FROM tickets WHERE request_type_id=$1', [
      req.params.id,
    ]);
    if (used.rows[0].n > 0) {
      // Keep history intact: deactivate instead of deleting.
      await query('UPDATE request_types SET active = FALSE, updated_at = now() WHERE id=$1', [
        req.params.id,
      ]);
      await writeAudit(req.user.email, 'catalog.deactivate', cur.rows[0].slug);
      return res.json({ ok: true, deactivated: true });
    }
    await query('DELETE FROM request_types WHERE id=$1', [req.params.id]);
    await writeAudit(req.user.email, 'catalog.delete', cur.rows[0].slug);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
