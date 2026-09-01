// server/routes/sla.js
// SLA policy management. Mounted at /api/sla. Reading targets is available to
// any authenticated user (the SLA reference page shows them); editing needs
// the sla.manage capability. Policy edits do not retroactively rewrite
// existing ticket deadlines — new/repriotized tickets pick up the new targets.

import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, requireCapability, writeAudit } from '../auth.js';

const router = Router();
router.use(requireAuth);

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

const serialize = r => ({
  priority: r.priority,
  responseMinutes: r.response_minutes,
  resolutionMinutes: r.resolution_minutes,
  updatedAt: r.updated_at,
});

router.get('/policies', async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM sla_policies');
    rows.sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority));
    res.json({ policies: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
});

router.put('/policies', requireCapability('sla.manage'), async (req, res, next) => {
  try {
    const schema = z
      .object({
        policies: z
          .array(
            z
              .object({
                priority: z.enum(PRIORITIES),
                responseMinutes: z
                  .number()
                  .int()
                  .min(1)
                  .max(60 * 24 * 90),
                resolutionMinutes: z
                  .number()
                  .int()
                  .min(1)
                  .max(60 * 24 * 365),
              })
              .strict()
          )
          .min(1)
          .max(PRIORITIES.length),
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    for (const p of parsed.data.policies) {
      if (p.resolutionMinutes < p.responseMinutes)
        return res
          .status(400)
          .json({ error: `${p.priority}: resolution target must be ≥ response target.` });
      await query(
        `INSERT INTO sla_policies (priority, response_minutes, resolution_minutes, updated_at)
         VALUES ($1,$2,$3,now())
         ON CONFLICT (priority) DO UPDATE SET
           response_minutes = EXCLUDED.response_minutes,
           resolution_minutes = EXCLUDED.resolution_minutes,
           updated_at = now()`,
        [p.priority, p.responseMinutes, p.resolutionMinutes]
      );
    }
    await writeAudit(
      req.user.email,
      'sla.policies_update',
      parsed.data.policies.map(p => p.priority).join(',')
    );
    const { rows } = await query('SELECT * FROM sla_policies');
    rows.sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority));
    res.json({ policies: rows.map(serialize) });
  } catch (err) {
    next(err);
  }
});

export default router;
