// server/routes/roles.js
// Role management — list, create, edit, delete. Mounted at /api/roles.
// Listing is available to any authenticated user (the client RBAC needs role
// metadata); mutations are capability-gated and system roles are protected.

import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, requireCapability, writeAudit } from '../auth.js';
import { CAPABILITY_IDS } from '../../src/rbac.js';

const router = Router();
router.use(requireAuth);

const serialize = r => ({
  id: r.id,
  name: r.name,
  label: r.label,
  description: r.description,
  color: r.color,
  isSystem: r.is_system,
  isDefault: r.is_default,
  capabilities: r.capabilities || [],
});

const capsSchema = z.array(z.enum(CAPABILITY_IDS)).max(CAPABILITY_IDS.length);

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM roles ORDER BY is_system DESC, name ASC');
    res.json({ roles: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireCapability('roles.create'), async (req, res, next) => {
  try {
    const schema = z
      .object({
        label: z.string().min(1).max(60),
        description: z.string().max(400).default(''),
        color: z.string().max(16).default('#52525B'),
        capabilities: capsSchema.default([]),
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const d = parsed.data;
    // Derive a stable machine id/name from the label.
    const base =
      d.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') || 'role';
    const id = `role_${base}_${Date.now().toString(36)}`;
    const { rows } = await query(
      `INSERT INTO roles (id, name, label, description, color, is_system, is_default, capabilities)
       VALUES ($1,$2,$3,$4,$5,FALSE,FALSE,$6::jsonb) RETURNING *`,
      [id, base, d.label, d.description, d.color, JSON.stringify(d.capabilities)]
    );
    await writeAudit(req.user.email, 'role.create', id);
    res.status(201).json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requireCapability('roles.edit'), async (req, res, next) => {
  try {
    const schema = z
      .object({
        label: z.string().min(1).max(60).optional(),
        description: z.string().max(400).optional(),
        color: z.string().max(16).optional(),
        capabilities: capsSchema.optional(),
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const d = parsed.data;

    const cur = await query('SELECT * FROM roles WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Role not found.' });
    const role = cur.rows[0];
    // Superadmin must never lose capabilities (lockout protection), matching client.
    if (
      role.id === 'role_superadmin' &&
      d.capabilities &&
      d.capabilities.length < CAPABILITY_IDS.length
    )
      return res.status(400).json({ error: 'Superadmin must retain all capabilities.' });

    const sets = [];
    const params = [];
    for (const [col, val] of [
      ['label', d.label],
      ['description', d.description],
      ['color', d.color],
      ['capabilities', d.capabilities ? JSON.stringify(d.capabilities) : undefined],
    ]) {
      if (val !== undefined) {
        params.push(val);
        sets.push(
          col === 'capabilities'
            ? `capabilities = $${params.length}::jsonb`
            : `${col} = $${params.length}`
        );
      }
    }
    if (!sets.length) return res.json(serialize(role));
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE roles SET ${sets.join(', ')} WHERE id=$${params.length} RETURNING *`,
      params
    );
    await writeAudit(req.user.email, 'role.update', req.params.id);
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireCapability('roles.delete'), async (req, res, next) => {
  try {
    const cur = await query('SELECT is_system FROM roles WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Role not found.' });
    if (cur.rows[0].is_system)
      return res.status(400).json({ error: 'System roles cannot be deleted.' });
    const held = await query('SELECT count(*)::int AS n FROM users WHERE role_id=$1', [
      req.params.id,
    ]);
    if (held.rows[0].n > 0)
      return res.status(409).json({ error: 'Role is still assigned to users.' });
    await query('DELETE FROM roles WHERE id=$1', [req.params.id]);
    await writeAudit(req.user.email, 'role.delete', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
