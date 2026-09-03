// server/lib/automationEngine.js
// Scheduled automation for the ticket lifecycle. Runs off the cron dispatcher
// (api/cron/automation.js in prod; an in-process interval in local dev). Every
// job is idempotent: it records what it did in the ticket's `automation` JSONB
// bag (migration 020) so an action fires at most once per situation, which
// makes re-running the sweep safe at any cadence.
//
// Jobs:
//   1. SLA sweep         — existing breach/approach detection (slaSweeper).
//   2. SLA escalation     — on a fresh breach, alert admins beyond the assignee.
//   3. Waiting-for-Customer — nudge the requester, then auto-resolve if ignored.
//   4. Stale WIP          — nudge the assignee when in-progress work goes quiet.
// The daily admin digest (runDailyDigest) runs on its own slower cadence.

import { query } from '../db.js';
import { sendAutomationEmail } from '../email.js';
import { sweepOnce } from './slaSweeper.js';

// ─── Tunables (env-overridable; defaults chosen for a small IT desk) ──────────
const num = (envKey, def) => {
  const v = Number(process.env[envKey]);
  return Number.isFinite(v) && v > 0 ? v : def;
};
const WAITING_NUDGE_DAYS = num('AUTO_WAITING_NUDGE_DAYS', 3);
const WAITING_CLOSE_DAYS = num('AUTO_WAITING_CLOSE_DAYS', 7);
const STALE_WIP_DAYS = num('AUTO_STALE_WIP_DAYS', 4);
// Status a Waiting-for-Customer ticket is auto-resolved into.
const AUTO_CLOSE_STATUS = 'Live';
// In-progress-ish statuses whose silence is worth nudging.
const STALE_WIP_STATUSES = ['In Progress', 'Ready for QA', 'In QA', 'Ready for Code Review'];

const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const esc = s =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const daysAgo = n => new Date(Date.now() - n * 86400000);
const ticketLink = { href: `${APP_URL}/#mytickets`, label: 'View the ticket' };

// Merge keys into a ticket's automation bag.
async function markAutomation(ticketId, patch) {
  await query('UPDATE tickets SET automation = automation || $1::jsonb WHERE id=$2', [
    JSON.stringify(patch),
    ticketId,
  ]);
}

async function notifyRow(email, type, title, body, ticketId) {
  await query(
    `INSERT INTO notifications (user_email, type, title, body, ticket_id)
     VALUES ($1,$2,$3,$4,$5)`,
    [email, type, title, body, ticketId || null]
  );
}

async function timeline(ticketId, action) {
  await query('INSERT INTO ticket_timeline (ticket_id, action, actor) VALUES ($1,$2,$3)', [
    ticketId,
    action,
    'automation@system',
  ]);
}

async function activeAdmins() {
  const { rows } = await query(
    `SELECT email FROM users
      WHERE active = TRUE AND role_id IN ('role_superadmin','role_admin')`
  );
  return rows.map(r => r.email);
}

// ─── Job 2: escalate a fresh SLA breach beyond the assignee ───────────────────
// The SLA sweep sets response_breached/resolution_breached and notifies the
// assignee. A breach the assignee can't clear alone should reach a human who
// can reassign or reprioritise — so alert admins once per ticket.
async function escalateBreaches() {
  const { rows } = await query(
    `SELECT id, key, title, priority, assignee_email
       FROM tickets
      WHERE resolved_at IS NULL
        AND record_type = 'ticket'
        AND (response_breached OR resolution_breached)
        AND NOT (automation ? 'sla_escalated')`
  );
  let n = 0;
  for (const t of rows) {
    const admins = await activeAdmins();
    const body = `<b>${esc(t.key)}</b> — ${esc(t.title)} (priority ${esc(t.priority)}) has breached its SLA${
      t.assignee_email ? ` and is assigned to ${esc(t.assignee_email)}` : ' and is unassigned'
    }. It may need reassignment or a priority review.`;
    for (const email of admins) {
      await notifyRow(email, 'sla_escalated', `Escalation: ${t.key} breached SLA`, body, t.id);
      sendAutomationEmail(
        email,
        `Escalation: ${t.key} breached SLA`,
        'SLA breach escalated',
        body,
        ticketLink
      ).catch(() => {});
    }
    await timeline(t.id, 'SLA breach escalated to admins');
    await markAutomation(t.id, { sla_escalated: new Date().toISOString() });
    n++;
  }
  return n;
}

// ─── Job 3: Waiting-for-Customer nudge, then auto-resolve ─────────────────────
// A ticket parked in Waiting for Customer pauses the SLA clock and can sit
// forever. sla_paused_at marks when it entered that state. Nudge the requester
// after WAITING_NUDGE_DAYS; auto-resolve after WAITING_CLOSE_DAYS.
async function sweepWaitingForCustomer() {
  const { rows } = await query(
    `SELECT id, key, title, requester_email, requester_name, sla_paused_at, automation
       FROM tickets
      WHERE status = 'Waiting for Customer'
        AND resolved_at IS NULL
        AND record_type = 'ticket'
        AND sla_paused_at IS NOT NULL`
  );
  const now = Date.now();
  let nudged = 0;
  let closed = 0;
  for (const t of rows) {
    const waitingSince = new Date(t.sla_paused_at).getTime();
    const waitingDays = (now - waitingSince) / 86400000;
    const auto = t.automation || {};

    // Auto-resolve: waited past the close threshold.
    if (waitingDays >= WAITING_CLOSE_DAYS && !auto.waiting_closed) {
      await query(
        `UPDATE tickets
            SET status=$1, resolved_at=now(), sla_paused_at=NULL, updated_at=now(),
                automation = automation || $2::jsonb
          WHERE id=$3`,
        [AUTO_CLOSE_STATUS, JSON.stringify({ waiting_closed: new Date().toISOString() }), t.id]
      );
      await timeline(
        t.id,
        `Auto-resolved after ${WAITING_CLOSE_DAYS} days awaiting customer response`
      );
      if (t.requester_email) {
        const body = `<b>${esc(t.key)}</b> — ${esc(t.title)} was closed automatically after ${WAITING_CLOSE_DAYS} days without a reply. If you still need help, reply on the ticket to reopen it.`;
        await notifyRow(
          t.requester_email,
          'auto_closed',
          `${t.key} auto-closed (no response)`,
          body,
          t.id
        );
        sendAutomationEmail(
          t.requester_email,
          `${t.key} was closed`,
          'Ticket closed — no response',
          body,
          ticketLink
        ).catch(() => {});
      }
      closed++;
      continue;
    }

    // Nudge: waited past the nudge threshold, not yet nudged, not yet at close.
    if (waitingDays >= WAITING_NUDGE_DAYS && !auto.waiting_nudged_at) {
      if (t.requester_email) {
        const remaining = Math.max(1, Math.ceil(WAITING_CLOSE_DAYS - waitingDays));
        const body = `<b>${esc(t.key)}</b> — ${esc(t.title)} is waiting on your reply. Please respond on the ticket within ${remaining} day(s) or it will be closed automatically.`;
        await notifyRow(
          t.requester_email,
          'waiting_nudge',
          `Reminder: ${t.key} needs your reply`,
          body,
          t.id
        );
        sendAutomationEmail(
          t.requester_email,
          `Reminder: ${t.key} needs your input`,
          'We need your reply',
          body,
          ticketLink
        ).catch(() => {});
      }
      await timeline(t.id, 'Reminder sent to requester (awaiting response)');
      await markAutomation(t.id, { waiting_nudged_at: new Date().toISOString() });
      nudged++;
    }
  }
  return { nudged, closed };
}

// ─── Job 4: stale work-in-progress nudge ──────────────────────────────────────
// An assigned ticket sitting in an in-progress state with no update for
// STALE_WIP_DAYS gets one nudge to its assignee. The marker records the
// updated_at it nudged for, so a later spell of silence nudges again.
async function sweepStaleWip() {
  const { rows } = await query(
    `SELECT id, key, title, assignee_email, updated_at, automation
       FROM tickets
      WHERE status = ANY($1)
        AND assignee_email IS NOT NULL
        AND resolved_at IS NULL
        AND record_type = 'ticket'
        AND updated_at < $2`,
    [STALE_WIP_STATUSES, daysAgo(STALE_WIP_DAYS)]
  );
  let n = 0;
  for (const t of rows) {
    const auto = t.automation || {};
    const stamp = new Date(t.updated_at).toISOString();
    // Already nudged for this exact quiet spell? skip.
    if (auto.stale_nudged_for === stamp) continue;
    const body = `<b>${esc(t.key)}</b> — ${esc(t.title)} has had no update in over ${STALE_WIP_DAYS} days. If it's blocked, move it to Blocked or add a note; otherwise keep it moving.`;
    await notifyRow(t.assignee_email, 'stale_nudge', `Stale: ${t.key} has gone quiet`, body, t.id);
    sendAutomationEmail(
      t.assignee_email,
      `${t.key} needs an update`,
      'A ticket has gone quiet',
      body,
      ticketLink
    ).catch(() => {});
    // Mark WITHOUT bumping updated_at (raw column write, no updated_at=now()).
    await query('UPDATE tickets SET automation = automation || $1::jsonb WHERE id=$2', [
      JSON.stringify({ stale_nudged_for: stamp }),
      t.id,
    ]);
    n++;
  }
  return n;
}

// ─── Orchestrator (frequent cadence) ──────────────────────────────────────────
export async function runScheduledAutomations() {
  await sweepOnce(); // SLA breach/approach detection (sets breach flags)
  const escalated = await escalateBreaches();
  const waiting = await sweepWaitingForCustomer();
  const stale = await sweepStaleWip();
  return { escalated, waiting, stale };
}

// ─── Daily admin digest ───────────────────────────────────────────────────────
export async function runDailyDigest() {
  const admins = await activeAdmins();
  if (!admins.length) return { recipients: 0 };

  const openBreaches = await query(
    `SELECT count(*)::int AS n FROM tickets
      WHERE resolved_at IS NULL AND record_type='ticket'
        AND (response_breached OR resolution_breached)`
  );
  const unassigned = await query(
    `SELECT count(*)::int AS n FROM tickets
      WHERE resolved_at IS NULL AND record_type='ticket' AND assignee_email IS NULL`
  );
  const aging = await query(
    `SELECT count(*)::int AS n FROM tickets
      WHERE resolved_at IS NULL AND record_type='ticket' AND updated_at < $1`,
    [daysAgo(7)]
  );
  const pendingApprovals = await query(
    `SELECT count(*)::int AS n FROM approvals WHERE status='pending'`
  ).catch(() => ({ rows: [{ n: 0 }] }));

  const b = openBreaches.rows[0].n;
  const u = unassigned.rows[0].n;
  const a = aging.rows[0].n;
  const p = pendingApprovals.rows[0].n;

  // Nothing worth a daily ping? stay quiet.
  if (b === 0 && u === 0 && a === 0 && p === 0) return { recipients: 0, skipped: 'all-clear' };

  const body =
    `Today's TechOps queue health:<br/><br/>` +
    `• <b>${b}</b> ticket(s) breaching SLA<br/>` +
    `• <b>${u}</b> unassigned open ticket(s)<br/>` +
    `• <b>${a}</b> ticket(s) with no update in 7+ days<br/>` +
    `• <b>${p}</b> pending approval(s)`;
  for (const email of admins) {
    await notifyRow(email, 'digest', 'Daily queue digest', body.replace(/<[^>]+>/g, ' '), null);
    sendAutomationEmail(email, 'TechOps daily digest', 'Daily queue digest', body, {
      href: `${APP_URL}/#reports`,
      label: 'Open reports',
    }).catch(() => {});
  }
  return { recipients: admins.length, breaches: b, unassigned: u, aging: a, pendingApprovals: p };
}

// ─── Local-dev interval (prod uses Vercel cron) ───────────────────────────────
const INTERVAL_MS = num('AUTO_SWEEP_MS', 60_000);
export function startAutomationEngine() {
  const run = () =>
    runScheduledAutomations().catch(err =>
      console.error(
        JSON.stringify({ level: 'error', msg: 'automation sweep failed', error: err.message })
      )
    );
  run();
  const handle = setInterval(run, INTERVAL_MS);
  handle.unref?.();
  // Daily digest guard: run once per calendar day in this process.
  let lastDigestDay = null;
  const digestHandle = setInterval(() => {
    const day = new Date().toISOString().slice(0, 10);
    const hour = new Date().getHours();
    if (day !== lastDigestDay && hour >= 8) {
      lastDigestDay = day;
      runDailyDigest().catch(() => {});
    }
  }, 60_000);
  digestHandle.unref?.();
  return handle;
}
