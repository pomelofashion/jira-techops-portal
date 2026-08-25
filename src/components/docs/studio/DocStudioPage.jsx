// src/components/docs/studio/DocStudioPage.jsx
// Documentation Studio — Confluence-style authoring workspace (admin only).
// Page list, metadata, split editor + live preview, CRUD, per-user draft
// autosave, rich toolbar + slash menu (RichTextarea), starter templates,
// table-of-contents outline, and version history with diff/restore.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  listDocs,
  createDoc,
  updateDoc,
  deleteDoc,
  snapshotDoc,
  restoreDocVersion,
} from '../../../api/docsApi.js';
import { DOC_CATEGORIES } from '../../../mocks/docsMockData.js';
import { MarkdownView } from '../MarkdownView.jsx';
import { loadDraft, saveDraft, clearDraftKey } from '../../../lib/localDraft.js';
import RichTextarea from './RichTextarea.jsx';
import TableOfContents from './TableOfContents.jsx';
import VersionHistory from './VersionHistory.jsx';
import TemplatePicker from './TemplatePicker.jsx';

const VISIBILITY_OPTIONS = ['Public', 'IT Team Only'];
const ICONS = [
  '📝',
  '📄',
  '📘',
  '📙',
  '📗',
  '🔒',
  '🛡️',
  '💻',
  '🖥️',
  '☁️',
  '🚀',
  '⚙️',
  '📡',
  '🧭',
  '⚖️',
  '🔥',
];

const EMPTY_PAGE = {
  id: null,
  title: '',
  category: 'Other',
  visibility: 'Public',
  tags: '',
  description: '',
  icon: '📝',
  content: '',
};

const draftKeyFor = (email, id) => `studio:${email || 'anon'}:${id || 'new'}`;
const formFromDoc = doc => ({
  id: doc.id,
  title: doc.title || '',
  category: doc.category || 'Other',
  visibility: doc.visibility || 'Public',
  tags: (doc.tags || []).join(', '),
  description: doc.description || '',
  icon: doc.icon || '📝',
  content: doc.content || '',
});

const card = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-default)',
  borderRadius: '12px',
};
const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '7px',
  border: '1px solid var(--border-default)',
  background: 'var(--bg-page)',
  color: 'var(--text-primary)',
  fontSize: '13px',
  fontFamily: "'Inter', sans-serif",
};
const labelStyle = {
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '4px',
  display: 'block',
};

export default function DocStudioPage({ currentUser, role, onToast }) {
  const email = currentUser?.email || 'anon';

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null); // null = no selection; 'new' = unsaved new page
  const [form, setForm] = useState(EMPTY_PAGE);
  const [baseline, setBaseline] = useState(EMPTY_PAGE);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('split'); // 'edit' | 'split' | 'preview'
  const [panel, setPanel] = useState('toc'); // 'toc' | 'history'
  const [showTemplates, setShowTemplates] = useState(false);
  const [historyKey, setHistoryKey] = useState(0); // bump to refresh VersionHistory
  const [sidebarOpen, setSidebarOpen] = useState(true); // page-list rail (collapsible in full-width mode)
  const [focusMode, setFocusMode] = useState(false); // distraction-free editing (Esc exits)
  const syncingRef = useRef(false); // guards editor→preview scroll mirroring
  const taRef = useRef(null);
  const previewRef = useRef(null);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline]);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await listDocs({ role, limit: 200 });
    setDocs(res.data?.docs || []);
    setLoading(false);
  }, [role]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Autosave the working draft whenever it diverges from the saved baseline.
  useEffect(() => {
    if (activeId == null) return;
    if (dirty) saveDraft(draftKeyFor(email, form.id), form);
  }, [form, dirty, activeId, email]);

  const openDoc = doc => {
    const base = formFromDoc(doc);
    const draft = loadDraft(draftKeyFor(email, doc.id), null); // silent restore of unsaved edits
    setBaseline(base);
    setForm(draft && typeof draft === 'object' ? { ...base, ...draft } : base);
    setActiveId(doc.id);
    setMode('split');
  };

  const newPage = () => setShowTemplates(true);

  const pickTemplate = tpl => {
    setShowTemplates(false);
    clearDraftKey(draftKeyFor(email, null)); // start the new page fresh from the template
    const base = {
      ...EMPTY_PAGE,
      content: tpl.content || '',
      category: tpl.category || 'Other',
      icon: tpl.icon || '📝',
    };
    setBaseline(EMPTY_PAGE); // anything typed (incl. template body) counts as unsaved
    setForm(base);
    setActiveId('new');
    setMode('split');
    setTimeout(() => taRef.current?.focus(), 50);
  };

  const jumpToHeading = id => {
    const el = previewRef.current?.querySelector(`[id="${id}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Proportional editor→preview scroll sync in split mode (one-directional).
  const onEditorScroll = () => {
    if (mode !== 'split') return;
    const ta = taRef.current;
    const pv = previewRef.current;
    if (!ta || !pv || syncingRef.current) return;
    syncingRef.current = true;
    const ratio = ta.scrollTop / Math.max(1, ta.scrollHeight - ta.clientHeight);
    pv.scrollTop = ratio * Math.max(0, pv.scrollHeight - pv.clientHeight);
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim()) {
      onToast?.('Add a title before saving.', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      content: form.content,
      category: form.category,
      visibility: form.visibility,
      description: form.description,
      icon: form.icon,
      tags: form.tags,
      author: currentUser?.name || 'Unknown',
    };
    let res;
    if (form.id) {
      // Snapshot the previous saved state for version history before overwriting.
      await snapshotDoc(form.id, currentUser?.name);
      res = await updateDoc(form.id, {
        ...payload,
        tags: payload.tags
          .split(',')
          .map(t => t.trim())
          .filter(Boolean),
      });
    } else {
      res = await createDoc(payload);
    }
    setSaving(false);
    if (res.error) {
      onToast?.(res.error, 'error');
      return;
    }
    const savedDoc = res.data;
    clearDraftKey(draftKeyFor(email, form.id)); // null id maps to the 'new' key, so this covers both
    onToast?.(`Saved “${savedDoc.title}”.`);
    const base = formFromDoc(savedDoc);
    setBaseline(base);
    setForm(base);
    setActiveId(savedDoc.id);
    setHistoryKey(k => k + 1);
    await reload();
  };

  const restoreVersion = async snap => {
    if (!form.id) return;
    setSaving(true);
    const res = await restoreDocVersion(form.id, snap.versionId, currentUser?.name);
    setSaving(false);
    if (res.error) {
      onToast?.(res.error, 'error');
      return;
    }
    const base = formFromDoc(res.data);
    setBaseline(base);
    setForm(base);
    clearDraftKey(draftKeyFor(email, form.id));
    setHistoryKey(k => k + 1);
    onToast?.('Version restored.');
    await reload();
  };

  const archive = async () => {
    if (!form.id) {
      // discard an unsaved new page
      clearDraftKey(draftKeyFor(email, null));
      setActiveId(null);
      setForm(EMPTY_PAGE);
      setBaseline(EMPTY_PAGE);
      return;
    }
    setSaving(true);
    const res = await deleteDoc(form.id);
    setSaving(false);
    if (res.error) {
      onToast?.(res.error, 'error');
      return;
    }
    clearDraftKey(draftKeyFor(email, form.id));
    onToast?.(`Archived “${form.title}”.`);
    setActiveId(null);
    setForm(EMPTY_PAGE);
    setBaseline(EMPTY_PAGE);
    await reload();
  };

  const filtered = docs.filter(d => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return d.title.toLowerCase().includes(q) || (d.category || '').toLowerCase().includes(q);
  });

  // ⌘S / Ctrl+S saves the open page; Escape leaves focus mode.
  // No dependency array on purpose: the handler closes over fresh state each render.
  useEffect(() => {
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (activeId != null && dirty && !saving) save();
        return;
      }
      if (e.key === 'Escape' && focusMode) setFocusMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div style={{ display: 'flex', gap: '16px', minHeight: 'calc(100vh - 160px)' }}>
      {/* ── Page list sidebar ── */}
      {!focusMode && (
        <aside
          style={{
            ...card,
            width: sidebarOpen ? '280px' : '44px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              title="Expand page list"
              aria-label="Expand page list"
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                padding: '14px 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              <span aria-hidden="true" style={{ fontSize: '13px' }}>
                ▸
              </span>
              <span
                style={{
                  writingMode: 'vertical-rl',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: 'var(--text-muted)',
                }}
              >
                PAGES
              </span>
            </button>
          )}
          {sidebarOpen && (
            <>
              <div style={{ padding: '14px 14px 10px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '2px',
                  }}
                >
                  <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--text-primary)' }}>
                    📚 Doc Studio
                  </div>
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    title="Collapse page list"
                    aria-label="Collapse page list"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      fontSize: '13px',
                      padding: '2px 5px',
                      borderRadius: '4px',
                    }}
                  >
                    ◂
                  </button>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Author &amp; edit documentation
                </div>
                <button
                  onClick={newPage}
                  style={{
                    marginTop: '12px',
                    width: '100%',
                    padding: '9px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    background: 'var(--accent-primary)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '13px',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  + New Page
                </button>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search pages…"
                  style={{ ...inputStyle, marginTop: '10px' }}
                />
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 10px' }}>
                {loading && (
                  <div style={{ padding: '14px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    Loading…
                  </div>
                )}
                {!loading && filtered.length === 0 && (
                  <div style={{ padding: '14px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    No pages found.
                  </div>
                )}
                {filtered.map(d => {
                  const isActive = d.id === activeId;
                  return (
                    <button
                      key={d.id}
                      onClick={() => openDoc(d)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                        marginBottom: '2px',
                        background: isActive ? 'var(--accent-soft)' : 'transparent',
                      }}
                    >
                      <span style={{ fontSize: '16px', flexShrink: 0 }}>{d.icon || '📝'}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            display: 'block',
                            fontSize: '13px',
                            fontWeight: isActive ? 700 : 500,
                            color: 'var(--text-primary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {d.title}
                        </span>
                        <span
                          style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}
                        >
                          {d.category}
                          {d.status === 'Archived' ? ' · Archived' : ''}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </aside>
      )}

      {/* ── Editor / empty state ── */}
      <section
        style={{
          flex: 1,
          minWidth: 0,
          // Focus mode centers a comfortable writing column.
          maxWidth: focusMode ? '920px' : undefined,
          margin: focusMode ? '0 auto' : undefined,
          width: '100%',
        }}
      >
        {activeId == null ? (
          <div
            style={{
              ...card,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              color: 'var(--text-muted)',
            }}
          >
            <div style={{ fontSize: '40px' }}>📝</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Select a page to edit, or create a new one
            </div>
            <button
              onClick={newPage}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: '1px solid var(--accent-primary)',
                background: 'var(--accent-soft)',
                color: 'var(--accent-primary)',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              + New Page
            </button>
          </div>
        ) : (
          <div style={{ ...card, display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Toolbar / header */}
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-default)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap',
              }}
            >
              <select
                value={form.icon}
                onChange={e => setField('icon', e.target.value)}
                aria-label="Page icon"
                style={{
                  ...inputStyle,
                  width: '52px',
                  fontSize: '18px',
                  textAlign: 'center',
                  padding: '6px',
                }}
              >
                {ICONS.map(ic => (
                  <option key={ic} value={ic}>
                    {ic}
                  </option>
                ))}
              </select>
              <input
                value={form.title}
                onChange={e => setField('title', e.target.value)}
                placeholder="Page title"
                aria-label="Page title"
                style={{
                  ...inputStyle,
                  flex: 1,
                  minWidth: '180px',
                  fontSize: '16px',
                  fontWeight: 700,
                }}
              />
              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                  background: 'var(--bg-page)',
                  borderRadius: '8px',
                  padding: '3px',
                }}
              >
                {['edit', 'split', 'preview'].map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    style={{
                      padding: '5px 11px',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      background: mode === m ? 'var(--accent-primary)' : 'transparent',
                      color: mode === m ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setFocusMode(f => !f)}
                title={focusMode ? 'Exit focus mode (Esc)' : 'Focus mode — hide panels'}
                aria-pressed={focusMode}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: `1px solid ${focusMode ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                  background: focusMode ? 'var(--accent-soft)' : 'transparent',
                  color: focusMode ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                ⛶ Focus
              </button>
              {dirty && (
                <span style={{ fontSize: '11px', color: '#D97706', fontWeight: 700 }}>
                  ● Unsaved
                </span>
              )}
              <button
                onClick={save}
                disabled={saving}
                title="Save (⌘S)"
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  background: 'var(--accent-primary)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '13px',
                  opacity: saving ? 0.5 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={archive}
                disabled={saving}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-default)',
                  cursor: 'pointer',
                  background: 'var(--bg-surface)',
                  color: '#DC2626',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                {form.id ? 'Archive' : 'Discard'}
              </button>
            </div>

            {/* Metadata row */}
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '10px',
              }}
            >
              <div>
                <label style={labelStyle}>Category</label>
                <select
                  value={form.category}
                  onChange={e => setField('category', e.target.value)}
                  style={inputStyle}
                >
                  {DOC_CATEGORIES.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Visibility</label>
                <select
                  value={form.visibility}
                  onChange={e => setField('visibility', e.target.value)}
                  style={inputStyle}
                >
                  {VISIBILITY_OPTIONS.map(v => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Tags (comma-separated)</label>
                <input
                  value={form.tags}
                  onChange={e => setField('tags', e.target.value)}
                  placeholder="vpn, security"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Short description</label>
                <input
                  value={form.description}
                  onChange={e => setField('description', e.target.value)}
                  placeholder="One-line summary"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Editor body */}
            <div style={{ flex: 1, display: 'flex', minHeight: '340px', overflow: 'hidden' }}>
              {mode !== 'preview' && (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    minWidth: 0,
                    borderRight: mode === 'split' ? '1px solid var(--border-default)' : 'none',
                  }}
                >
                  <RichTextarea
                    taRef={taRef}
                    value={form.content}
                    onChange={v => setField('content', v)}
                    onNotify={onToast}
                    onScroll={onEditorScroll}
                    placeholder={
                      '# Heading\n\nWrite your documentation in Markdown…\n\nType / for blocks, or use the toolbar above.'
                    }
                  />
                </div>
              )}
              {mode !== 'edit' && (
                <div
                  ref={previewRef}
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '18px 24px',
                    background: 'var(--bg-surface)',
                  }}
                >
                  {/* Cap the measure at ~72ch so full-width mode stays readable. */}
                  <div style={{ maxWidth: '72ch', margin: '0 auto', width: '100%' }}>
                    {form.title && (
                      <h1
                        style={{
                          fontSize: '24px',
                          fontWeight: 900,
                          color: 'var(--text-primary)',
                          margin: '0 0 14px',
                        }}
                      >
                        {form.title}
                      </h1>
                    )}
                    <MarkdownView content={form.content} skipH1 />
                    {!form.content && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                        Nothing to preview yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Right panel — Outline / Version history */}
              {!focusMode && (
                <div
                  style={{
                    width: '252px',
                    flexShrink: 0,
                    borderLeft: '1px solid var(--border-default)',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--bg-surface)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: '4px',
                      padding: '8px',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    {[
                      ['toc', 'Outline'],
                      ['history', 'History'],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setPanel(id)}
                        style={{
                          flex: 1,
                          padding: '6px',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 700,
                          background: panel === id ? 'var(--accent-soft)' : 'transparent',
                          color: panel === id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                    {panel === 'toc' ? (
                      <TableOfContents content={form.content} onJump={jumpToHeading} />
                    ) : (
                      <VersionHistory
                        docId={form.id}
                        currentContent={form.content}
                        onRestore={restoreVersion}
                        refreshKey={historyKey}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {showTemplates && (
        <TemplatePicker onPick={pickTemplate} onClose={() => setShowTemplates(false)} />
      )}
    </div>
  );
}
