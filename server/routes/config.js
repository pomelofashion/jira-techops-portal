// server/routes/config.js
// Server-backed global app config. First consumer: the ticket-field layout.
// GET is open to any authenticated user (everyone needs it to render tickets);
// PUT requires system.settings_edit. Mounted at /api/config.

import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAuth, requireCapability, writeAudit } from '../auth.js';

const router = Router();
router.use(requireAuth);

// Must mirror TICKET_FIELD_KEYS in src/lib/ticketFields.js.
const TICKET_FIELD_KEYS = [
  'requesterEmail',
  'requesterName',
  'title',
  'description',
  'currentResult',
  'expectedResult',
  'department',
  'shop',
  'category',
];
const DEFAULT_TICKET_FIELDS = [
  { key: 'requesterEmail', label: 'Requester Email', visible: true, editable: true },
  { key: 'requesterName', label: 'Requester Name', visible: true, editable: true },
  { key: 'title', label: 'Title', visible: true, editable: true },
  { key: 'description', label: 'Description', visible: true, editable: true },
  { key: 'currentResult', label: 'Current Result', visible: true, editable: true },
  { key: 'expectedResult', label: 'Expected Result', visible: true, editable: true },
];

router.get('/ticket-fields', async (_req, res, next) => {
  try {
    const { rows } = await query("SELECT value FROM app_config WHERE key='ticket_fields'").catch(
      () => ({ rows: [] })
    );
    res.json({ fields: rows.length ? rows[0].value : DEFAULT_TICKET_FIELDS });
  } catch (err) {
    next(err);
  }
});

router.put('/ticket-fields', requireCapability('system.settings_edit'), async (req, res, next) => {
  try {
    const schema = z
      .object({
        fields: z
          .array(
            z
              .object({
                key: z.enum(TICKET_FIELD_KEYS),
                label: z.string().min(1).max(60),
                visible: z.boolean(),
                editable: z.boolean(),
              })
              .strict()
          )
          .min(1)
          .max(30),
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input.' });
    // Dedupe keys — a field may appear at most once.
    const seen = new Set();
    for (const f of parsed.data.fields) {
      if (seen.has(f.key)) return res.status(400).json({ error: `Duplicate field: ${f.key}` });
      seen.add(f.key);
    }
    await query(
      `INSERT INTO app_config (key, value, updated_at)
       VALUES ('ticket_fields', $1::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(parsed.data.fields)]
    );
    await writeAudit(req.user.email, 'config.ticket_fields', `${parsed.data.fields.length} fields`);
    res.json({ fields: parsed.data.fields });
  } catch (err) {
    next(err);
  }
});

export default router;
