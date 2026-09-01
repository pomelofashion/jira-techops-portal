// server/index.js
// Pomelo TechOps — Backend-For-Frontend (BFF) proxy
//
// Holds Jira and Anthropic credentials server-side so they never appear
// in the client bundle.
//
// Start: node server/index.js
// Dev:   npm run dev:all  (starts Vite + this server concurrently)
//
// Required env vars (no VITE_ prefix — never bundled by Vite):
//   JIRA_API_TOKEN      Base64-encoded Atlassian token (user:apikey)
//   JIRA_BASE_URL       Defaults to https://pomelofashion.atlassian.net
//   ANTHROPIC_API_KEY   Anthropic API key (sk-ant-...)
//   ALLOWED_ORIGIN      Required in production. Restricts CORS origin.
//   NODE_ENV            Set to 'production' to enforce strict CORS + skip dev defaults.

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { existsSync } from 'fs';
import cookieParser from 'cookie-parser';
import * as Sentry from '@sentry/node';
import { dbHealth, dbEnabled } from './db.js';
import { log } from './lib/log.js';
import { requireAuth, requireCapability } from './auth.js';
import authRouter from './routes/auth.js';
import ticketsRouter from './routes/tickets.js';
import usersRouter from './routes/users.js';
import rolesRouter from './routes/roles.js';
import auditRouter from './routes/audit.js';
import docsRouter from './routes/docs.js';
import jiraRouter from './routes/jira.js';
import webhooksRouter from './routes/webhooks.js';
import anthropicRouter from './routes/anthropic.js';
import requestTypesRouter from './routes/requestTypes.js';
import slaRouter from './routes/sla.js';
import notificationsRouter from './routes/notifications.js';
import approvalsRouter from './routes/approvals.js';
import assetsRouter from './routes/assets.js';
import problemsRouter from './routes/problems.js';
import changesRouter from './routes/changes.js';
import csatRouter from './routes/csat.js';
import reportsRouter from './routes/reports.js';
import spacesRouter from './routes/spaces.js';
import { startSlaSweeper } from './lib/slaSweeper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '..', '.env.local') });
// Env files (.env.local then .env) are loaded by db.js via loadConfig.js

// ─── Structured logging + Sentry init ─────────────────────────────────────────
// Emits one-line JSON to stdout. Sentry capture is enabled when SENTRY_DSN is
// set; otherwise the calls become no-ops so dev is unaffected.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
  });
}

// log() lives in server/lib/log.js (shared with the route modules).

// VITE_-prefixed env vars are bundled by Vite into the client. Reject them as
// credential sources so a misnamed key cannot leak into the browser bundle.
if (process.env.VITE_ANTHROPIC_API_KEY || process.env.VITE_JIRA_API_TOKEN) {
  console.error(
    '[BFF] ✖  Refusing to start: VITE_ANTHROPIC_API_KEY / VITE_JIRA_API_TOKEN found in env. ' +
      'These prefixes are bundled into the client by Vite. Rename to ANTHROPIC_API_KEY / JIRA_API_TOKEN in .env.local.'
  );
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !process.env.ALLOWED_ORIGIN && !process.env.VERCEL) {
  console.error('[BFF] ✖  Refusing to start: ALLOWED_ORIGIN must be set in production.');
  process.exit(1);
}

const app = express();
const PORT = process.env.BFF_PORT || 3001;

// Behind Render / a load balancer the client IP arrives via X-Forwarded-For;
// without this, express-rate-limit buckets every client under the proxy IP
// (or hard-errors on the header) and req.secure never reflects TLS.
app.set('trust proxy', 1);

app.use(helmet());

// ALLOWED_ORIGIN accepts a comma-separated list (e.g. staging + production).
// credentials:true is required for the httpOnly session cookie to cross
// origins; cookies also require an exact origin match, never a wildcard.
// On Vercel, derive from VERCEL_URL if ALLOWED_ORIGIN isn't explicitly set.
const vercelOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
const allowedOrigins = (process.env.ALLOWED_ORIGIN || vercelOrigin || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
  })
);

// 20 MB limit to accommodate base64-encoded PDF payloads
app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());

// Health probe — registered before the rate limiter so platform health checks
// (Render, load balancers) are never throttled. Reports DB connectivity.
app.get('/api/health', async (_req, res) => {
  res.json({ status: 'ok', db: await dbHealth(), ts: new Date().toISOString() });
});

// Development gets a much higher ceiling: the SPA fans out on boot (roles,
// users, tickets, notifications) and Playwright E2E runs several logins per
// minute — 30/min trips constantly. Production keeps the strict limit.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: process.env.NODE_ENV === 'production' ? 30 : 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests.' },
});
app.use('/api/', apiLimiter);

// ─── DB-backed application routes (active only when DATABASE_URL is set) ───────
// These provide real persistence (auth now; tickets/users/roles/docs next).
// When unset, the app falls back to the existing mock/localStorage behaviour.
if (dbEnabled) {
  app.use('/api/auth', authRouter);
  app.use('/api/tickets', ticketsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/roles', rolesRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/docs', docsRouter);
  app.use('/api/request-types', requestTypesRouter);
  app.use('/api/sla', slaRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/approvals', approvalsRouter);
  app.use('/api/spaces', spacesRouter);
  app.use('/api/assets', assetsRouter);
  app.use('/api/problems', problemsRouter);
  app.use('/api/changes', changesRouter);
  app.use('/api/csat', csatRouter);
  app.use('/api/reports', reportsRouter);
  // SLA sweeper: only start the in-process interval when running as a
  // persistent server (not on Vercel). On Vercel the sweeper runs via cron
  // hitting /api/cron/sla-sweep instead.
  if (!process.env.VERCEL) {
    startSlaSweeper();
  }
  console.log(
    '[BFF] DB-backed routes mounted: /api/auth, /api/tickets, /api/users, /api/roles, /api/audit, /api/docs, /api/request-types, /api/sla, /api/notifications' +
      (process.env.VERCEL ? '' : ' (SLA sweeper on)')
  );
}

// ─── Proxy routes (Jira/JSM, webhooks, Anthropic) ─────────────────────────────
app.use('/api/v1', jiraRouter);
app.use('/api/v1', webhooksRouter);
app.use('/api/v1', anthropicRouter);

// ─── Admin status (returns credential-presence booleans for the admin UI) ─────
// DB mode: requires an authenticated session with admin settings capability.
// No DB: there is no session to validate, so the route only exists in dev.
const adminStatusGuards = dbEnabled
  ? [requireAuth, requireCapability('system.settings_edit')]
  : [(_req, res, next) => (isProduction ? res.status(404).json({ error: 'Not found.' }) : next())];
app.get('/api/v1/admin-status', ...adminStatusGuards, (_req, res) => {
  res.json({
    status: 'ok',
    jira: Boolean(process.env.JIRA_API_TOKEN),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    ts: new Date().toISOString(),
  });
});

// ─── Static frontend (single-service deploy) ──────────────────────────────────
// In production the built SPA is served by this same Node process. Mounted after
// all /api routes so it never shadows them; only active when dist/ exists (so
// local dev, where Vite serves the app on :5173, is unaffected).
const distDir = resolve(__dirname, '..', 'dist');
if (existsSync(resolve(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  // SPA history fallback: any non-API GET returns index.html so client-side
  // routing works on hard refresh. (Middleware form avoids Express 5 wildcard
  // path syntax.)
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(resolve(distDir, 'index.html'));
  });
  console.log('[BFF] Serving built frontend from dist/');
}

// ─── Central error handler ────────────────────────────────────────────────────
// Response envelope is always { error: string } — same shape every route uses.
// Status reflects the failure class instead of blanket 502: bad input is the
// caller's fault (400), a failed Jira/Anthropic call is upstream (502),
// anything else is our bug (500). Details stay in the log, never the response.
app.use((err, _req, res, _next) => {
  log('error', 'Unhandled error', { error: err.message, stack: err.stack });
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
  if (err?.name === 'ZodError') return res.status(400).json({ error: 'Invalid input.' });
  if (err?.isAxiosError) return res.status(502).json({ error: 'Upstream request failed.' });
  const status = Number.isInteger(err?.status) ? err.status : 500;
  res.status(status).json({ error: status >= 500 ? 'Internal server error.' : err.message });
});

// ─── Export for Vercel serverless + local dev listen ──────────────────────────
// When imported by the Vercel adapter (api/index.js) the app is used as a
// request handler — no listen(). When run directly (npm start / npm run server)
// we bind to a port as before.
export default app;

const isVercel = Boolean(process.env.VERCEL);
if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`[BFF] Pomelo TechOps API proxy → http://localhost:${PORT}`);
    console.log(`[BFF] NODE_ENV:             ${process.env.NODE_ENV || 'development'}`);
    console.log(`[BFF] Allowed origins:      ${allowedOrigins.join(', ')}`);
    console.log(
      `[BFF] Database:             ${dbEnabled ? 'configured' : 'not configured (DATABASE_URL unset)'}`
    );
  });
}
