-- Uploaded source files for documents. The portal's Documentation upload flow
-- extracts markdown client-side (pdfjs / mammoth / Claude) and stores it in
-- docs.content; this table keeps the ORIGINAL binary so the doc page can offer
-- "Original file" download/preview.
--
-- Bytes live in Postgres rather than object storage: the portal has no S3
-- credentials provisioned, and at portal volume (a few MB per doc, capped
-- server-side) bytea is well within Postgres' comfort zone. The read path is a
-- single endpoint (GET /api/docs/:id/file), so swapping the storage backend to
-- S3 later only touches that route + the upload insert. Forward-only.

ALTER TABLE docs ADD COLUMN IF NOT EXISTS format    TEXT;
ALTER TABLE docs ADD COLUMN IF NOT EXISTS file_size BIGINT;

CREATE TABLE IF NOT EXISTS doc_files (
  doc_id      UUID PRIMARY KEY REFERENCES docs(id) ON DELETE CASCADE,
  filename    TEXT   NOT NULL,
  mime_type   TEXT   NOT NULL DEFAULT 'application/octet-stream',
  size        BIGINT NOT NULL,
  bytes       BYTEA  NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
