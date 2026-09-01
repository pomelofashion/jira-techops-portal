// server/auth.js
// Server-side authentication + authorization primitives.
//
// Identity is a signed JWT stored in an httpOnly cookie (never readable by JS).
// Authorization re-uses the SAME capability check as the client (hasPermission
// from src/rbac.js) but is enforced here on the server — the client is never
// trusted for access decisions.

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query } from './db.js';
import { hasPermission } from '../src/rbac.js';

export const COOKIE_NAME = 'techops_session';
const isProduction = process.env.NODE_ENV === 'production';
// Secure cookies need explicit control: NODE_ENV alone is wrong when TLS is
// terminated at a proxy (or absent in an internal deploy). COOKIE_SECURE
// overrides; otherwise production defaults to secure.
const cookieSecure = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === 'true'
  : isProduction;
const SECRET = process.env.JWT_SECRET || '';
const TOKEN_TTL = '7d';

if (process.env.DATABASE_URL && !SECRET) {
  // Fail loud: a DB-backed deployment without a signing secret is unsafe.
  console.error('[BFF] ✖  JWT_SECRET must be set when DATABASE_URL is configured.');
  process.exit(1);
}

export function signSession(userId) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: TOKEN_TTL });
}

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

// Load a user joined with their role (capabilities included). Returns null if
// the user is missing or deactivated.
export async function loadUserWithRole(userId) {
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role_id, u.department, u.active, u.email_verified,
            r.id AS role_id, r.name AS role_name, r.label AS role_label,
            r.color AS role_color, r.capabilities AS role_capabilities
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1`,
    [userId]
  );
  const u = rows[0];
  if (!u || !u.active) return null;

  // Space + board grants (migration 014). Space membership covers every
  // unarchived board in the space; board_members grants a single board to an
  // account — the board-level role wins over the space-level role for that
  // board. Tables may not exist on a not-yet-migrated DB, so fail soft.
  const spaceRoles = {}; // spaceId → 'admin' | 'member' | 'viewer'
  const boardRoles = {}; // boardId → effective role
  try {
    const [sm, bm] = await Promise.all([
      query(
        `SELECT sm.space_id, sm.role, b.id AS board_id
           FROM space_members sm
           LEFT JOIN boards b ON b.space_id = sm.space_id AND b.archived = FALSE
          WHERE sm.user_id = $1`,
        [userId]
      ),
      query(
        `SELECT bm.board_id, bm.role
           FROM board_members bm
           JOIN boards b ON b.id = bm.board_id AND b.archived = FALSE
          WHERE bm.user_id = $1`,
        [userId]
      ),
    ]);
    for (const r of sm.rows) {
      spaceRoles[r.space_id] = r.role;
      if (r.board_id) boardRoles[r.board_id] = r.role;
    }
    for (const r of bm.rows) boardRoles[r.board_id] = r.role; // board grant wins
  } catch {
    /* pre-014 database — no membership tables yet */
  }

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    department: u.department,
    emailVerified: u.email_verified,
    roleId: u.role_id,
    role: {
      id: u.role_id,
      name: u.role_name,
      label: u.role_label,
      color: u.role_color,
      capabilities: u.role_capabilities, // JSONB array
    },
    spaceRoles,
    boardRoles,
    boardIds: Object.keys(boardRoles),
  };
}

// Express middleware: require a valid session. Attaches req.user.
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Not authenticated.' });
    const payload = jwt.verify(token, SECRET);
    const user = await loadUserWithRole(payload.sub);
    if (!user) return res.status(401).json({ error: 'Session no longer valid.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
}

// Express middleware factory: require a capability. Uses the shared predicate so
// server and client agree on what a role can do.
export function requireCapability(capabilityId) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' });
    const ok = hasPermission({ roleId: req.user.roleId }, capabilityId, [req.user.role]);
    if (!ok) return res.status(403).json({ error: 'Insufficient permissions.' });
    next();
  };
}

// ─── Token helpers (email verification / invite / reset) ──────────────────────
export function makeToken() {
  return crypto.randomBytes(32).toString('hex');
}
export function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Append-only audit write. Never throws into the request path.
export async function writeAudit(actor, action, target, meta = {}) {
  try {
    await query('INSERT INTO audit_log (actor, action, target, meta) VALUES ($1,$2,$3,$4::jsonb)', [
      actor,
      action,
      target,
      JSON.stringify(meta),
    ]);
  } catch (err) {
    console.error(
      JSON.stringify({ level: 'error', msg: 'audit write failed', error: err.message })
    );
  }
}

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    department: user.department,
    roleId: user.roleId,
    role: user.role,
    emailVerified: user.emailVerified,
  };
}
