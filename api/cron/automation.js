// api/cron/automation.js
// Vercel Cron target — runs the scheduled automation engine (SLA sweep + breach
// escalation + Waiting-for-Customer nudge/close + stale-WIP nudges). Scheduled
// in vercel.json; protected by CRON_SECRET. Supersedes the old sla-sweep cron
// (the engine calls sweepOnce internally).

import { runScheduledAutomations } from '../../server/lib/automationEngine.js';
import { dbEnabled } from '../../server/db.js';

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  if (!dbEnabled) {
    return res.status(200).json({ status: 'skipped', reason: 'DATABASE_URL not set' });
  }
  try {
    const summary = await runScheduledAutomations();
    return res.status(200).json({ status: 'ok', ts: new Date().toISOString(), summary });
  } catch (err) {
    console.error('automation cron failed:', err.message);
    return res.status(500).json({ error: 'Automation failed.', detail: err.message });
  }
}
