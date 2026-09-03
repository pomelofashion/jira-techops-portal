// tests/automation-engine.mjs
// Standalone functional test for the scheduled automation engine. Not part of
// the Playwright suite (it drives the DB + engine directly). Run against a dev
// database with the BFF stack configured:
//   node tests/automation-engine.mjs
// Exits non-zero on any failed assertion; cleans up its own fixtures.

import '../server/loadConfig.js';
import { query } from '../server/db.js';
import { runScheduledAutomations, runDailyDigest } from '../server/lib/automationEngine.js';

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
};

async function mkTicket(title) {
  const key = `AUTOTEST-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const { rows } = await query(
    `INSERT INTO tickets (key, title, description, category, priority, status,
       requester_name, requester_email, record_type)
     VALUES ($1,$2,'x','Other','Medium','To Do','E2E User','e2e-user@example.local','ticket')
     RETURNING id`,
    [key, title]
  );
  return rows[0].id;
}

const ids = [];
try {
  // Auto-close: waiting 8 days.
  const wc = await mkTicket('AUTO close');
  ids.push(wc);
  await query(
    `UPDATE tickets SET status='Waiting for Customer', sla_paused_at = now() - interval '8 days' WHERE id=$1`,
    [wc]
  );
  // Nudge-only: waiting 4 days.
  const nu = await mkTicket('AUTO nudge');
  ids.push(nu);
  await query(
    `UPDATE tickets SET status='Waiting for Customer', sla_paused_at = now() - interval '4 days' WHERE id=$1`,
    [nu]
  );
  // Stale WIP + breach.
  const sw = await mkTicket('AUTO stale');
  ids.push(sw);
  await query(
    `UPDATE tickets SET status='In Progress', assignee_email='e2e-user@example.local',
       updated_at = now() - interval '5 days', resolution_breached=TRUE,
       resolution_due_at = now() - interval '1 day' WHERE id=$1`,
    [sw]
  );

  const r1 = await runScheduledAutomations();
  ok(r1.waiting.closed >= 1, 'a ticket was auto-closed');
  ok(r1.waiting.nudged >= 1, 'a ticket was nudged');
  ok(r1.stale >= 1, 'a stale WIP ticket was nudged');
  ok(r1.escalated >= 1, 'a breach was escalated');

  const wcRow = (await query('SELECT status, resolved_at FROM tickets WHERE id=$1', [wc])).rows[0];
  ok(wcRow.status === 'Live' && wcRow.resolved_at, 'closed ticket is resolved to Live');
  const nuRow = (await query('SELECT status FROM tickets WHERE id=$1', [nu])).rows[0];
  ok(nuRow.status === 'Waiting for Customer', 'nudged ticket stayed open');

  const before = (
    await query(`SELECT count(*)::int c FROM notifications WHERE ticket_id = ANY($1)`, [ids])
  ).rows[0].c;
  const r2 = await runScheduledAutomations();
  ok(
    r2.waiting.closed === 0 && r2.waiting.nudged === 0 && r2.stale === 0 && r2.escalated === 0,
    'second run is a no-op (idempotent)'
  );
  const after = (
    await query(`SELECT count(*)::int c FROM notifications WHERE ticket_id = ANY($1)`, [ids])
  ).rows[0].c;
  ok(after === before, 'no duplicate notifications on re-run');

  const digest = await runDailyDigest();
  ok(digest.recipients >= 1 || digest.skipped === 'all-clear', 'digest ran');
} finally {
  if (ids.length) {
    await query('DELETE FROM notifications WHERE ticket_id = ANY($1)', [ids]);
    await query('DELETE FROM ticket_timeline WHERE ticket_id = ANY($1)', [ids]);
    await query('DELETE FROM tickets WHERE id = ANY($1)', [ids]);
  }
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
