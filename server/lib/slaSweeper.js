// server/lib/slaSweeper.js
// In-process SLA sweeper: every 60s flags approaching (80% consumed) and
// breached SLAs on open tickets, writes notification rows for the assignee
// and watchers, and sends email. sla_warned (JSONB) dedupes so each ticket
// notifies at most once per threshold per metric.
//
// Started from server/index.js only when dbEnabled — a single setInterval is
// plenty at portal volume; no external scheduler needed.

import { query } from '../db.js';
import { sendSlaEmail } from '../email.js';
import { fractionConsumed } from './sla.js';

const SWEEP_MS = 60_000;
const WARN_AT = 0.8;

async function notify(ticket, kind, metric) {
  const recipients = new Set();
  if (ticket.assignee_email) recipients.add(ticket.assignee_email);
  for (const w of ticket.watchers || []) if (typeof w === 'string') recipients.add(w);
  const title =
    kind === 'breached'
      ? `SLA breached on ${ticket.key} (${metric})`
      : `SLA at risk on ${ticket.key} (${metric})`;
  for (const email of recipients) {
    await query(
      `INSERT INTO notifications (user_email, type, title, body, ticket_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [email, `sla_${kind}`, title, `${ticket.title} — priority ${ticket.priority}.`, ticket.id]
    );
    sendSlaEmail(email, ticket.key, ticket.title, kind, metric).catch(err =>
      console.error(JSON.stringify({ level: 'error', msg: 'sla email failed', error: err.message }))
    );
  }
}

export async function sweepOnce() {
  // Open, unpaused tickets with at least one live deadline.
  const { rows } = await query(
    `SELECT id, key, title, priority, assignee_email, watchers, created_at,
            first_response_at, response_due_at, resolution_due_at,
            sla_paused_ms, response_breached, resolution_breached, sla_warned
     FROM tickets
     WHERE resolved_at IS NULL
       AND sla_paused_at IS NULL
       AND record_type = 'ticket'
       AND (response_due_at IS NOT NULL OR resolution_due_at IS NOT NULL)`
  ).catch(async err => {
    // record_type arrives in migration 009 — tolerate running before it.
    if (/record_type/.test(err.message)) {
      return query(
        `SELECT id, key, title, priority, assignee_email, watchers, created_at,
                first_response_at, response_due_at, resolution_due_at,
                sla_paused_ms, response_breached, resolution_breached, sla_warned
         FROM tickets
         WHERE resolved_at IS NULL
           AND sla_paused_at IS NULL
           AND (response_due_at IS NOT NULL OR resolution_due_at IS NOT NULL)`
      );
    }
    throw err;
  });

  const now = new Date();
  for (const t of rows) {
    const warned = t.sla_warned || {};
    const updates = [];
    const params = [];
    const markWarned = key => {
      warned[key] = now.toISOString();
    };

    // Response metric — active until first response happens.
    if (t.response_due_at && !t.first_response_at) {
      if (now > new Date(t.response_due_at)) {
        if (!t.response_breached) {
          updates.push('response_breached = TRUE');
          markWarned('response_breached');
          await notify(t, 'breached', 'response');
        }
      } else if (
        !warned.response_approaching &&
        fractionConsumed(t.created_at, t.response_due_at, t.sla_paused_ms, now) >= WARN_AT
      ) {
        markWarned('response_approaching');
        await notify(t, 'approaching', 'response');
      }
    }

    // Resolution metric — active until the ticket resolves.
    if (t.resolution_due_at) {
      if (now > new Date(t.resolution_due_at)) {
        if (!t.resolution_breached) {
          updates.push('resolution_breached = TRUE');
          markWarned('resolution_breached');
          await notify(t, 'breached', 'resolution');
        }
      } else if (
        !warned.resolution_approaching &&
        fractionConsumed(t.created_at, t.resolution_due_at, t.sla_paused_ms, now) >= WARN_AT
      ) {
        markWarned('resolution_approaching');
        await notify(t, 'approaching', 'resolution');
      }
    }

    if (JSON.stringify(warned) !== JSON.stringify(t.sla_warned || {})) {
      params.push(JSON.stringify(warned));
      updates.push(`sla_warned = $${params.length}::jsonb`);
    }
    if (updates.length) {
      params.push(t.id);
      await query(`UPDATE tickets SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
    }
  }
}

export function startSlaSweeper() {
  const run = () =>
    sweepOnce().catch(err =>
      console.error(JSON.stringify({ level: 'error', msg: 'sla sweep failed', error: err.message }))
    );
  run();
  const handle = setInterval(run, SWEEP_MS);
  handle.unref?.();
  return handle;
}
