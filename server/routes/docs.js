// server/routes/docs.js
// Documentation persistence for Doc Studio + read views. Mounted at /api/docs.
// Response shapes match src/api/docsApi.js so enabling VITE_API_BASE_URL on the
// client switches it from mock to this backend with no other changes.
//
// Reads require auth; 'IT Team Only' docs are visible only to staff (docs.manage).
// Writes require the docs.manage capability.

import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { requireAuth, requireCapability, writeAudit } from '../auth.js';

const router = Router();
router.use(requireAuth);

const MAX_VERSIONS = 30;
const can = (u, c) => Array.isArray(u.role?.capabilities) && u.role.capabilities.includes(c);
const normalizeTags = t => {
  if (Array.isArray(t))
    return t
      .map(String)
      .map(s => s.trim())
      .filter(Boolean);
  if (typeof t === 'string')
    return t
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  return [];
};

// Rows are read through this projection so serialize() can expose the uploaded
// source file (LEFT JOIN — docs authored in the Studio simply have no file row).
const DOC_SELECT = `SELECT d.*, f.filename AS file_name, f.mime_type AS file_mime, f.size AS file_bytes
                    FROM docs d LEFT JOIN doc_files f ON f.doc_id = d.id`;

const serialize = (d, versions) => {
  // Served by GET /api/docs/:id/file. Named dataUrl because the client shape is
  // shared with mock mode, where the original is inlined as a data: URL.
  const fileUrl = d.file_name ? `/api/docs/${d.id}/file` : null;
  const isImage = fileUrl && String(d.file_mime || '').startsWith('image/');
  return {
    id: d.id,
    title: d.title,
    content: d.content,
    category: d.category,
    visibility: d.visibility,
    tags: d.tags || [],
    icon: d.icon,
    description: d.description,
    author: d.author,
    status: d.status,
    featured: d.featured,
    review: d.review,
    version: d.version,
    format: d.format || undefined,
    fileSize: d.file_size == null ? undefined : Number(d.file_size),
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    ...(fileUrl
      ? {
          sourceFile: {
            name: d.file_name,
            type: d.file_mime,
            size: Number(d.file_bytes),
            dataUrl: fileUrl,
          },
        }
      : {}),
    ...(isImage ? { imageUrl: fileUrl } : {}),
    ...(versions ? { versions } : {}),
  };
};
const serializeVersion = v => ({
  versionId: v.version_id,
  savedAt: v.saved_at,
  author: v.author,
  title: v.title,
  content: v.content,
});

// ─── List ─────────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const where = [];
    const params = [];
    if (!can(req.user, 'docs.manage')) where.push(`visibility <> 'IT Team Only'`);
    if (req.query.category && req.query.category !== 'All') {
      params.push(req.query.category);
      where.push(`category = $${params.length}`);
    }
    if (req.query.status) {
      params.push(req.query.status);
      where.push(`status = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${req.query.search}%`);
      where.push(`(title ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 200);
    const countRes = await query(`SELECT count(*)::int AS total FROM docs ${clause}`, params);
    params.push(limit, (page - 1) * limit);
    const { rows } = await query(
      `${DOC_SELECT} ${clause} ORDER BY d.updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const total = countRes.rows[0].total;
    res.json({ docs: rows.map(d => serialize(d)), total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

// Categories with counts (visibility-aware).
router.get('/categories', async (req, res, next) => {
  try {
    const clause = can(req.user, 'docs.manage') ? '' : `WHERE visibility <> 'IT Team Only'`;
    const { rows } = await query(
      `SELECT category, count(*)::int AS count FROM docs ${clause} GROUP BY category ORDER BY category`
    );
    res.json({ categories: rows.filter(r => r.category) });
  } catch (err) {
    next(err);
  }
});

router.post('/bulk-export', requireCapability('docs.manage'), async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.json({ docs: [] });
    const { rows } = await query(`${DOC_SELECT} WHERE d.id = ANY($1::uuid[])`, [ids]);
    res.json({ docs: rows.map(d => serialize(d)) });
  } catch (err) {
    next(err);
  }
});

// Shared by create (POST /) and upload (POST /upload).
const writeSchema = z
  .object({
    title: z.string().min(1).max(300),
    content: z.string().max(200000).default(''),
    category: z.string().max(120).optional(),
    visibility: z.enum(['Public', 'IT Team Only']).default('Public'),
    description: z.string().max(2000).optional(),
    icon: z.string().max(16).optional(),
    tags: z.union([z.string(), z.array(z.string())]).optional(),
    author: z.string().max(120).optional(),
  })
  .strict();

// ─── Upload ───────────────────────────────────────────────────────────────────
// The client extracts markdown from the file (pdfjs / mammoth / Claude vision)
// and posts the result together with the original bytes as a data: URL. The
// server persists the doc row + the original file, and never parses the binary
// itself — extraction stays in one place instead of being duplicated per format.
// 3 MB: Vercel serverless hard-caps request bodies at 4.5 MB, and base64
// inflates ~1.37× — a 3 MB file arrives as ~4.1 MB of JSON, just under the
// platform limit. Must mirror API_SOURCE_FILE_LIMIT in src/api/docsApi.js.
const MAX_FILE_BYTES = 3 * 1024 * 1024;

const sourceFileSchema = z
  .object({
    name: z.string().min(1).max(500),
    type: z.string().max(200).optional(),
    size: z.number().int().nonnegative().optional(),
    capturedAt: z.string().optional(),
    // "data:<mime>;base64,<payload>" — null when the client skipped capture.
    dataUrl: z.string().nullable().optional(),
  })
  .strict();

const uploadSchema = z
  .object({
    docs: z
      .array(
        writeSchema.extend({
          format: z.string().max(16).optional(),
          fileSize: z.number().int().nonnegative().optional(),
          sourceFile: sourceFileSchema.nullable().optional(),
        })
      )
      .min(1)
      .max(20),
  })
  .strict();

// data:<mime>;base64,<payload> → { mime, buffer }. Returns null for anything
// that isn't a base64 data URL (the client sends null past its size cap).
const decodeDataUrl = dataUrl => {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:([^;,]*);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const buffer = Buffer.from(m[2], 'base64');
  if (!buffer.length) return null;
  return { mime: m[1] || 'application/octet-stream', buffer };
};

router.post('/upload', requireCapability('docs.manage'), async (req, res, next) => {
  try {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Invalid input.', details: parsed.error.flatten() });

    // Per-doc outcomes: one bad file must not sink the rest of the batch.
    // Each doc gets its own transaction; the response reports every result
    // in input order so the client can map statuses back to its queue.
    const results = [];
    for (const d of parsed.data.docs) {
      try {
        const file = d.sourceFile ? decodeDataUrl(d.sourceFile.dataUrl) : null;
        if (file && file.buffer.length > MAX_FILE_BYTES) {
          results.push({
            ok: false,
            title: d.title,
            error: `"${d.sourceFile.name}" exceeds the ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB upload limit.`,
          });
          continue;
        }

        const row = await withTransaction(async client => {
          const { rows } = await client.query(
            `INSERT INTO docs (title, content, category, visibility, description, icon, tags, author, format, file_size, status, version)
             VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,'Active',1) RETURNING *`,
            [
              d.title,
              d.content || '',
              d.category || 'Other',
              d.visibility || 'Public',
              d.description || null,
              d.icon || '📄',
              JSON.stringify(normalizeTags(d.tags)),
              d.author || req.user.name,
              d.format || null,
              d.fileSize ?? d.sourceFile?.size ?? null,
            ]
          );
          const doc = rows[0];
          if (file) {
            await client.query(
              `INSERT INTO doc_files (doc_id, filename, mime_type, size, bytes) VALUES ($1,$2,$3,$4,$5)`,
              [
                doc.id,
                d.sourceFile.name,
                d.sourceFile.type || file.mime,
                file.buffer.length,
                file.buffer,
              ]
            );
            doc.file_name = d.sourceFile.name;
            doc.file_mime = d.sourceFile.type || file.mime;
            doc.file_bytes = file.buffer.length;
          }
          return doc;
        });

        await writeAudit(req.user.email, 'doc.upload', row.id, {
          title: d.title,
          file: d.sourceFile?.name || null,
        });
        results.push({ ok: true, doc: serialize(row) });
      } catch {
        results.push({ ok: false, title: d.title, error: 'Upload failed for this document.' });
      }
    }
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

// Restricted docs are readable only by staff; used by every route that
// returns doc content (including version snapshots).
const canReadDoc = (user, doc) => doc.visibility !== 'IT Team Only' || can(user, 'docs.manage');

// ─── Read one ─────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(`${DOC_SELECT} WHERE d.id=$1`, [req.params.id]);
    const d = rows[0];
    if (!d) return res.status(404).json({ error: 'Document not found.' });
    if (!canReadDoc(req.user, d))
      return res.status(403).json({ error: 'Insufficient permissions.' });
    res.json(serialize(d));
  } catch (err) {
    next(err);
  }
});

// ─── Original uploaded file ───────────────────────────────────────────────────
// Opened in a new tab from the doc page, so it authenticates off the session
// cookie like every other route and re-checks the parent doc's visibility.
router.get('/:id/file', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT d.visibility, f.filename, f.mime_type, f.size, f.bytes
         FROM docs d JOIN doc_files f ON f.doc_id = d.id
        WHERE d.id=$1`,
      [req.params.id]
    );
    const f = rows[0];
    if (!f) return res.status(404).json({ error: 'File not found.' });
    if (!canReadDoc(req.user, f))
      return res.status(403).json({ error: 'Insufficient permissions.' });
    res.setHeader('Content-Type', f.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', f.size);
    // inline: PDFs/images preview in-tab; browsers download the rest anyway.
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(f.filename)}`
    );
    res.send(f.bytes);
  } catch (err) {
    next(err);
  }
});

// ─── Create ───────────────────────────────────────────────────────────────────
router.post('/', requireCapability('docs.manage'), async (req, res, next) => {
  try {
    const parsed = writeSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Invalid input.', details: parsed.error.flatten() });
    const d = parsed.data;
    const { rows } = await query(
      `INSERT INTO docs (title, content, category, visibility, description, icon, tags, author, status, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'Active',1) RETURNING *`,
      [
        d.title,
        d.content,
        d.category || 'Other',
        d.visibility,
        d.description || null,
        d.icon || '📝',
        JSON.stringify(normalizeTags(d.tags)),
        d.author || req.user.name,
      ]
    );
    await writeAudit(req.user.email, 'doc.create', rows[0].id, { title: d.title });
    res.status(201).json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ─── Update ───────────────────────────────────────────────────────────────────
// Extends the create schema with update-only fields the client sends:
// restoreDoc → status, pinDoc → featured, markNeedsReview/clearReview → review.
const updateSchema = writeSchema
  .extend({
    status: z.enum(['Active', 'Archived']),
    featured: z.boolean(),
    review: z.object({}).passthrough().nullable(),
  })
  .partial()
  .strict();

router.put('/:id', requireCapability('docs.manage'), async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Invalid input.', details: parsed.error.flatten() });
    const d = parsed.data;
    const cur = await query('SELECT id FROM docs WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Document not found.' });

    const sets = ['version = version + 1', 'updated_at = now()'];
    const params = [];
    for (const [col, val] of [
      ['title', d.title],
      ['content', d.content],
      ['category', d.category],
      ['visibility', d.visibility],
      ['description', d.description],
      ['icon', d.icon],
      ['author', d.author],
      ['status', d.status],
      ['featured', d.featured],
    ]) {
      if (val !== undefined) {
        params.push(val);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (d.tags !== undefined) {
      params.push(JSON.stringify(normalizeTags(d.tags)));
      sets.push(`tags = $${params.length}::jsonb`);
    }
    if (d.review !== undefined) {
      params.push(d.review === null ? null : JSON.stringify(d.review));
      sets.push(`review = $${params.length}::jsonb`);
    }
    params.push(req.params.id);
    await query(`UPDATE docs SET ${sets.join(', ')} WHERE id=$${params.length}`, params);
    // Re-read through DOC_SELECT so the response keeps the source-file fields.
    const { rows } = await query(`${DOC_SELECT} WHERE d.id=$1`, [req.params.id]);
    await writeAudit(req.user.email, 'doc.update', req.params.id);
    res.json(serialize(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ─── Soft delete (archive) ────────────────────────────────────────────────────
router.delete('/:id', requireCapability('docs.manage'), async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE docs SET status='Archived', updated_at=now() WHERE id=$1 RETURNING id`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Document not found.' });
    await writeAudit(req.user.email, 'doc.archive', req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Versions ─────────────────────────────────────────────────────────────────
router.post('/:id/versions', requireCapability('docs.manage'), async (req, res, next) => {
  try {
    const cur = await query('SELECT * FROM docs WHERE id=$1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Document not found.' });
    const d = cur.rows[0];
    const versionId = 'v-' + Date.now();
    const author = req.body?.author || d.author || req.user.name;
    await withTransaction(async client => {
      await client.query(
        `INSERT INTO doc_versions (doc_id, version_id, title, content, author) VALUES ($1,$2,$3,$4,$5)`,
        [d.id, versionId, d.title, d.content, author]
      );
      // Trim to the most recent MAX_VERSIONS snapshots.
      await client.query(
        `DELETE FROM doc_versions WHERE doc_id=$1 AND id NOT IN (
           SELECT id FROM doc_versions WHERE doc_id=$1 ORDER BY saved_at DESC LIMIT $2)`,
        [d.id, MAX_VERSIONS]
      );
    });
    res.status(201).json({
      versionId,
      savedAt: new Date().toISOString(),
      author,
      title: d.title,
      content: d.content,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/versions', async (req, res, next) => {
  try {
    const docRes = await query('SELECT * FROM docs WHERE id=$1', [req.params.id]);
    const d = docRes.rows[0];
    if (!d) return res.status(404).json({ error: 'Document not found.' });
    // Version snapshots contain full doc content — same gate as reading the doc.
    if (!canReadDoc(req.user, d))
      return res.status(403).json({ error: 'Insufficient permissions.' });
    const { rows } = await query(
      'SELECT * FROM doc_versions WHERE doc_id=$1 ORDER BY saved_at DESC',
      [req.params.id]
    );
    res.json(rows.map(serializeVersion)); // array (matches mock shape)
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/versions/:versionId/restore',
  requireCapability('docs.manage'),
  async (req, res, next) => {
    try {
      const docRes = await query('SELECT * FROM docs WHERE id=$1', [req.params.id]);
      if (!docRes.rows.length) return res.status(404).json({ error: 'Document not found.' });
      const snapRes = await query('SELECT * FROM doc_versions WHERE doc_id=$1 AND version_id=$2', [
        req.params.id,
        req.params.versionId,
      ]);
      if (!snapRes.rows.length) return res.status(404).json({ error: 'Version not found.' });
      const d = docRes.rows[0];
      const snap = snapRes.rows[0];
      const author = req.body?.author || req.user.name;
      const updated = await withTransaction(async client => {
        // Snapshot current state first so the restore itself is reversible.
        await client.query(
          `INSERT INTO doc_versions (doc_id, version_id, title, content, author) VALUES ($1,$2,$3,$4,$5)`,
          [d.id, 'v-' + Date.now(), d.title, d.content, author]
        );
        const { rows } = await client.query(
          `UPDATE docs SET title=$1, content=$2, version=version+1, updated_at=now() WHERE id=$3 RETURNING *`,
          [snap.title, snap.content, d.id]
        );
        return rows[0];
      });
      await writeAudit(req.user.email, 'doc.restore', d.id, { versionId: req.params.versionId });
      res.json(serialize(updated));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
