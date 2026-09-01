// src/api/docsApi.js
// REST API service layer for the Pomelo TechOps Documentation system.
// All functions fall back to mock data when no backend is available.

import { MOCK_DOCS } from '../mocks/docsMockData.js';
import { extractDocumentContent } from './claudeApi.js';
import { api, USE_MOCK, wrap, simulateDelay, errorMessage } from './client.js';
import { scrubImageFile } from '../lib/imageUtil.js';
import { scrubOfficeFile } from '../lib/scrubOfficeMeta.js';

// ─── In-memory mock store (mutated on upload/update/delete) ───────────────────
let mockStore = [...MOCK_DOCS];

// ─── File helpers ──────────────────────────────────────────────────────────────
const FORMAT_ICONS = {
  PDF: '📄',
  DOCX: '📝',
  DOC: '📝',
  MD: '⬇️',
  TXT: '📃',
  CSV: '📊',
  XLSX: '📈',
  XLS: '📈',
  PPTX: '📑',
  PPT: '📑',
  PNG: '🖼️',
  JPG: '🖼️',
  JPEG: '🖼️',
  GIF: '🖼️',
  WEBP: '🖼️',
  ZIP: '🗜️',
  RAR: '🗜️',
  '7Z': '🗜️',
  MP4: '🎬',
  MOV: '🎬',
  WEBM: '🎬',
  MP3: '🎵',
  WAV: '🎵',
  JSON: '🧾',
  YAML: '🧾',
  YML: '🧾',
  LOG: '📃',
};

const fmtBytes = bytes => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const readFileAsText = file =>
  new Promise(resolve => {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['md', 'txt', 'csv'].includes(ext)) {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target?.result || '');
      reader.onerror = () => resolve('');
      reader.readAsText(file);
    } else {
      resolve('');
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/docs — List all documents
// @param {{ category?: string, format?: string, search?: string, status?: string, page?: number, limit?: number }} filters
// @returns {{ data: { docs: Doc[], total: number, page: number, pages: number } }}
// ─────────────────────────────────────────────────────────────────────────────
export const listDocs = async (filters = {}) => {
  return wrap(async () => {
    if (USE_MOCK) {
      await simulateDelay(250);
      let result = [...mockStore];
      // Enforce visibility: 'IT Team Only' docs are only visible to superadmin/admin roles
      if (filters.role !== 'superadmin' && filters.role !== 'admin') {
        result = result.filter(d => d.visibility !== 'IT Team Only');
      }
      if (filters.category && filters.category !== 'All')
        result = result.filter(d => d.category === filters.category);
      if (filters.format) result = result.filter(d => d.format === filters.format);
      if (filters.status) result = result.filter(d => d.status === filters.status);
      if (filters.search) {
        const q = filters.search.toLowerCase();
        result = result.filter(
          d =>
            d.title.toLowerCase().includes(q) ||
            d.description.toLowerCase().includes(q) ||
            (d.tags || []).some(t => t.toLowerCase().includes(q))
        );
      }
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const start = (page - 1) * limit;
      return {
        docs: result.slice(start, start + limit),
        total: result.length,
        page,
        pages: Math.ceil(result.length / limit),
      };
    }
    const { data } = await api.get('/api/docs', { params: filters });
    return data;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/docs/:id — Get single document
// @param {string} id
// ─────────────────────────────────────────────────────────────────────────────
export const getDoc = async id => {
  return wrap(async () => {
    if (USE_MOCK) {
      await simulateDelay(150);
      const doc = mockStore.find(d => d.id === id);
      if (!doc) throw new Error('Document not found.');
      doc.viewCount = (doc.viewCount || 0) + 1;
      return doc;
    }
    const { data } = await api.get(`/api/docs/${id}`);
    return data;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/docs/upload — Upload one or many files
// @param {FormData} formData — contains files[] + metadata
// @param {(progress: number) => void} onProgress
// ─────────────────────────────────────────────────────────────────────────────
// Mock mode keeps the original inline in memory, so it stays cheap (1 MB).
// API mode persists the bytes server-side and matches the route's own cap:
// 3 MB, because Vercel hard-caps request bodies at 4.5 MB and base64 inflates
// ~1.37×. Must mirror MAX_FILE_BYTES in server/routes/docs.js.
const SOURCE_FILE_LIMIT = 1_048_576; // 1 MB — files larger keep metadata only
const API_SOURCE_FILE_LIMIT = 3 * 1024 * 1024;
export const UPLOAD_FILE_LIMIT = API_SOURCE_FILE_LIMIT; // for UI copy/validation

// Chunk packing for batch uploads: keep each request comfortably under the
// Vercel body cap and the doc route's max(20), and keep request COUNT low so a
// big batch doesn't trip the 30 req/min production rate limiter.
const CHUNK_MAX_DOCS = 4;
const CHUNK_MAX_CHARS = 4_000_000; // total base64 chars per request

const fileToSource = (file, limit) =>
  new Promise(resolve => {
    const meta = {
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      capturedAt: new Date().toISOString(),
    };
    if (file.size > limit) {
      resolve({ ...meta, dataUrl: null });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ ...meta, dataUrl: String(reader.result || '') });
    reader.onerror = () => resolve({ ...meta, dataUrl: null });
    reader.readAsDataURL(file);
  });

const IMAGE_EXTS = new Set(['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP']);

// Turns a queued file into the doc fields both modes need. Extraction (pdfjs /
// mammoth / Claude) runs in the browser for both — the backend stores the
// resulting markdown and never parses the binary itself.
const buildDocFromFile = async item => {
  const format = item.file.name.split('.').pop().toUpperCase();
  const title = item.title || item.file.name.replace(/\.[^.]+$/, '');
  const isImageFormat = IMAGE_EXTS.has(format);

  let content = await extractDocumentContent(item.file).catch(err => {
    // KEY_MISSING may carry pdfjs-extracted text as a fallback
    return err.fallbackContent || null;
  });

  if (!content) {
    if (isImageFormat) {
      // Image docs: content is the AI caption. Show a neutral placeholder if unavailable.
      content = item.description || 'No description available.';
    } else {
      // Fallback: read raw text for text-based formats
      const rawText = await readFileAsText(item.file);
      if (rawText) {
        content = rawText;
      } else {
        // Could not extract content — show placeholder with actionable hint
        const uploadedDate = new Date().toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        // Deliberately neutral — internal tooling/config names must never
        // leak into user-visible document content.
        const claudeNote = `\n> ⚠️ Content could not be extracted automatically — download the original file below.`;
        content =
          `# ${title}\n\n` +
          claudeNote +
          '\n\n' +
          `## File Details\n\n` +
          `- **File name:** ${item.file.name}\n` +
          `- **File size:** ${fmtBytes(item.file.size)}\n` +
          `- **Format:** ${format}\n` +
          `- **Category:** ${item.category || 'Other'}\n` +
          `- **Uploaded:** ${uploadedDate}\n` +
          (item.description ? `\n## Description\n\n${item.description}\n` : '');
      }
    }
  }

  // Auto-generate description from content when the user left it blank.
  // Strip Markdown syntax, skip headers/images/code fences, take the
  // first meaningful sentence(s) up to 200 characters.
  const description = (() => {
    if (item.description) return item.description;
    if (!content) return '';
    const lines = content.split('\n');
    for (const line of lines) {
      const stripped = line
        .replace(/^#{1,6}\s+/, '') // headings
        .replace(/^[-*>]\s+/, '') // list items / blockquotes
        .replace(/^\d+\.\s+/, '') // numbered lists
        .replace(/!\[[^\]]*\]\([^)]*\)/, '') // images
        .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
        .replace(/`[^`]+`/g, '') // inline code
        .trim();
      if (stripped.length > 30) {
        return stripped.length > 200 ? stripped.slice(0, 197) + '…' : stripped;
      }
    }
    return '';
  })();

  return {
    title,
    description,
    content,
    format,
    isImageFormat,
    category: item.category || 'Other',
    icon: FORMAT_ICONS[format] || '📄',
    fileSize: item.file.size,
    visibility: item.visibility || 'Public',
    tags: item.tags
      ? item.tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean)
      : [],
  };
};

// Uploads a batch of queued files. Returns per-item outcomes IN INPUT ORDER:
//   [{ ok: true, doc } | { ok: false, error }]
// Extraction runs serially in the browser; the docs are then POSTed in packed
// chunks (few requests, each under the Vercel 4.5 MB body cap) instead of one
// request per file, so large batches don't trip the production rate limiter.
export const uploadDocs = async (fileMetaList, onProgress) => {
  return wrap(async () => {
    const total = fileMetaList.length;
    const outcomes = new Array(total);
    // Progress model: extraction is the first half, network the second.
    let extracted = 0;
    const reportExtract = () => onProgress?.(Math.round((extracted / Math.max(1, total)) * 50));

    if (USE_MOCK) {
      for (let i = 0; i < total; i++) {
        const item = fileMetaList[i];
        const built = await buildDocFromFile(item);
        const { isImageFormat, ...fields } = built;
        // Blob URL for reliable in-memory display of image docs — avoids
        // embedding multi-megabyte base64 data in the content field.
        const imageUrl = isImageFormat ? URL.createObjectURL(item.file) : null;
        const sourceFile = await fileToSource(item.file, SOURCE_FILE_LIMIT);
        await simulateDelay(300);
        const newDoc = {
          ...fields,
          id: 'doc-' + Date.now() + '-' + i,
          viewCount: 0,
          version: item.version || '1.0',
          author: item.author || 'Unknown',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'Active',
          imageUrl,
          sourceFile,
        };
        mockStore.unshift(newDoc);
        outcomes[i] = { ok: true, doc: newDoc };
        onProgress?.(Math.round(((i + 1) / total) * 100));
      }
      return outcomes;
    }

    // 1) Pre-flight + extraction. Oversize files fail fast without extraction.
    const sendable = [];
    for (let i = 0; i < total; i++) {
      const item = fileMetaList[i];
      if (item.file.size > API_SOURCE_FILE_LIMIT) {
        outcomes[i] = {
          ok: false,
          error: `Exceeds the ${Math.round(API_SOURCE_FILE_LIMIT / 1048576)} MB upload limit.`,
        };
        extracted++;
        reportExtract();
        continue;
      }
      const built = await buildDocFromFile(item);
      const { isImageFormat: _unused, ...fields } = built;
      // Privacy: strip embedded metadata before the original is stored —
      // images are re-encoded (EXIF/GPS gone), Office files get their
      // docProps author/company blanked. PDFs pass through (no safe
      // dependency-free scrubber; documented limitation).
      const cleanFile = await scrubOfficeFile(await scrubImageFile(item.file));
      const sourceFile = await fileToSource(cleanFile, API_SOURCE_FILE_LIMIT);
      sendable.push({
        index: i,
        payload: { ...fields, ...(item.author ? { author: item.author } : {}), sourceFile },
      });
      extracted++;
      reportExtract();
    }

    // 2) Greedy-pack into chunks by base64 weight, then POST chunk by chunk.
    const chunks = [];
    let current = [];
    let currentChars = 0;
    for (const s of sendable) {
      const chars = s.payload.sourceFile?.dataUrl?.length || 0;
      if (
        current.length &&
        (current.length >= CHUNK_MAX_DOCS || currentChars + chars > CHUNK_MAX_CHARS)
      ) {
        chunks.push(current);
        current = [];
        currentChars = 0;
      }
      current.push(s);
      currentChars += chars;
    }
    if (current.length) chunks.push(current);

    let uploadedDocs = 0;
    for (const chunk of chunks) {
      try {
        const { data } = await api.post(
          '/api/docs/upload',
          { docs: chunk.map(c => c.payload) },
          { timeout: 60000 } // big base64 bodies outlive the 15s default
        );
        const results = Array.isArray(data?.results) ? data.results : [];
        chunk.forEach((c, j) => {
          const r = results[j];
          outcomes[c.index] = r?.ok
            ? { ok: true, doc: r.doc }
            : { ok: false, error: r?.error || 'Upload failed.' };
        });
      } catch (err) {
        const status = err?.response?.status;
        const msg =
          status === 429
            ? 'Rate limited — wait a minute and retry the failed files.'
            : errorMessage(err);
        chunk.forEach(c => {
          outcomes[c.index] = { ok: false, error: msg };
        });
      }
      uploadedDocs += chunk.length;
      onProgress?.(50 + Math.round((uploadedDocs / Math.max(1, sendable.length)) * 50));
    }
    onProgress?.(100);
    return outcomes;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/docs — Create a manually-authored document (Documentation Studio).
// Unlike uploadDocs (file → AI extraction), this takes title + markdown content
// authored directly in the portal.
// @param {{ title, content, category, description, tags, visibility, author, icon }} payload
// ─────────────────────────────────────────────────────────────────────────────
export const createDoc = async payload => {
  return wrap(async () => {
    if (USE_MOCK) {
      await simulateDelay(250);
      const now = new Date().toISOString();
      const tags = Array.isArray(payload.tags)
        ? payload.tags
        : String(payload.tags || '')
            .split(',')
            .map(t => t.trim())
            .filter(Boolean);
      const newDoc = {
        id: 'doc-' + Date.now(),
        title: payload.title || 'Untitled Page',
        description: payload.description || '',
        category: payload.category || 'Other',
        format: 'MD',
        icon: payload.icon || '📝',
        fileSize: (payload.content || '').length,
        viewCount: 0,
        version: '1.0',
        author: payload.author || 'Unknown',
        createdAt: now,
        updatedAt: now,
        tags,
        visibility: payload.visibility || 'Public',
        status: 'Active',
        content: payload.content || '',
        versions: [],
      };
      mockStore.unshift(newDoc);
      return newDoc;
    }
    const { data } = await api.post('/api/docs', payload);
    return data;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/docs/:id — Update document metadata
// @param {string} id
// @param {Partial<Doc>} updates
// ─────────────────────────────────────────────────────────────────────────────
export const updateDoc = async (id, updates) => {
  return wrap(async () => {
    if (USE_MOCK) {
      await simulateDelay(300);
      const idx = mockStore.findIndex(d => d.id === id);
      if (idx === -1) throw new Error('Document not found.');
      mockStore[idx] = { ...mockStore[idx], ...updates, updatedAt: new Date().toISOString() };
      return mockStore[idx];
    }
    const { data } = await api.put(`/api/docs/${id}`, updates);
    return data;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Version history (Documentation Studio).
// A snapshot captures the doc's content + key metadata at a point in time.
// Snapshots live on doc.versions (most-recent first). The current content is
// NOT a snapshot until the next save creates one.
// ─────────────────────────────────────────────────────────────────────────────
const MAX_VERSIONS = 30;

// Capture the doc's CURRENT state as a snapshot before it is overwritten.
export const snapshotDoc = async (id, author) => {
  return wrap(async () => {
    if (USE_MOCK) {
      const idx = mockStore.findIndex(d => d.id === id);
      if (idx === -1) throw new Error('Document not found.');
      const doc = mockStore[idx];
      const snapshot = {
        versionId: 'v-' + Date.now(),
        savedAt: new Date().toISOString(),
        author: author || doc.author || 'Unknown',
        title: doc.title,
        content: doc.content,
        version: doc.version,
      };
      const versions = [snapshot, ...(doc.versions || [])].slice(0, MAX_VERSIONS);
      mockStore[idx] = { ...doc, versions };
      return snapshot;
    }
    const { data } = await api.post(`/api/docs/${id}/versions`, { author });
    return data;
  });
};

export const listDocVersions = async id => {
  return wrap(async () => {
    if (USE_MOCK) {
      const doc = mockStore.find(d => d.id === id);
      if (!doc) throw new Error('Document not found.');
      return doc.versions || [];
    }
    const { data } = await api.get(`/api/docs/${id}/versions`);
    return data;
  });
};

// Restore a snapshot's content/title. Snapshots the current state first so the
// restore itself is reversible.
export const restoreDocVersion = async (id, versionId, author) => {
  return wrap(async () => {
    if (USE_MOCK) {
      const idx = mockStore.findIndex(d => d.id === id);
      if (idx === -1) throw new Error('Document not found.');
      const doc = mockStore[idx];
      const snap = (doc.versions || []).find(v => v.versionId === versionId);
      if (!snap) throw new Error('Version not found.');
      // Snapshot current state, then apply the restore.
      const current = {
        versionId: 'v-' + Date.now(),
        savedAt: new Date().toISOString(),
        author: author || doc.author || 'Unknown',
        title: doc.title,
        content: doc.content,
        version: doc.version,
      };
      const versions = [current, ...(doc.versions || [])].slice(0, MAX_VERSIONS);
      mockStore[idx] = {
        ...doc,
        title: snap.title,
        content: snap.content,
        versions,
        updatedAt: new Date().toISOString(),
      };
      return mockStore[idx];
    }
    const { data } = await api.post(`/api/docs/${id}/versions/${versionId}/restore`, { author });
    return data;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/docs/:id — Soft delete (set status = Archived)
// @param {string} id
// ─────────────────────────────────────────────────────────────────────────────
export const deleteDoc = async id => {
  return wrap(async () => {
    if (USE_MOCK) {
      await simulateDelay(300);
      const idx = mockStore.findIndex(d => d.id === id);
      if (idx === -1) throw new Error('Document not found.');
      mockStore[idx] = {
        ...mockStore[idx],
        status: 'Archived',
        updatedAt: new Date().toISOString(),
      };
      return { success: true };
    }
    const { data } = await api.delete(`/api/docs/${id}`);
    return data;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/docs/categories — List categories with counts
// ─────────────────────────────────────────────────────────────────────────────
export const getCategories = async () => {
  return wrap(async () => {
    if (USE_MOCK) {
      await simulateDelay(100);
      const counts = {};
      mockStore
        .filter(d => d.status === 'Active')
        .forEach(d => {
          counts[d.category] = (counts[d.category] || 0) + 1;
        });
      return Object.entries(counts).map(([category, count]) => ({ category, count }));
    }
    const { data } = await api.get('/api/docs/categories');
    return data;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/docs/bulk-export — Returns array of doc objects for client-side ZIP
// @param {string[]} ids
// ─────────────────────────────────────────────────────────────────────────────
export const bulkExportDocs = async ids => {
  return wrap(async () => {
    if (USE_MOCK) {
      await simulateDelay(500);
      return mockStore.filter(d => ids.includes(d.id));
    }
    const { data } = await api.post('/api/docs/bulk-export', { ids });
    return data;
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Restore a document (set status = Active)
// @param {string} id
// ─────────────────────────────────────────────────────────────────────────────
export const restoreDoc = async id => updateDoc(id, { status: 'Active' });

// ─────────────────────────────────────────────────────────────────────────────
// Pin / unpin a doc to Home (admin feature). Caps featured count at 3.
// ─────────────────────────────────────────────────────────────────────────────
export const pinDoc = async (id, featured) => updateDoc(id, { featured: Boolean(featured) });

export const listFeaturedDocs = () => mockStore.filter(d => d.featured && d.status === 'Active');

// Lightweight summary list used by the chat assistant to ground responses.
export const listDocSummaries = () =>
  mockStore
    .filter(d => d.status === 'Active')
    .map(d => ({ title: d.title, description: d.description, category: d.category }));

// ─────────────────────────────────────────────────────────────────────────────
// Mark / clear a doc as "needs review" (admin feature).
// review payload: { reviewerName, dueDate, flaggedBy, flaggedAt }
// ─────────────────────────────────────────────────────────────────────────────
export const markNeedsReview = async (id, payload) =>
  updateDoc(id, { review: { ...payload, completed: false, flaggedAt: new Date().toISOString() } });

export const clearReview = async id => updateDoc(id, { review: null });

// ─────────────────────────────────────────────────────────────────────────────
// Bulk archive
// @param {string[]} ids
// ─────────────────────────────────────────────────────────────────────────────
export const bulkArchive = async ids => {
  return wrap(async () => {
    await simulateDelay(400);
    ids.forEach(id => {
      const idx = mockStore.findIndex(d => d.id === id);
      if (idx !== -1)
        mockStore[idx] = {
          ...mockStore[idx],
          status: 'Archived',
          updatedAt: new Date().toISOString(),
        };
    });
    return { success: true, count: ids.length };
  });
};
