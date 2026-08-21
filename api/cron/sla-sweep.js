// api/cron/sla-sweep.js
// Vercel Cron Job endpoint — replaces the in-process setInterval SLA sweeper.
// Configured in vercel.json to run every minute. Protected by CRON_SECRET so
// only Vercel's scheduler (or an admin with the secret) can trigger it.

import { sweepOnce } from '../../server/lib/slaSweeper.js';
import { dbEnabled } from '../../server/db.js';

export default async function handler(req, res) {
  // Vercel cron jobs send the CRON_SECRET header for authentication.
  // Reject unauthorized calls in production.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (!dbEnabled) {
    return res.status(200).json({ status: 'skipped', reason: 'DATABASE_URL not set' });
  }

  try {
    await sweepOnce();
    return res.status(200).json({ status: 'ok', ts: new Date().toISOString() });
  } catch (err) {
    console.error('SLA sweep cron failed:', err.message);
    return res.status(500).json({ error: 'Sweep failed.', detail: err.message });
  }
}
