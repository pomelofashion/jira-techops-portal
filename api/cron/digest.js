// api/cron/digest.js
// Vercel Cron target — sends the once-daily admin queue digest (SLA breaches,
// unassigned, aging backlog, pending approvals). Scheduled in vercel.json for
// early morning; protected by CRON_SECRET. Stays silent on an all-clear queue.

import { runDailyDigest } from '../../server/lib/automationEngine.js';
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
    const summary = await runDailyDigest();
    return res.status(200).json({ status: 'ok', ts: new Date().toISOString(), summary });
  } catch (err) {
    console.error('digest cron failed:', err.message);
    return res.status(500).json({ error: 'Digest failed.', detail: err.message });
  }
}
