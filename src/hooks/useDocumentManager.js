// src/hooks/useDocumentManager.js
// Custom React hook that manages upload queue, filters, selection, export, pagination, and bookmarks.

import { useState, useCallback, useEffect } from 'react';
import { listDocs, uploadDocs, bulkExportDocs } from '../api/docsApi.js';

const BOOKMARKS_KEY = 'pomelo_doc_bookmarks';

const DEFAULT_FILTERS = {
  search: '',
  category: 'All',
  format: '',
  status: 'Active',
  dateFrom: '',
  dateTo: '',
};
const DEFAULT_QUEUE_ITEM = {
  id: '',
  file: null,
  status: 'queued',
  progress: 0,
  error: null,
  category: 'Other',
  title: '',
  description: '',
  tags: '',
  author: '',
  version: '1.0',
  visibility: 'Public',
};

// ─── Auto-categorization rules ────────────────────────────────────────────────
const CATEGORY_RULES = [
  {
    keywords: ['vpn', 'network', 'wifi', 'access', 'firewall', 'connectivity'],
    category: 'Network & Access',
  },
  {
    keywords: ['onboard', 'welcome', 'new employee', 'orientation', 'setup', 'first day'],
    category: 'Onboarding',
  },
  { keywords: ['password', 'mfa', 'security', '2fa', 'auth', 'compliance'], category: 'Security' },
  {
    keywords: ['software', 'app', 'license', 'install', 'saas', 'request'],
    category: 'Software & Apps',
  },
  { keywords: ['hardware', 'laptop', 'device', 'equipment', 'replacement'], category: 'Hardware' },
  { keywords: ['backup', 'storage', 'data', 'recovery', 'archive'], category: 'Data & Storage' },
  { keywords: ['policy', 'procedure', 'standard', 'guideline', 'sla'], category: 'Policies' },
];

export const autoDetectCategory = filename => {
  const lower = filename.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) return rule.category;
  }
  return 'Other';
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export default function useDocumentManager(role = 'user') {
  // Docs + pagination
  const [docs, setDocs] = useState([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [docsError, setDocsError] = useState(null);

  // Filters
  const [filters, setFiltersState] = useState(DEFAULT_FILTERS);

  // Upload queue
  const [queue, setQueue] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSummary, setUploadSummary] = useState(null);

  // Selection (for bulk ops)
  const [selectedIds, setSelectedIds] = useState([]);

  // Bookmarks (persisted to localStorage)
  const [bookmarks, setBookmarks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(BOOKMARKS_KEY)) || [];
    } catch {
      return [];
    }
  });

  // Export state
  const [exportLoading, setExportLoading] = useState(false);

  // ─── Load docs ─────────────────────────────────────────────────────────────
  const loadDocs = useCallback(
    async overrideFilters => {
      setLoading(true);
      setDocsError(null);
      const f = { ...(overrideFilters || filters), page, role };
      const { data, error } = await listDocs(f);
      setLoading(false);
      if (error) {
        setDocsError(error);
        return;
      }
      setDocs(data.docs);
      setTotalDocs(data.total);
    },
    [filters, page, role]
  );

  // loadDocs already captures filters/page/role via useCallback — listing it
  // here is sufficient and avoids the stale-closure lint warning.
  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  // ─── Filter management ─────────────────────────────────────────────────────
  const setFilter = useCallback((key, value) => {
    setFiltersState(prev => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  // ─── Queue management ──────────────────────────────────────────────────────
  const addToQueue = useCallback((files, defaultAuthor = '') => {
    const newItems = Array.from(files).map(file => ({
      ...DEFAULT_QUEUE_ITEM,
      id: 'q-' + Date.now() + '-' + Math.random(),
      file,
      title: file.name.replace(/\.[^.]+$/, ''),
      category: autoDetectCategory(file.name),
      author: defaultAuthor,
      autoDetected: true,
    }));
    setQueue(prev => [...prev, ...newItems]);
  }, []);

  const removeFromQueue = useCallback(id => {
    setQueue(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setUploadSummary(null);
    setUploadProgress(0);
  }, []);

  const updateQueueItem = useCallback((id, updates) => {
    setQueue(prev =>
      prev.map(item => (item.id === id ? { ...item, ...updates, autoDetected: false } : item))
    );
  }, []);

  const setBulkCategory = useCallback(category => {
    setQueue(prev => prev.map(item => ({ ...item, category, autoDetected: false })));
  }, []);

  const removeErrored = useCallback(() => {
    setQueue(prev => prev.filter(item => item.status !== 'error'));
  }, []);

  // ─── Upload ────────────────────────────────────────────────────────────────
  // Core upload loop — accepts an explicit array of queue items to process so
  // both uploadAll and uploadSelected can share it without race conditions.
  const runUpload = useCallback(
    async pending => {
      if (!pending.length) return;
      setUploading(true);
      setUploadProgress(0);
      setUploadSummary(null);

      // One uploadDocs call for the whole batch: extraction runs serially in
      // the browser, then the docs POST in a few packed requests (not one per
      // file), which keeps big batches under the production rate limit.
      const ids = new Set(pending.map(p => p.id));
      setQueue(prev =>
        prev.map(q => (ids.has(q.id) ? { ...q, status: 'uploading', progress: 0 } : q))
      );

      const { data: outcomes, error } = await uploadDocs(pending, p => {
        setUploadProgress(p);
        setQueue(prev =>
          prev.map(q => (ids.has(q.id) && q.status === 'uploading' ? { ...q, progress: p } : q))
        );
      });

      let succeeded = 0;
      let failed = 0;
      if (error || !Array.isArray(outcomes)) {
        failed = pending.length;
        setQueue(prev =>
          prev.map(q =>
            ids.has(q.id) ? { ...q, status: 'error', error: error || 'Upload failed' } : q
          )
        );
      } else {
        const outcomeById = new Map(pending.map((p, i) => [p.id, outcomes[i]]));
        setQueue(prev =>
          prev.map(q => {
            if (!ids.has(q.id)) return q;
            const o = outcomeById.get(q.id);
            return o?.ok
              ? { ...q, status: 'complete', progress: 100 }
              : { ...q, status: 'error', error: o?.error || 'Upload failed' };
          })
        );
        succeeded = outcomes.filter(o => o?.ok).length;
        failed = pending.length - succeeded;
      }

      setUploading(false);
      setUploadProgress(100);
      setUploadSummary({ succeeded, failed });
      loadDocs();
    },
    [loadDocs]
  );

  const uploadAll = useCallback(async () => {
    const pending = queue.filter(item => item.status === 'queued' || item.status === 'error');
    await runUpload(pending);
  }, [queue, runUpload]);

  // uploadSelected previously called setQueue then immediately called uploadAll,
  // but the queue state update hadn't flushed yet so uploadAll would read the
  // stale queue. Fixed by computing the pending list directly from the current
  // queue snapshot and passing it to runUpload.
  const uploadSelected = useCallback(
    async ids => {
      const pending = queue.filter(
        item => ids.includes(item.id) && (item.status === 'queued' || item.status === 'error')
      );
      await runUpload(pending);
    },
    [queue, runUpload]
  );

  // ─── Export ────────────────────────────────────────────────────────────────
  const bulkExport = useCallback(async (ids, format, onDone) => {
    setExportLoading(true);
    const { data, error } = await bulkExportDocs(ids);
    setExportLoading(false);
    if (error || !data) return;
    onDone?.(data, format);
  }, []);

  // ─── Selection ─────────────────────────────────────────────────────────────
  const toggleSelected = useCallback(id => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }, []);

  const selectAll = useCallback(() => setSelectedIds(docs.map(d => d.id)), [docs]);
  const clearSelection = useCallback(() => setSelectedIds([]), []);

  // ─── Bookmarks ─────────────────────────────────────────────────────────────
  const toggleBookmark = useCallback(id => {
    setBookmarks(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isBookmarked = useCallback(id => bookmarks.includes(id), [bookmarks]);

  return {
    // Docs
    docs,
    totalDocs,
    loading,
    docsError,
    loadDocs,
    // Filters
    filters,
    setFilter,
    resetFilters,
    // Pagination
    page,
    setPage,
    // Queue
    queue,
    addToQueue,
    removeFromQueue,
    clearQueue,
    updateQueueItem,
    setBulkCategory,
    removeErrored,
    // Upload
    uploading,
    uploadProgress,
    uploadSummary,
    uploadAll,
    uploadSelected,
    // Selection
    selectedIds,
    toggleSelected,
    selectAll,
    clearSelection,
    // Bookmarks
    bookmarks,
    toggleBookmark,
    isBookmarked,
    // Export
    exportLoading,
    bulkExport,
  };
}
