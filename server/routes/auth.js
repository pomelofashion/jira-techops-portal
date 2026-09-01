// server/routes/auth.js
// Authentication routes — email/password with httpOnly cookie sessions.
// Mounted at /api/auth, only when DATABASE_URL is configured.

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { DEFAULT_ROLE_ID } from '../../src/rbac.js';
import { sendVerifyEmail, sendInviteEmail, sendResetEmail } from '../email.js';
import {
  signSession,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireCapability,
  loadUserWithRole,
  makeToken,
  hashToken,
  writeAudit,
  publicUser,
} from '../auth.js';

const router = Router();

// Stricter limiter for credential endpoints than the global /api limiter.
// Dev keeps a high ceiling — every Playwright E2E test performs a fresh
// login, so a 20/15min limit fails the whole suite on the second run.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'production' ? 20 : 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again later.' },
});

const email = z
  .string()
  .email()
  .max(254)
  .transform(s => s.trim().toLowerCase());
const password = z.string().min(8).max(200);
const name = z.string().min(1).max(120);

const validate = schema => (req, res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: 'Invalid input.', details: parsed.error.flatten() });
  req.valid = parsed.data;
  next();
};

const DAY = 24 * 60 * 60 * 1000;

// ─── Self-signup → email verification ─────────────────────────────────────────
router.post(
  '/register',
  authLimiter,
  validate(z.object({ name, email, password }).strict()),
  async (req, res, next) => {
    try {
      const { name: fullName, email: addr, password: pw } = req.valid;
      const existing = await query('SELECT id FROM users WHERE email = $1', [addr]);
      if (existing.rows.length) {
        // Don't reveal which step failed; respond the same as success.
        return res.json({ ok: true });
      }
      const hash = await bcrypt.hash(pw, 12);
      const raw = makeToken();
      await withTransaction(async client => {
        const { rows } = await client.query(
          `INSERT INTO users (name, email, password_hash, role_id, email_verified)
         VALUES ($1,$2,$3,$4,FALSE) RETURNING id`,
          [fullName, addr, hash, DEFAULT_ROLE_ID]
        );
        await client.query(
          `INSERT INTO email_tokens (user_id, email, type, token_hash, expires_at)
         VALUES ($1,$2,'verify',$3,$4)`,
          [rows[0].id, addr, hashToken(raw), new Date(Date.now() + 3 * DAY)]
        );
      });
      await sendVerifyEmail(addr, raw);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/verify',
  authLimiter,
  validate(z.object({ token: z.string().min(10) }).strict()),
  async (req, res, next) => {
    try {
      const th = hashToken(req.valid.token);
      const { rows } = await query(
        `SELECT id, user_id FROM email_tokens
        WHERE token_hash=$1 AND type='verify' AND used_at IS NULL AND expires_at > now()`,
        [th]
      );
      if (!rows.length) return res.status(400).json({ error: 'Invalid or expired link.' });
      await withTransaction(async client => {
        await client.query('UPDATE users SET email_verified=TRUE WHERE id=$1', [rows[0].user_id]);
        await client.query('UPDATE email_tokens SET used_at=now() WHERE id=$1', [rows[0].id]);
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Login / logout / me ──────────────────────────────────────────────────────
router.post(
  '/login',
  authLimiter,
  validate(z.object({ email, password: z.string().min(1) }).strict()),
  async (req, res, next) => {
    try {
      const { email: addr, password: pw } = req.valid;
      const { rows } = await query(
        'SELECT id, password_hash, active, email_verified FROM users WHERE email=$1',
        [addr]
      );
      const u = rows[0];
      const ok = u && u.password_hash && (await bcrypt.compare(pw, u.password_hash));
      if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });
      if (!u.active) return res.status(403).json({ error: 'Account is deactivated.' });
      if (!u.email_verified)
        return res.status(403).json({ error: 'Please verify your email first.' });
      await query('UPDATE users SET last_login_at=now() WHERE id=$1', [u.id]);
      setAuthCookie(res, signSession(u.id));
      const full = await loadUserWithRole(u.id);
      await writeAudit(addr, 'auth.login', addr);
      res.json({ user: publicUser(full) });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ─── Admin invite → accept ────────────────────────────────────────────────────
router.post(
  '/invite',
  requireAuth,
  requireCapability('users.create'),
  validate(z.object({ email, name: name.optional(), roleId: z.string().min(1) }).strict()),
  async (req, res, next) => {
    try {
      const { email: addr, roleId } = req.valid;
      const role = await query('SELECT id, label FROM roles WHERE id=$1', [roleId]);
      if (!role.rows.length) return res.status(400).json({ error: 'Unknown role.' });
      const raw = makeToken();
      await query(
        `INSERT INTO email_tokens (email, type, token_hash, role_id, expires_at)
         VALUES ($1,'invite',$2,$3,$4)`,
        [addr, hashToken(raw), roleId, new Date(Date.now() + 3 * DAY)]
      );
      await sendInviteEmail(addr, raw, role.rows[0].label);
      await writeAudit(req.user.email, 'auth.invite', addr, { roleId });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/accept-invite',
  authLimiter,
  validate(z.object({ token: z.string().min(10), name, password }).strict()),
  async (req, res, next) => {
    try {
      const { token, name: fullName, password: pw } = req.valid;
      const th = hashToken(token);
      const { rows } = await query(
        `SELECT id, email, role_id FROM email_tokens
          WHERE token_hash=$1 AND type='invite' AND used_at IS NULL AND expires_at > now()`,
        [th]
      );
      if (!rows.length) return res.status(400).json({ error: 'Invalid or expired invite.' });
      const invite = rows[0];
      const hash = await bcrypt.hash(pw, 12);
      const userId = await withTransaction(async client => {
        const up = await client.query(
          `INSERT INTO users (name, email, password_hash, role_id, email_verified, active)
           VALUES ($1,$2,$3,$4,TRUE,TRUE)
           ON CONFLICT (email) DO UPDATE SET
             name=EXCLUDED.name, password_hash=EXCLUDED.password_hash,
             role_id=EXCLUDED.role_id, email_verified=TRUE, active=TRUE
           RETURNING id`,
          [fullName, invite.email, hash, invite.role_id]
        );
        await client.query('UPDATE email_tokens SET used_at=now() WHERE id=$1', [invite.id]);
        return up.rows[0].id;
      });
      setAuthCookie(res, signSession(userId));
      const full = await loadUserWithRole(userId);
      await writeAudit(invite.email, 'auth.accept_invite', invite.email, {
        roleId: invite.role_id,
      });
      res.json({ user: publicUser(full) });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Password reset ───────────────────────────────────────────────────────────
router.post(
  '/request-reset',
  authLimiter,
  validate(z.object({ email }).strict()),
  async (req, res, next) => {
    try {
      const addr = req.valid.email;
      const { rows } = await query('SELECT id FROM users WHERE email=$1 AND active=TRUE', [addr]);
      if (rows.length) {
        const raw = makeToken();
        await query(
          `INSERT INTO email_tokens (user_id, email, type, token_hash, expires_at)
         VALUES ($1,$2,'reset',$3,$4)`,
          [rows[0].id, addr, hashToken(raw), new Date(Date.now() + 60 * 60 * 1000)]
        );
        await sendResetEmail(addr, raw);
      }
      // Always 200 to avoid leaking which emails exist.
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/reset',
  authLimiter,
  validate(z.object({ token: z.string().min(10), password }).strict()),
  async (req, res, next) => {
    try {
      const th = hashToken(req.valid.token);
      const { rows } = await query(
        `SELECT id, user_id FROM email_tokens
        WHERE token_hash=$1 AND type='reset' AND used_at IS NULL AND expires_at > now()`,
        [th]
      );
      if (!rows.length) return res.status(400).json({ error: 'Invalid or expired link.' });
      const hash = await bcrypt.hash(req.valid.password, 12);
      await withTransaction(async client => {
        // Completing a reset proves mailbox ownership — the same trust basis
        // as the verify link — so it also unsticks never-verified accounts
        // whose original verification token expired.
        await client.query('UPDATE users SET password_hash=$1, email_verified=TRUE WHERE id=$2', [
          hash,
          rows[0].user_id,
        ]);
        await client.query('UPDATE email_tokens SET used_at=now() WHERE id=$1', [rows[0].id]);
      });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
