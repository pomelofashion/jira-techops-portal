// src/api/claudeApi.js
// Agentic content extraction: sends uploaded files to the BFF proxy which
// calls the Anthropic Claude API server-side. Returns clean Markdown.
// Falls back gracefully if the BFF is unreachable or the key is not configured.
//
// ✅ Sprint 1 complete (2026-04-06): The ANTHROPIC_API_KEY is now held in the
// server environment (no VITE_ prefix). The client never sees the key.
// See server/index.js POST /api/extract-content for the proxy implementation.

// mammoth (DOCX) and pdfjs-dist are loaded lazily — both are large (~2 MB) and
// only needed for specific file types. See loadPdfJs() / loadMammoth() below.

import { htmlToMd } from '../lib/htmlToMd.js';

let pdfjsPromise;
const loadPdfJs = () => {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then(mod => {
      mod.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
      ).href;
      return mod;
    });
  }
  return pdfjsPromise;
};

let mammothPromise;
const loadMammoth = () => {
  if (!mammothPromise) {
    mammothPromise = import('mammoth').then(mod => mod.default || mod);
  }
  return mammothPromise;
};

const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 4096;
const PDF_SIZE_LIMIT = 4.5 * 1024 * 1024; // 4.5 MB base64 safety limit
const IMG_SIZE_LIMIT = 5 * 1024 * 1024; // 5 MB — Anthropic vision limit

// ─── File readers ──────────────────────────────────────────────────────────────
const readAsBase64 = file =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(',')[1]); // strip data-URL prefix
    reader.onerror = () => reject(new Error('Failed to read file as base64'));
    reader.readAsDataURL(file);
  });

const readAsText = file =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result || '');
    reader.onerror = () => reject(new Error('Failed to read file as text'));
    reader.readAsText(file);
  });

// ─── BFF call ─────────────────────────────────────────────────────────────────
// The browser reads the file (FileReader is client-only), builds the messages
// payload, then sends it to the BFF proxy which adds the API key server-side.
// `betas` is forwarded to the server so it can set the anthropic-beta header.
const callClaude = async (messages, betas = []) => {
  const body = { model: MODEL, max_tokens: MAX_TOKENS, messages };
  if (betas.length > 0) body.betas = betas;

  let res;
  try {
    res = await fetch('/api/v1/extract-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // BFF server is not reachable (not running)
    throw Object.assign(
      new Error('BFF proxy is not reachable. Run `npm run dev:all` to start both servers.'),
      { code: 'BFF_DOWN' }
    );
  }

  // 502/504 = Vite proxy couldn't reach the BFF (server not running)
  if (res.status === 502 || res.status === 504) {
    throw Object.assign(
      new Error('BFF proxy is not reachable. Run `npm run dev:all` to start both servers.'),
      { code: 'BFF_DOWN' }
    );
  }

  if (res.status === 503) {
    throw Object.assign(
      new Error(
        'ANTHROPIC_API_KEY is not set in .env.local. Add your Anthropic API key to enable content extraction.'
      ),
      { code: 'KEY_MISSING' }
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const textBlock = data.content?.find(b => b.type === 'text');
  return textBlock?.text || '';
};

// ─── Client-side PDF text extraction (pdfjs fallback) ─────────────────────────
// Used when the Claude BFF is unavailable or the API key is not set.
// Extracts raw text page-by-page and returns basic Markdown.
const extractPdfWithPdfJs = async file => {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    // Items have .str and .hasEOL — reconstruct readable lines
    let pageText = '';
    for (const item of tc.items) {
      pageText += item.str;
      if (item.hasEOL) pageText += '\n';
    }
    const trimmed = pageText.trim();
    pageTexts.push(trimmed);
  }

  const body = pageTexts.join('\n\n');
  return body || null;
};

// ─── Extraction prompts ────────────────────────────────────────────────────────
const PDF_PROMPT =
  'Extract all content from this PDF and format it as clean Markdown. ' +
  'Use ## for main sections, ### for subsections, and - for bullet points. ' +
  'Use **bold** for key terms and important values. ' +
  'Convert any tables into bullet lists. ' +
  'Output only the document content — no preamble, no commentary.';

const TXT_PROMPT = text =>
  'Format this plain-text document as clean Markdown. ' +
  'Identify sections and add ## headings. Use - for lists. Preserve all content:\n\n' +
  text;

const CSV_PROMPT = text =>
  'This is a CSV file. In Markdown format:\n' +
  '1. Identify and list the column headers\n' +
  '2. State the number of data rows\n' +
  '3. Summarise key patterns or notable values using bullet points\n' +
  '4. Show the first 5 rows as a formatted list\n\n' +
  'CSV content:\n\n' +
  text.slice(0, 10000);

const IMG_PROMPT =
  'Describe this image in 1–3 sentences for a corporate document library. ' +
  'Be specific about visible content, charts, diagrams, or text shown. ' +
  'Do not include opinions or commentary — only factual description.';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if the BFF proxy is expected to be running.
 * Kept synchronous so existing call sites don't need to be awaited.
 */
export const isClaudeConfigured = () => true;

/**
 * Extracts and formats document content using available methods.
 * PDFs and text formats go through the Claude BFF proxy.
 * DOCX/DOC are extracted client-side via mammoth (no API key needed).
 * Image files return an optional Claude vision caption (image displayed via doc.imageUrl).
 * @param {File} file
 * @returns {Promise<string|null>} Markdown string, or null if unsupported/failed
 */
export const extractDocumentContent = async file => {
  const ext = file.name.split('.').pop().toLowerCase();

  // ── PDF: Claude API first, pdfjs fallback ──────────────────────────────────
  if (ext === 'pdf') {
    // Try Claude (AI-formatted markdown) if the file is within the size limit
    if (file.size <= PDF_SIZE_LIMIT) {
      try {
        const base64 = await readAsBase64(file);
        return await callClaude(
          [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: { type: 'base64', media_type: 'application/pdf', data: base64 },
                },
                { type: 'text', text: PDF_PROMPT },
              ],
            },
          ],
          ['pdfs-2024-09-25']
        );
      } catch (claudeErr) {
        // Forward KEY_MISSING so the caller can show a config hint — but still
        // extract text so the document isn't empty.
        if (claudeErr.code === 'KEY_MISSING') {
          const text = await extractPdfWithPdfJs(file).catch(() => null);
          const err = Object.assign(claudeErr, { fallbackContent: text });
          throw err;
        }
        // BFF_DOWN or any other error — silently fall through to pdfjs
        if (import.meta.env.DEV) {
          console.warn(
            '[claudeApi] Claude PDF extraction failed, falling back to pdfjs:',
            claudeErr.message
          );
        }
      }
    }
    // Fallback: extract raw text with pdfjs (no API key needed)
    return await extractPdfWithPdfJs(file);
  }

  // ── DOCX / DOC: client-side via mammoth (no API key needed) ────────────────
  if (ext === 'docx' || ext === 'doc') {
    try {
      const mammoth = await loadMammoth();
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        {
          convertImage: mammoth.images.imgElement(async image => {
            const b64 = await image.read('base64');
            return { src: `data:${image.contentType};base64,${b64}` };
          }),
        }
      );
      return htmlToMd(result.value) || null;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[claudeApi] mammoth extraction failed:', err.message);
      }
      return null;
    }
  }

  // ── Image files: return Claude caption only (image displayed via doc.imageUrl) ─
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
    const mimeType = file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`;

    if (file.size <= IMG_SIZE_LIMIT) {
      try {
        const b64 = await readAsBase64(file);
        const caption = await callClaude([
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: b64 } },
              { type: 'text', text: IMG_PROMPT },
            ],
          },
        ]);
        return caption; // just the text caption — image shown via doc.imageUrl
      } catch {
        // BFF down or no key — no caption available
      }
    }
    return null; // docsApi will show a simple placeholder
  }

  // ── Markdown: return as-is ──────────────────────────────────────────────────
  if (ext === 'md') {
    return await readAsText(file);
  }

  // ── Plain text: Claude formats it ──────────────────────────────────────────
  // Throws BFF_DOWN / KEY_MISSING so docsApi.js can show the right message.
  if (ext === 'txt') {
    const text = await readAsText(file);
    return await callClaude([{ role: 'user', content: TXT_PROMPT(text) }]);
  }

  // ── CSV: Claude summarises it ───────────────────────────────────────────────
  if (ext === 'csv') {
    const text = await readAsText(file);
    return await callClaude([{ role: 'user', content: CSV_PROMPT(text) }]);
  }

  // XLSX, PPTX, PPT — not yet supported
  return null;
};
