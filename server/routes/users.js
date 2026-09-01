// server/routes/users.js
// User management — list, create, edit, role assignment, activate/deactivate.
// Mounted at /api/users when DATABASE_URL is set. All routes require auth; each
// mutation re-checks the relevant capability server-side.

import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { requireAuth, requireCapability, writeAudit } from '../auth.js';

const router = Router();
router.use(requireAuth);

const serialize = u => ({
  id: u.id,
  name: u.name,
  email: u.email,
  department: u.department,
  roleId: u.role_id,
  active: u.active,
  emailVerified: u.email_verified,
  createdAt: u.created_at,
  lastLoginAt: u.last_login_at,
});

// List (admin surface).
router.get('/', requireCapability('users.edit'), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM users ORDER BY created_at ASC');
    res.json({ users: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
});

// Create a user directly (admin sets a password; account is active + verified).
// For email-invite onboarding, use POST /api/auth/invite instead.
router.post('/', requireCapability('users.create'), async (req, res, next) => {
  try {
    const schema = z
      .object({
        name: z.string().min(1).max(120),
        email: z.string().email().max(254),
        password: z.string().min(8).max(200),
        roleId: z.string().min(1),
        department: z.string().max(120).optional(),
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const d = parsed.data;
    const email = d.email.trim().toLowerCase();

    const role = await query('SELECT id FROM roles WHERE id=$1', [d.roleId]);
    if (!role.rows.length) return res.status(400).json({ error: 'Unknown role.' });
    const exists = await query('SELECT 1 FROM users WHERE email=$1', [email]);
    if (exists.rows.length)
      return res.status(409).json({ error: 'A user with this email already exists.' });

    const hash = await bcrypt.hash(d.password, 12);
    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, role_id, department, active, email_verified)
         VALUES ($1,$2,$3,$4,$5,TRUE,TRUE) RETURNING *`,
      [d.name, email, hash, d.roleId, d.department || 'IT & Technology']
    );
    await writeAudit(req.user.email, 'user.create', email, { roleId: d.roleId });
    res.status(201).json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

// Edit profile fields, role, and active flag. Role changes need roles.assign;
// deactivation needs users.delete; profile edits need users.edit.
router.patch('/:id', async (req, res, next) => {
  try {
    const schema = z
      .object({
        name: z.string().min(1).max(120).optional(),
        email: z.string().email().max(254).optional(),
        department: z.string().max(120).optional(),
        roleId: z.string().min(1).optional(),
        active: z.boolean().optional(),
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    const d = parsed.data;

    const cur = await query('SELECT * FROM users WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'User not found.' });

    const u = req.user;
    const has = c => u.role.capabilities.includes(c);
    if ((d.name || d.email || d.department) && !has('users.edit'))
      return res.status(403).json({ error: 'Insufficient permissions to edit users.' });
    if (d.roleId && !has('roles.assign'))
      return res.status(403).json({ error: 'Insufficient permissions to assign roles.' });
    if (d.active === false && !has('users.delete'))
      return res.status(403).json({ error: 'Insufficient permissions to deactivate users.' });
    if (d.active === true && !has('users.edit'))
      return res.status(403).json({ error: 'Insufficient permissions.' });

    if (d.roleId) {
      const role = await query('SELECT 1 FROM roles WHERE id=$1', [d.roleId]);
      if (!role.rows.length) return res.status(400).json({ error: 'Unknown role.' });
    }

    const sets = [];
    const params = [];
    for (const [col, val] of [
      ['name', d.name],
      ['email', d.email ? d.email.trim().toLowerCase() : undefined],
      ['department', d.department],
      ['role_id', d.roleId],
      ['active', d.active],
    ]) {
      if (val !== undefined) {
        params.push(val);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (!sets.length) return res.json(serialize(cur.rows[0]));
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE users SET ${sets.join(', ')} WHERE id=$${params.length} RETURNING *`,
      params
    );
    await writeAudit(req.user.email, 'user.update', rows[0].email, {
      roleId: d.roleId,
      active: d.active,
    });
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

export default router;
