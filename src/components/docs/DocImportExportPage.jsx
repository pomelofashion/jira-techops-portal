// src/components/docs/DocImportExportPage.jsx
// Full upgraded Documentation page — replaces the existing DocsPage.
// Assembles DocCard, DocUploader, DocExporter, DocAdminPanel with useDocumentManager.

import { useState, useEffect, useRef } from 'react';
import useDocumentManager from '../../hooks/useDocumentManager.js';
import DocCard from './DocCard.jsx';
import DocUploader from './DocUploader.jsx';
import DocAdminPanel from './DocAdminPanel.jsx';
import { bulkZipExport } from './DocExporter.jsx';
import { DOC_CATEGORIES } from '../../mocks/docsMockData.js';
import {
  bulkArchive,
  updateDoc,
  snapshotDoc,
  pinDoc,
  markNeedsReview,
  clearReview,
  restoreDoc,
} from '../../api/docsApi.js';
import FilePreviewCard from '../FilePreviewCard.jsx';
import { MarkdownView, extractHeadings } from './MarkdownView.jsx';
import RichTextarea from './studio/RichTextarea.jsx';

const VISIBILITY_OPTIONS = ['Public', 'IT Team Only'];

// Icon choices for the inline editor (moved from the retired DocEditModal).
const ICON_OPTIONS = [
  '📄',
  '📝',
  '⬇️',
  '📃',
  '📊',
  '📈',
  '📑',
  '🔒',
  '🛡️',
  '💻',
  '🖥️',
  '☁️',
  '🔐',
  '💬',
  '📋',
  '📡',
  '🏷️',
  '🚀',
  '📂',
  '📌',
];

// ─── Skeleton Card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: '10px',
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background:
              'linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-elevated) 50%, var(--bg-hover) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.4s infinite',
          }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              height: '14px',
              borderRadius: '4px',
              background:
                'linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-elevated) 50%, var(--bg-hover) 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.4s infinite',
              marginBottom: '8px',
              width: '70%',
            }}
          />
          <div
            style={{
              height: '10px',
              borderRadius: '4px',
              background:
                'linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-elevated) 50%, var(--bg-hover) 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.4s infinite',
              width: '40%',
            }}
          />
        </div>
      </div>
      <div
        style={{
          height: '12px',
          borderRadius: '4px',
          background:
            'linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-elevated) 50%, var(--bg-hover) 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s infinite',
          width: '100%',
        }}
      />
      <div
        style={{
          height: '12px',
          borderRadius: '4px',
          background:
            'linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-elevated) 50%, var(--bg-hover) 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s infinite',
          width: '80%',
        }}
      />
    </div>
  );
}

// ─── Command Palette ───────────────────────────────────────────────────────────
function CmdPalette({ docs, onSelectDoc, onAction, onClose: _onClose }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const QUICK_ACTIONS = [
    { id: 'upload', label: '↑ Upload documents', icon: '📤' },
    { id: 'manage', label: '⚙ Manage docs (admin)', icon: '🗂️' },
    { id: 'select', label: '☑ Enter selection mode', icon: '✅' },
  ];

  const matchedDocs =
    query.length > 0
      ? docs
          .filter(
            d =>
              d.title.toLowerCase().includes(query.toLowerCase()) ||
              (d.description || '').toLowerCase().includes(query.toLowerCase()) ||
              (d.content || '').toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, 6)
      : [];

  const actions =
    query.length === 0
      ? QUICK_ACTIONS
      : QUICK_ACTIONS.filter(a => a.label.toLowerCase().includes(query.toLowerCase()));
  const allItems = [
    ...matchedDocs.map(d => ({ type: 'doc', ...d })),
    ...actions.map(a => ({ type: 'action', ...a })),
  ];

  const handleKey = e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => Math.min(c + 1, allItems.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => Math.max(c - 1, 0));
    }
    if (e.key === 'Enter' && allItems[cursor]) {
      const item = allItems[cursor];
      if (item.type === 'doc') onSelectDoc(item);
      else onAction(item.id);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: '20%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '560px',
        maxWidth: '95vw',
        background: 'var(--bg-elevated)',
        borderRadius: '16px',
        boxShadow: '0 24px 72px rgba(0,0,0,0.28)',
        zIndex: 801,
        overflow: 'hidden',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <span style={{ fontSize: '18px' }}>🔍</span>
        <input
          ref={inputRef}
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={handleKey}
          placeholder="Search docs or type a command…"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            fontSize: '15px',
            color: 'var(--text-primary)',
            fontFamily: "'Inter', sans-serif",
            background: 'transparent',
          }}
        />
        <kbd
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            background: 'var(--bg-hover)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontFamily: 'monospace',
          }}
        >
          ESC
        </kbd>
      </div>
      <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
        {allItems.length === 0 && (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '13px',
            }}
          >
            No results for "{query}"
          </div>
        )}
        {matchedDocs.length > 0 && (
          <div style={{ padding: '8px 0 4px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '0 18px 6px',
              }}
            >
              Documents
            </div>
            {matchedDocs.map((doc, idx) => (
              <div
                key={doc.id}
                onClick={() => onSelectDoc(doc)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 18px',
                  cursor: 'pointer',
                  background: cursor === idx ? 'rgba(234, 88, 12, 0.10)' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={() => setCursor(idx)}
              >
                <span style={{ fontSize: '20px' }}>{doc.icon || '📄'}</span>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {doc.title}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {doc.category} · {doc.format}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {actions.length > 0 && (
          <div style={{ padding: '8px 0' }}>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '0 18px 6px',
              }}
            >
              Quick Actions
            </div>
            {actions.map((action, idx) => {
              const globalIdx = matchedDocs.length + idx;
              return (
                <div
                  key={action.id}
                  onClick={() => onAction(action.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 18px',
                    cursor: 'pointer',
                    background: cursor === globalIdx ? 'rgba(234, 88, 12, 0.10)' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={() => setCursor(globalIdx)}
                >
                  <span style={{ fontSize: '18px' }}>{action.icon}</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {action.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div
        style={{
          padding: '8px 18px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-page)',
          display: 'flex',
          gap: '16px',
        }}
      >
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          <kbd style={{ fontFamily: 'monospace' }}>↑↓</kbd> navigate
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          <kbd style={{ fontFamily: 'monospace' }}>↵</kbd> select
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          <kbd style={{ fontFamily: 'monospace' }}>⌘K</kbd> toggle
        </span>
      </div>
    </div>
  );
}

// ─── Uploader modal wrapper ────────────────────────────────────────────────────
function UploaderModal({ manager, onClose, currentUser }) {
  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500 }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          background: 'var(--bg-elevated)',
          borderRadius: '16px',
          zIndex: 501,
          width: '720px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          boxShadow: '0 24px 72px rgba(0,0,0,0.22)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div
          style={{
            background: 'var(--text-primary)',
            padding: '18px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ color: '#fff', fontWeight: 900, fontSize: '16px' }}>Upload Documents</div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '12px', marginTop: '2px' }}>
              Drag files or click to browse — PDF, DOCX, MD, TXT, CSV and more
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              fontSize: '22px',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <DocUploader
            queue={manager.queue}
            addToQueue={manager.addToQueue}
            currentUser={currentUser}
            removeFromQueue={manager.removeFromQueue}
            clearQueue={manager.clearQueue}
            updateQueueItem={manager.updateQueueItem}
            setBulkCategory={manager.setBulkCategory}
            removeErrored={manager.removeErrored}
            uploading={manager.uploading}
            uploadProgress={manager.uploadProgress}
            uploadSummary={manager.uploadSummary}
            uploadAll={manager.uploadAll}
          />
        </div>
      </div>
    </>
  );
}

// ─── Full-page article reader ──────────────────────────────────────────────────
// ─── Inline editor ─────────────────────────────────────────────────────────────
// Replaces the old DocEditModal popup: editing happens directly on the
// full-page reader. Content uses the Studio's RichTextarea (slash menu,
// toolbar, table blocks); a snapshot is taken before each save so inline
// edits get version history like the Studio.
function DocInlineEditor({ doc, onCancel, onSaved }) {
  const [form, setForm] = useState({
    title: doc.title || '',
    description: doc.description || '',
    category: doc.category || 'Other',
    tags: (doc.tags || []).join(', '),
    author: doc.author || '',
    visibility: doc.visibility || 'Public',
    icon: doc.icon || '📄',
    content: doc.content || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const taRef = useRef(null);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    setError('');
    await snapshotDoc(doc.id, form.author || doc.author || 'Unknown');
    const updates = {
      ...form,
      tags: form.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean),
    };
    const { error: apiError } = await updateDoc(doc.id, updates);
    setSaving(false);
    if (apiError) {
      setError(apiError);
      return;
    }
    onSaved(updates);
  };

  const inputStyle = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1.5px solid var(--border-default)',
    fontSize: '13px',
    fontFamily: "'Inter', sans-serif",
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
  };
  const labelStyle = {
    display: 'block',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '5px',
  };
  const modeBtn = active => ({
    padding: '6px 14px',
    border: 'none',
    borderRadius: '6px',
    background: active ? 'var(--bg-elevated)' : 'transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
    boxShadow: active ? 'var(--shadow-card)' : 'none',
  });

  return (
    <div>
      {/* Title row: icon picker + title + save/cancel */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowIconPicker(v => !v)}
            aria-label="Choose icon"
            style={{
              fontSize: '24px',
              padding: '8px 10px',
              background: 'var(--bg-elevated)',
              border: '1.5px solid var(--border-default)',
              borderRadius: '10px',
              cursor: 'pointer',
            }}
          >
            {form.icon}
          </button>
          {showIconPicker && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                zIndex: 30,
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '4px',
                padding: '10px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: '10px',
                boxShadow: 'var(--shadow-dropdown)',
              }}
            >
              {ICON_OPTIONS.map(ic => (
                <button
                  key={ic}
                  onClick={() => {
                    setForm(f => ({ ...f, icon: ic }));
                    setShowIconPicker(false);
                  }}
                  style={{
                    fontSize: '20px',
                    padding: '6px',
                    background: ic === form.icon ? 'var(--accent-soft)' : 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  {ic}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          value={form.title}
          onChange={set('title')}
          placeholder="Document title"
          aria-label="Document title"
          style={{ ...inputStyle, fontSize: '20px', fontWeight: 800, flex: 1 }}
        />
        <button
          onClick={onCancel}
          disabled={saving}
          style={{
            padding: '9px 16px',
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            border: '1.5px solid var(--border-default)',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '9px 18px',
            background: 'var(--accent-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.7 : 1,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '8px 12px',
            marginBottom: '12px',
            borderRadius: '8px',
            background: 'rgba(220, 38, 38, 0.1)',
            border: '1px solid rgba(220, 38, 38, 0.35)',
            color: '#DC2626',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {/* Meta strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr',
          gap: '12px',
          marginBottom: '12px',
        }}
      >
        <div>
          <label style={labelStyle}>Description</label>
          <input
            value={form.description}
            onChange={set('description')}
            placeholder="One-line summary"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Category</label>
          <select value={form.category} onChange={set('category')} style={inputStyle}>
            {DOC_CATEGORIES.filter(c => c !== 'All').map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Visibility</label>
          <select value={form.visibility} onChange={set('visibility')} style={inputStyle}>
            {VISIBILITY_OPTIONS.map(v => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div>
          <label style={labelStyle}>Tags (comma-separated)</label>
          <input
            value={form.tags}
            onChange={set('tags')}
            placeholder="network, vpn, onboarding"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Author</label>
          <input value={form.author} onChange={set('author')} style={inputStyle} />
        </div>
      </div>

      {/* Write / Preview toggle */}
      <div
        style={{
          display: 'inline-flex',
          gap: '2px',
          padding: '3px',
          background: 'var(--bg-hover)',
          borderRadius: '8px',
          marginBottom: '10px',
        }}
      >
        <button onClick={() => setPreview(false)} style={modeBtn(!preview)}>
          ✍️ Write
        </button>
        <button onClick={() => setPreview(true)} style={modeBtn(preview)}>
          👁 Preview
        </button>
      </div>

      {preview ? (
        <div
          style={{
            border: '1.5px solid var(--border-default)',
            borderRadius: '10px',
            padding: '20px 24px',
            minHeight: '420px',
            background: 'var(--bg-surface)',
          }}
        >
          <MarkdownView content={form.content} />
        </div>
      ) : (
        <RichTextarea
          taRef={taRef}
          value={form.content}
          onChange={v => setForm(f => ({ ...f, content: v }))}
          placeholder={'Write your documentation in Markdown…\n\nType / for blocks.'}
          style={{ minHeight: '420px' }}
        />
      )}
    </div>
  );
}

function DocFullPage({ doc, allDocs, onClose, onSelect, canEdit, startInEdit, onSaved }) {
  const otherDocs = allDocs.filter(d => d.id !== doc.id);
  const [scrollPct, setScrollPct] = useState(0);
  const [heroImageFailed, setHeroImageFailed] = useState(false);
  const [editing, setEditing] = useState(Boolean(startInEdit && canEdit));
  const contentRef = useRef(null);

  const wordCount = (doc.content || '').split(/\s+/).filter(Boolean).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  const handleScroll = e => {
    const el = e.currentTarget;
    const pct = Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100);
    setScrollPct(Math.min(100, pct || 0));
  };

  // Slug ids from MarkdownView so TOC anchors match the rendered headings.
  const tocItems = extractHeadings(doc.content).filter(h => h.level === 2 || h.level === 3);

  const [sidebarTab, setSidebarTab] = useState(tocItems.length > 0 ? 'toc' : 'docs');

  const docIndex = allDocs.findIndex(d => d.id === doc.id);
  const prevDoc = docIndex > 0 ? allDocs[docIndex - 1] : null;
  const nextDoc = docIndex < allDocs.length - 1 ? allDocs[docIndex + 1] : null;

  return (
    <div style={{ display: 'flex', minHeight: '100%' }}>
      {/* Sidebar */}
      <div
        style={{
          width: '260px',
          flexShrink: 0,
          borderRight: '1px solid var(--border-default)',
          padding: '28px 16px',
          background: 'var(--bg-page)',
        }}
      >
        <button
          onClick={onClose}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            color: 'var(--accent-primary)',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            marginBottom: '20px',
            padding: 0,
          }}
        >
          ← Back to library
        </button>

        {/* Sidebar tabs */}
        {tocItems.length > 0 && (
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--border-default)',
              marginBottom: '12px',
            }}
          >
            <button
              onClick={() => setSidebarTab('toc')}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                background: 'none',
                fontSize: '11px',
                fontWeight: 700,
                color: sidebarTab === 'toc' ? 'var(--accent-primary)' : 'var(--text-muted)',
                borderBottom:
                  sidebarTab === 'toc'
                    ? '2px solid var(--accent-primary)'
                    : '2px solid transparent',
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              Contents
            </button>
            <button
              onClick={() => setSidebarTab('docs')}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                background: 'none',
                fontSize: '11px',
                fontWeight: 700,
                color: sidebarTab === 'docs' ? 'var(--accent-primary)' : 'var(--text-muted)',
                borderBottom:
                  sidebarTab === 'docs'
                    ? '2px solid var(--accent-primary)'
                    : '2px solid transparent',
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              All Docs
            </button>
          </div>
        )}

        {sidebarTab === 'toc' &&
          tocItems.map(item => (
            <a
              key={item.id}
              href={`#${item.id}`}
              style={{
                display: 'block',
                padding: `6px 8px 6px ${item.level === 3 ? '20px' : '8px'}`,
                fontSize: '12px',
                color: 'var(--text-primary)',
                fontWeight: item.level === 2 ? 700 : 400,
                textDecoration: 'none',
                borderRadius: '6px',
                marginBottom: '2px',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-soft)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {item.text}
            </a>
          ))}

        {(sidebarTab === 'docs' || tocItems.length === 0) && (
          <>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '10px',
              }}
            >
              All Documents
            </div>
            {otherDocs.map(d => (
              <button
                key={d.id}
                onClick={() => onSelect(d)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  marginBottom: '2px',
                  fontFamily: "'Inter', sans-serif",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-soft)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {d.icon} {d.title}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {d.category}
                </div>
              </button>
            ))}
          </>
        )}
      </div>

      {/* Article content */}
      <div
        ref={contentRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', height: 'calc(100vh - 120px)', position: 'relative' }}
      >
        {/* Scroll progress bar */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: 'var(--border-default)',
            zIndex: 10,
          }}
        >
          <div
            style={{
              height: '3px',
              background: 'var(--accent-primary)',
              width: `${scrollPct}%`,
              transition: 'width 0.1s',
            }}
          />
        </div>

        <div style={{ padding: '36px 40px', maxWidth: editing ? '980px' : '780px' }}>
          {editing ? (
            <DocInlineEditor
              doc={doc}
              onCancel={() => setEditing(false)}
              onSaved={updates => {
                setEditing(false);
                onSaved?.(updates);
              }}
            />
          ) : (
            <>
              <div
                style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: '100px',
                    background: 'var(--bg-hover)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {doc.category}
                </span>
                {doc.version && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: '4px',
                      background: 'rgba(59, 130, 246, 0.12)',
                      color: '#2563EB',
                      border: '1px solid #BFDBFE',
                    }}
                  >
                    v{doc.version}
                  </span>
                )}
                {canEdit && (
                  <button
                    onClick={() => setEditing(true)}
                    aria-label="Edit document"
                    style={{
                      marginLeft: 'auto',
                      padding: '6px 14px',
                      background: 'var(--accent-primary)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    ✏️ Edit
                  </button>
                )}
              </div>
              <h1
                style={{
                  fontSize: '30px',
                  fontWeight: 900,
                  color: 'var(--text-primary)',
                  marginBottom: '8px',
                  lineHeight: 1.2,
                }}
              >
                {doc.icon} {doc.title}
              </h1>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                {doc.author && `By ${doc.author}`}
                {doc.author && doc.updatedAt && ' · '}
                {doc.updatedAt &&
                  `Updated ${new Date(doc.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`}
              </div>
              {/* Reading time + scroll progress badge */}
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center',
                  marginTop: '6px',
                  marginBottom: '20px',
                }}
              >
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  📖 {readingTime} min read
                </span>
                {scrollPct > 5 && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    · {scrollPct}% read
                  </span>
                )}
              </div>
              {/* Source-file preview — admins/users can click to open the original
              file in a new browser tab. Hidden when no source was captured. */}
              {doc.sourceFile && (
                <div style={{ marginBottom: '20px' }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: '8px',
                    }}
                  >
                    Original file
                  </div>
                  <FilePreviewCard
                    name={doc.sourceFile.name}
                    size={doc.sourceFile.size}
                    type={doc.sourceFile.type}
                    src={doc.sourceFile.dataUrl}
                  />
                </div>
              )}
              <div
                style={{ borderBottom: '2px solid var(--border-default)', marginBottom: '28px' }}
              />

              {/* Image hero — shown for image-format documents uploaded with a blob URL */}
              {doc.imageUrl && (
                <div style={{ textAlign: 'center', margin: '0 0 28px 0' }}>
                  {heroImageFailed ? (
                    <div
                      style={{
                        padding: '40px 20px',
                        color: 'var(--text-muted)',
                        fontSize: '13px',
                        textAlign: 'center',
                      }}
                    >
                      ⚠️ Image could not be loaded.
                    </div>
                  ) : (
                    <img
                      src={doc.imageUrl}
                      alt={doc.title}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '560px',
                        objectFit: 'contain',
                        borderRadius: '10px',
                        border: '1px solid var(--border-default)',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                      }}
                      onError={() => setHeroImageFailed(true)}
                    />
                  )}
                </div>
              )}

              <MarkdownView content={doc.content} skipH1 />

              {/* Prev/Next navigation */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '48px',
                  paddingTop: '20px',
                  borderTop: '2px solid var(--border-default)',
                  gap: '12px',
                }}
              >
                {prevDoc ? (
                  <button
                    onClick={() => onSelect(prevDoc)}
                    style={{
                      flex: 1,
                      padding: '14px 16px',
                      background: 'var(--bg-page)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontFamily: "'Inter', sans-serif",
                      textAlign: 'left',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        marginBottom: '4px',
                      }}
                    >
                      ← PREVIOUS
                    </div>
                    <div
                      style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}
                    >
                      {prevDoc.icon} {prevDoc.title}
                    </div>
                  </button>
                ) : (
                  <div style={{ flex: 1 }} />
                )}
                {nextDoc ? (
                  <button
                    onClick={() => onSelect(nextDoc)}
                    style={{
                      flex: 1,
                      padding: '14px 16px',
                      background: 'var(--bg-page)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontFamily: "'Inter', sans-serif",
                      textAlign: 'right',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        marginBottom: '4px',
                      }}
                    >
                      NEXT →
                    </div>
                    <div
                      style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}
                    >
                      {nextDoc.icon} {nextDoc.title}
                    </div>
                  </button>
                ) : (
                  <div style={{ flex: 1 }} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────
function DocsSidebar({ docs, bookmarks: _bookmarks, onSelect, isBookmarked }) {
  const bookmarkedDocs = docs.filter(d => isBookmarked(d.id));
  const categories = Array.from(new Set(docs.map(d => d.category)));

  return (
    <div
      style={{
        width: '220px',
        flexShrink: 0,
        borderRight: '1px solid var(--border-default)',
        padding: '28px 16px',
        background: 'var(--bg-page)',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '10px',
        }}
      >
        Categories
      </div>
      {categories.map(cat => {
        const count = docs.filter(d => d.category === cat).length;
        return (
          <div
            key={cat}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 8px',
              borderRadius: '7px',
              marginBottom: '2px',
              cursor: 'pointer',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-soft)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>
              {cat}
            </span>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                background: 'var(--border-default)',
                color: 'var(--text-secondary)',
                padding: '1px 6px',
                borderRadius: '100px',
              }}
            >
              {count}
            </span>
          </div>
        );
      })}

      {bookmarkedDocs.length > 0 && (
        <>
          <div style={{ borderTop: '1px solid var(--border-default)', margin: '16px 0 12px' }} />
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '10px',
            }}
          >
            ★ Bookmarked
          </div>
          {bookmarkedDocs.map(d => (
            <button
              key={d.id}
              onClick={() => onSelect(d)}
              aria-label={`Open bookmark: ${d.title}`}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '7px 8px',
                borderRadius: '7px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                marginBottom: '2px',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-soft)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {d.icon} {d.title}
              </div>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Archive confirm modal ─────────────────────────────────────────────────────
function ArchiveConfirmModal({ count, onCancel, onConfirm, working }) {
  return (
    <>
      <div
        onClick={onCancel}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 600 }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          background: 'var(--bg-elevated)',
          borderRadius: '14px',
          zIndex: 601,
          width: '420px',
          maxWidth: '94vw',
          boxShadow: '0 24px 72px rgba(0,0,0,0.22)',
          padding: '28px 28px 24px',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ fontSize: '32px', marginBottom: '12px', textAlign: 'center' }}>🗑️</div>
        <div
          style={{
            fontSize: '18px',
            fontWeight: 900,
            color: 'var(--text-primary)',
            textAlign: 'center',
            marginBottom: '8px',
          }}
        >
          Archive {count} document{count !== 1 ? 's' : ''}?
        </div>
        <div
          style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            textAlign: 'center',
            lineHeight: 1.6,
            marginBottom: '24px',
          }}
        >
          Archived docs are hidden from the library but can be restored in Manage Docs.
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onCancel}
            disabled={working}
            style={{
              flex: 1,
              padding: '11px',
              background: 'transparent',
              border: '1.5px solid var(--border-default)',
              borderRadius: '8px',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={working}
            style={{
              flex: 1,
              padding: '11px',
              background: working ? 'var(--border-strong)' : '#DC2626',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: '14px',
              cursor: working ? 'not-allowed' : 'pointer',
            }}
          >
            {working ? 'Archiving…' : 'Archive'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Archived docs list (admin only) ──────────────────────────────────────────
import { listDocs } from '../../api/docsApi.js';

function ArchivedDocsList({ onRestore }) {
  const [archived, setArchived] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const res = await listDocs({ status: 'Archived', role: 'superadmin', limit: 100 });
    setArchived(res?.data?.docs || []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading archived docs…
      </div>
    );
  }
  if (archived.length === 0) {
    return (
      <div
        style={{
          padding: '40px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          background: 'var(--bg-elevated)',
          borderRadius: '10px',
          border: '1px solid var(--border-default)',
        }}
      >
        📭 No archived documents.
      </div>
    );
  }
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        borderRadius: '12px',
        border: '1px solid var(--border-default)',
        overflow: 'hidden',
      }}
    >
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {archived.map(d => (
          <li
            key={d.id}
            style={{
              padding: '14px 18px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
            }}
          >
            <span style={{ fontSize: '20px' }}>{d.icon || '📄'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '14px' }}>
                {d.title}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {d.category} · archived{' '}
                {d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : ''}
              </div>
            </div>
            <button
              onClick={async () => {
                await onRestore(d);
                await refresh();
              }}
              style={{
                padding: '8px 14px',
                background: 'rgba(22, 163, 74, 0.18)',
                color: '#15803D',
                border: '1px solid #86EFAC',
                borderRadius: '7px',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              ↺ Restore
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Flag-for-review modal (admin only) ───────────────────────────────────────
function FlagReviewModal({ doc, onClose, onConfirm }) {
  const [reviewerName, setReviewerName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const panelRef = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const node = panelRef.current;
    if (!node) return;
    const FOCUSABLE =
      'a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(node.querySelectorAll(FOCUSABLE));
    (focusables()[0] || node).focus({ preventScroll: true });
    const onKey = e => {
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const firstEl = f[0],
        lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    node.addEventListener('keydown', onKey);
    return () => {
      node.removeEventListener('keydown', onKey);
      if (prev?.focus) prev.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const handleKey = e => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const submit = e => {
    e.preventDefault();
    if (!reviewerName.trim()) return;
    onConfirm({ reviewerName: reviewerName.trim(), dueDate: dueDate || null });
  };

  return (
    <>
      <div
        onClick={onClose}
        role="presentation"
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 600 }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Flag ${doc.title} for review`}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          background: 'var(--bg-elevated)',
          borderRadius: '14px',
          zIndex: 601,
          width: '440px',
          maxWidth: '95vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          overflow: 'hidden',
          outline: 'none',
        }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-default)' }}>
          <h2
            style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}
          >
            Flag for review
          </h2>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {doc.title}
          </div>
        </div>
        <form
          onSubmit={submit}
          style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Reviewer
            </span>
            <input
              aria-label="Reviewer name"
              value={reviewerName}
              onChange={e => setReviewerName(e.target.value)}
              placeholder="e.g. Alex Lee"
              style={{
                padding: '10px 14px',
                border: '1.5px solid var(--border-default)',
                borderRadius: '8px',
                fontSize: '13px',
                fontFamily: "'Inter', sans-serif",
                outline: 'none',
              }}
              autoFocus
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Due date (optional)
            </span>
            <input
              aria-label="Due date"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={{
                padding: '10px 14px',
                border: '1.5px solid var(--border-default)',
                borderRadius: '8px',
                fontSize: '13px',
                fontFamily: "'Inter', sans-serif",
                outline: 'none',
              }}
            />
          </label>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 14px',
                background: 'var(--bg-hover)',
                color: 'var(--text-secondary)',
                border: 'none',
                borderRadius: '7px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!reviewerName.trim()}
              style={{
                padding: '8px 16px',
                background: reviewerName.trim() ? 'var(--accent-primary)' : 'var(--border-strong)',
                color: '#fff',
                border: 'none',
                borderRadius: '7px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: reviewerName.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Flag
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── DocImportExportPage ───────────────────────────────────────────────────────
export default function DocImportExportPage({
  role,
  suggestions: _suggestions,
  setSuggestions: _setSuggestions,
  currentUser,
  onDocEdit,
}) {
  const manager = useDocumentManager(role);

  const [activeTab, setActiveTab] = useState('library');
  const [catTab, setCatTab] = useState('All');
  const [fullPageDoc, setFullPageDoc] = useState(null);
  const [fullPageEdit, setFullPageEdit] = useState(false);
  const [sidebarDoc, setSidebarDoc] = useState(null);
  const [showUploader, setShowUploader] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [showExportPicker, setShowExportPicker] = useState(false);
  const [exportAllFormat, setExportAllFormat] = useState('MD');

  // ── Enhanced search state ────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchDebounceTimer = useRef(null);

  const handleSearchChange = val => {
    setSearchQuery(val);
    clearTimeout(searchDebounceTimer.current);
    searchDebounceTimer.current = setTimeout(() => setDebouncedQuery(val), 200);
  };

  // Clear the debounce timer on unmount to prevent state updates on an
  // unmounted component.
  useEffect(() => () => clearTimeout(searchDebounceTimer.current), []);

  // Keep localSearch as alias for backward compat
  const localSearch = debouncedQuery;

  // ── Sort state ───────────────────────────────────────────────────────────────
  const [sortBy, setSortBy] = useState('newest');

  // ── Multi-select state ──────────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [bulkExportFmt, setBulkExportFmt] = useState('MD');
  const [showBulkExportPicker, setShowBulkExportPicker] = useState(false);
  const [bulkCat, setBulkCat] = useState('');
  const [bulkVis, setBulkVis] = useState('');
  const [flagDoc, setFlagDoc] = useState(null);

  // ── Toast system ─────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);
  const toastTimer = useRef({});

  const showToast = (type, msg) => {
    const id = Date.now();
    setToasts(prev => [...prev.slice(-2), { id, type, msg }]);
    toastTimer.current[id] = setTimeout(
      () => setToasts(prev => prev.filter(t => t.id !== id)),
      4000
    );
  };

  const dismissToast = id => {
    clearTimeout(toastTimer.current[id]);
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // ── Command palette state ─────────────────────────────────────────────────────
  const [showCmdPalette, setShowCmdPalette] = useState(false);

  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCmdPalette(v => !v);
      }
      if (e.key === 'Escape') setShowCmdPalette(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Recently viewed ──────────────────────────────────────────────────────────
  const [recentIds, setRecentIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('pomelo_recent_docs')) || [];
    } catch {
      return [];
    }
  });

  const openFullPage = (doc, { edit = false } = {}) => {
    setFullPageDoc(doc);
    setFullPageEdit(edit);
    const next = [doc.id, ...recentIds.filter(id => id !== doc.id)].slice(0, 5);
    setRecentIds(next);
    localStorage.setItem('pomelo_recent_docs', JSON.stringify(next));
  };

  const exitSelection = () => {
    setSelectionMode(false);
    manager.clearSelection();
    setShowBulkExportPicker(false);
  };

  // ── Category counts ──────────────────────────────────────────────────────────
  const catCounts = manager.docs.reduce((acc, d) => {
    acc[d.category] = (acc[d.category] || 0) + 1;
    return acc;
  }, {});
  const bookmarkCount = manager.bookmarks ? manager.bookmarks.length : 0;

  // ── Filter docs for display ──────────────────────────────────────────────────
  // contentMatchIds tracks docs that matched only via their content body (not
  // title/desc/tags). Stored in a Set rather than mutating the state objects.
  const contentMatchIds = new Set();
  const displayDocs = manager.docs.filter(d => {
    if (catTab !== 'All' && catTab !== '★ Bookmarked' && d.category !== catTab) return false;
    if (catTab === '★ Bookmarked' && !manager.isBookmarked(d.id)) return false;
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase();
      const inTitle = d.title.toLowerCase().includes(q);
      const inDesc = (d.description || '').toLowerCase().includes(q);
      const inTags = (d.tags || []).some(t => t.toLowerCase().includes(q));
      const inContent = (d.content || '').toLowerCase().includes(q);
      if (!inTitle && !inDesc && !inTags && !inContent) return false;
      if (!inTitle && !inDesc && !inTags && inContent) contentMatchIds.add(d.id);
    }
    return true;
  });

  // ── Sort docs ────────────────────────────────────────────────────────────────
  const sortedDocs = [...displayDocs].sort((a, b) => {
    if (sortBy === 'newest') return new Date(b.updatedAt) - new Date(a.updatedAt);
    if (sortBy === 'oldest') return new Date(a.updatedAt) - new Date(b.updatedAt);
    if (sortBy === 'views') return (b.viewCount || 0) - (a.viewCount || 0);
    if (sortBy === 'az') return a.title.localeCompare(b.title);
    if (sortBy === 'za') return b.title.localeCompare(a.title);
    return 0;
  });

  const selectedIds = manager.selectedIds || [];
  const selectedDocs = displayDocs.filter(d => selectedIds.includes(d.id));
  const selectedCount = selectedIds.length;

  // ── Bulk operations ──────────────────────────────────────────────────────────

  const handleBulkArchive = async () => {
    setBulkWorking(true);
    const { error } = await bulkArchive(selectedIds);
    setBulkWorking(false);
    setShowArchiveConfirm(false);
    if (error) {
      showToast('error', `Archive failed: ${error}`);
    } else {
      showToast('success', `${selectedCount} document${selectedCount !== 1 ? 's' : ''} archived.`);
      await manager.loadDocs();
      manager.clearSelection();
    }
  };

  const handleBulkExportZip = async () => {
    setShowBulkExportPicker(false);
    setBulkWorking(true);
    await bulkZipExport(selectedDocs, bulkExportFmt);
    setBulkWorking(false);
    showToast(
      'success',
      `Exported ${selectedCount} document${selectedCount !== 1 ? 's' : ''} as ZIP (${bulkExportFmt}).`
    );
  };

  const handleBulkChangeCategory = async () => {
    if (!bulkCat) return;
    setBulkWorking(true);
    const results = await Promise.all(selectedIds.map(id => updateDoc(id, { category: bulkCat })));
    setBulkWorking(false);
    const failed = results.filter(r => r.error).length;
    if (failed > 0) {
      showToast('error', `${failed} update(s) failed.`);
    } else {
      showToast(
        'success',
        `Category updated to "${bulkCat}" for ${selectedCount} doc${selectedCount !== 1 ? 's' : ''}.`
      );
    }
    await manager.loadDocs();
    manager.clearSelection();
    setBulkCat('');
  };

  const handleBulkChangeVisibility = async () => {
    if (!bulkVis) return;
    setBulkWorking(true);
    const results = await Promise.all(
      selectedIds.map(id => updateDoc(id, { visibility: bulkVis }))
    );
    setBulkWorking(false);
    const failed = results.filter(r => r.error).length;
    if (failed > 0) {
      showToast('error', `${failed} update(s) failed.`);
    } else {
      showToast(
        'success',
        `Visibility set to "${bulkVis}" for ${selectedCount} doc${selectedCount !== 1 ? 's' : ''}.`
      );
    }
    await manager.loadDocs();
    manager.clearSelection();
    setBulkVis('');
  };

  const handleBulkBookmark = () => {
    let added = 0;
    selectedIds.forEach(id => {
      if (!manager.isBookmarked(id)) {
        manager.toggleBookmark(id);
        added++;
      }
    });
    showToast(
      'success',
      added > 0
        ? `${added} document${added !== 1 ? 's' : ''} bookmarked.`
        : 'All selected docs already bookmarked.'
    );
    manager.clearSelection();
  };

  // ── Export All ───────────────────────────────────────────────────────────────
  const handleExportAll = async () => {
    setShowExportPicker(false);
    setExportingAll(true);
    await bulkZipExport(displayDocs, exportAllFormat);
    setExportingAll(false);
  };

  if (fullPageDoc) {
    return (
      <DocFullPage
        doc={fullPageDoc}
        allDocs={manager.docs}
        onClose={() => {
          setFullPageDoc(null);
          setFullPageEdit(false);
        }}
        onSelect={openFullPage}
        canEdit={role === 'superadmin'}
        startInEdit={fullPageEdit}
        onSaved={updates => {
          onDocEdit?.(fullPageDoc);
          setFullPageDoc(prev => ({ ...prev, ...updates }));
          manager.loadDocs();
        }}
      />
    );
  }

  const isAdmin = role === 'superadmin';

  // Inline styles for select/button reuse
  const selectStyle = {
    padding: '6px 10px',
    border: '1px solid var(--border-default)',
    borderRadius: '6px',
    fontFamily: "'Inter', sans-serif",
    fontSize: '12px',
    color: 'var(--text-primary)',
    background: 'var(--bg-elevated)',
    cursor: 'pointer',
    outline: 'none',
  };
  const applyBtnStyle = disabled => ({
    padding: '6px 12px',
    background: disabled ? 'var(--border-default)' : 'var(--text-primary)',
    color: disabled ? 'var(--text-muted)' : '#fff',
    border: 'none',
    borderRadius: '6px',
    fontFamily: "'Inter', sans-serif",
    fontWeight: 700,
    fontSize: '12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <>
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        *:focus-visible { outline: 2px solid var(--accent-primary) !important; outline-offset: 2px !important; }
      `}</style>

      <div
        style={{
          display: 'flex',
          minHeight: '100%',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {/* Sidebar */}
        {activeTab === 'library' && !selectionMode && (
          <DocsSidebar
            docs={manager.docs}
            bookmarks={manager.bookmarks}
            isBookmarked={manager.isBookmarked}
            onSelect={setSidebarDoc}
          />
        )}

        <div style={{ flex: 1, minWidth: 0, padding: '0 28px 40px' }}>
          {/* Top bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '28px',
              marginBottom: '6px',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text-primary)' }}>
                Documentation Library
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Guides, policies, and how-to articles from the IT team.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Enhanced search with debounce + clear */}
              <div style={{ position: 'relative' }}>
                <input
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="Search docs… (⌘K for more)"
                  aria-label="Search documents"
                  style={{
                    padding: '8px 32px 8px 12px',
                    border: '1.5px solid var(--border-default)',
                    borderRadius: '8px',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '13px',
                    outline: 'none',
                    background: 'var(--bg-page)',
                    color: 'var(--text-primary)',
                    minWidth: '200px',
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setDebouncedQuery('');
                    }}
                    aria-label="Clear search"
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      fontSize: '16px',
                      lineHeight: 1,
                      padding: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Command palette button */}
              <button
                onClick={() => setShowCmdPalette(true)}
                title="Open command palette (⌘K)"
                style={{
                  padding: '7px 10px',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '7px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                ⌘K
              </button>

              {/* Select mode toggle */}
              {activeTab === 'library' && (
                <>
                  <button
                    onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
                    aria-pressed={selectionMode}
                    style={{
                      padding: '8px 14px',
                      background: selectionMode ? 'var(--bg-hover)' : 'transparent',
                      color: selectionMode ? '#DC2626' : 'var(--text-secondary)',
                      border: `1.5px solid ${selectionMode ? 'rgba(220, 38, 38, 0.4)' : 'var(--border-default)'}`,
                      borderRadius: '8px',
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    {selectionMode ? '✕ Cancel' : '☑ Select'}
                  </button>
                  {selectionMode && (
                    <button
                      onClick={() => {
                        displayDocs.forEach(d => {
                          if (!selectedIds.includes(d.id)) manager.toggleSelected(d.id);
                        });
                      }}
                      style={{
                        padding: '8px 0',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-primary)',
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        textUnderlineOffset: '2px',
                      }}
                    >
                      Select All ({displayDocs.length})
                    </button>
                  )}
                </>
              )}

              {/* Export All with format picker */}
              {!selectionMode && (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowExportPicker(v => !v)}
                    disabled={exportingAll || displayDocs.length === 0}
                    style={{
                      padding: '8px 16px',
                      background: exportingAll ? 'var(--border-strong)' : 'var(--text-primary)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: exportingAll || displayDocs.length === 0 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {exportingAll ? (
                      'Zipping…'
                    ) : (
                      <>
                        <span>↓ Export All</span>
                        <span style={{ fontSize: '10px', opacity: 0.7 }}>▾</span>
                      </>
                    )}
                  </button>

                  {showExportPicker && !exportingAll && (
                    <>
                      <div
                        onClick={() => setShowExportPicker(false)}
                        style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: 'calc(100% + 6px)',
                          right: 0,
                          zIndex: 100,
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-default)',
                          borderRadius: '12px',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
                          width: '260px',
                          overflow: 'hidden',
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        <div style={{ background: 'var(--text-primary)', padding: '12px 16px' }}>
                          <div style={{ color: '#fff', fontWeight: 900, fontSize: '13px' }}>
                            Export {displayDocs.length} document
                            {displayDocs.length !== 1 ? 's' : ''} as ZIP
                          </div>
                          <div
                            style={{
                              color: 'rgba(255,255,255,0.5)',
                              fontSize: '11px',
                              marginTop: '2px',
                            }}
                          >
                            Choose a format for all files
                          </div>
                        </div>
                        <div style={{ padding: '8px' }}>
                          {[
                            {
                              id: 'MD',
                              icon: '⬇️',
                              label: 'Markdown (.md)',
                              desc: 'Raw markdown text',
                            },
                            {
                              id: 'TXT',
                              icon: '📃',
                              label: 'Plain Text (.txt)',
                              desc: 'Stripped plain text',
                            },
                            {
                              id: 'CSV',
                              icon: '📊',
                              label: 'CSV (metadata)',
                              desc: 'Title, category, tags, date',
                            },
                          ].map(fmt => (
                            <button
                              key={fmt.id}
                              onClick={() => setExportAllFormat(fmt.id)}
                              style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '9px 10px',
                                borderRadius: '8px',
                                border: `1.5px solid ${exportAllFormat === fmt.id ? 'var(--text-primary)' : 'transparent'}`,
                                background:
                                  exportAllFormat === fmt.id ? 'var(--accent-soft)' : 'transparent',
                                cursor: 'pointer',
                                textAlign: 'left',
                                marginBottom: '2px',
                              }}
                            >
                              <span
                                style={{ fontSize: '17px', width: '22px', textAlign: 'center' }}
                              >
                                {fmt.icon}
                              </span>
                              <div>
                                <div
                                  style={{
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    color: 'var(--text-primary)',
                                  }}
                                >
                                  {fmt.label}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  {fmt.desc}
                                </div>
                              </div>
                              {exportAllFormat === fmt.id && (
                                <span
                                  style={{
                                    marginLeft: 'auto',
                                    color: 'var(--text-primary)',
                                    fontSize: '13px',
                                  }}
                                >
                                  ✓
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                        <div style={{ padding: '0 8px 10px' }}>
                          <button
                            onClick={handleExportAll}
                            style={{
                              width: '100%',
                              padding: '10px',
                              background: 'var(--accent-primary)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '8px',
                              fontFamily: "'Inter', sans-serif",
                              fontWeight: 700,
                              fontSize: '13px',
                              cursor: 'pointer',
                            }}
                          >
                            Download ZIP ({exportAllFormat})
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {isAdmin && !selectionMode && (
                <button
                  onClick={() => setShowUploader(true)}
                  style={{
                    padding: '8px 16px',
                    background: 'var(--accent-primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  ↑ Upload Documents
                </button>
              )}
            </div>
          </div>

          {/* Admin stats header */}
          {isAdmin && activeTab === 'library' && (
            <div
              style={{
                display: 'flex',
                gap: '16px',
                marginTop: '10px',
                marginBottom: '4px',
                flexWrap: 'wrap',
              }}
            >
              {[
                { icon: '📄', label: 'Total', value: manager.totalDocs },
                {
                  icon: '✅',
                  label: 'Active',
                  value: manager.docs.filter(d => d.status === 'Active').length,
                },
                {
                  icon: '🔒',
                  label: 'IT Only',
                  value: manager.docs.filter(d => d.visibility === 'IT Team Only').length,
                },
                {
                  icon: '📦',
                  label: 'Archived',
                  value: manager.docs.filter(d => d.status === 'Archived').length,
                },
              ].map(stat => (
                <div
                  key={stat.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    background: 'var(--bg-page)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '100px',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                  }}
                >
                  <span>{stat.icon}</span>
                  <span>
                    {stat.value} {stat.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Tab bar */}
          <div
            style={{
              display: 'flex',
              gap: '4px',
              marginBottom: '20px',
              borderBottom: '2px solid var(--border-default)',
              paddingBottom: '0',
              marginTop: '12px',
            }}
          >
            <button
              onClick={() => {
                setActiveTab('library');
                exitSelection();
              }}
              style={{
                padding: '10px 16px',
                border: 'none',
                borderBottom: `2px solid ${activeTab === 'library' ? 'var(--accent-primary)' : 'transparent'}`,
                background: 'transparent',
                color: activeTab === 'library' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                marginBottom: '-2px',
              }}
            >
              📚 Library
            </button>
            {isAdmin && (
              <>
                <button
                  onClick={() => {
                    setActiveTab('manage');
                    exitSelection();
                  }}
                  style={{
                    padding: '10px 16px',
                    border: 'none',
                    borderBottom: `2px solid ${activeTab === 'manage' ? 'var(--text-primary)' : 'transparent'}`,
                    background: 'transparent',
                    color: activeTab === 'manage' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    marginBottom: '-2px',
                  }}
                >
                  🛠 Manage Docs
                </button>
                <button
                  onClick={() => {
                    setActiveTab('archived');
                    exitSelection();
                  }}
                  style={{
                    padding: '10px 16px',
                    border: 'none',
                    borderBottom: `2px solid ${activeTab === 'archived' ? 'var(--text-secondary)' : 'transparent'}`,
                    background: 'transparent',
                    color: activeTab === 'archived' ? 'var(--text-secondary)' : 'var(--text-muted)',
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    marginBottom: '-2px',
                  }}
                >
                  🗑 Archived
                </button>
              </>
            )}
          </div>

          {/* ── Library tab ──────────────────────────────────────────────────── */}
          {activeTab === 'library' && (
            <>
              {/* Category filter pills with counts */}
              <div
                role="tablist"
                style={{
                  display: 'flex',
                  gap: '4px',
                  flexWrap: 'wrap',
                  marginBottom: selectedCount > 0 ? '12px' : '8px',
                  overflowX: 'auto',
                  paddingBottom: '2px',
                }}
              >
                {['All', '★ Bookmarked', ...DOC_CATEGORIES].map(cat => {
                  const count =
                    cat === 'All'
                      ? manager.docs.length
                      : cat === '★ Bookmarked'
                        ? bookmarkCount
                        : catCounts[cat] || 0;
                  const isActive = catTab === cat;
                  return (
                    <button
                      key={cat}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => {
                        setCatTab(cat);
                        manager.setPage(1);
                      }}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '100px',
                        border: `1.5px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                        background: isActive ? 'var(--accent-primary)' : 'var(--bg-surface)',
                        color: isActive ? '#fff' : 'var(--text-secondary)',
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: 'pointer',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        transition: 'all 0.12s',
                      }}
                    >
                      {cat}{' '}
                      {count > 0 && (
                        <span
                          style={{
                            background: isActive ? 'rgba(255,255,255,0.3)' : 'var(--bg-hover)',
                            color: isActive ? '#fff' : 'var(--text-secondary)',
                            padding: '0px 5px',
                            borderRadius: '100px',
                            fontSize: '10px',
                            fontWeight: 700,
                          }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Sort bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Sort:
                </span>
                {[
                  ['newest', 'Newest'],
                  ['oldest', 'Oldest'],
                  ['views', 'Most Viewed'],
                  ['az', 'A–Z'],
                  ['za', 'Z–A'],
                ].map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setSortBy(val)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '3px 0',
                      fontSize: '12px',
                      fontWeight: sortBy === val ? 700 : 400,
                      color: sortBy === val ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontFamily: "'Inter', sans-serif",
                      borderBottom:
                        sortBy === val
                          ? '2px solid var(--accent-primary)'
                          : '2px solid transparent',
                    }}
                  >
                    {label}
                  </button>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>
                  {displayDocs.length} document{displayDocs.length !== 1 ? 's' : ''}
                  {manager.totalDocs > displayDocs.length ? ` of ${manager.totalDocs}` : ''}
                </span>
              </div>

              {/* Search result count */}
              {debouncedQuery && (
                <div
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    marginBottom: '12px',
                    paddingLeft: '2px',
                  }}
                >
                  {displayDocs.length === 0
                    ? 'No results'
                    : `${displayDocs.length} result${displayDocs.length !== 1 ? 's' : ''}`}{' '}
                  for "<strong>{debouncedQuery}</strong>"
                </div>
              )}

              {/* ── Bulk action bar ─────────────────────────────────────────────── */}
              {selectionMode && selectedCount > 0 && (
                <div
                  role="toolbar"
                  aria-label="Bulk actions"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderLeft: '4px solid var(--text-primary)',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    marginBottom: '16px',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Count label */}
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: 900,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      marginRight: '4px',
                    }}
                  >
                    {selectedCount} of {displayDocs.length} selected
                  </span>

                  <div
                    style={{
                      width: '1px',
                      height: '24px',
                      background: 'var(--border-default)',
                      flexShrink: 0,
                    }}
                  />

                  {/* Archive — admin only */}
                  {isAdmin && (
                    <button
                      onClick={() => setShowArchiveConfirm(true)}
                      disabled={bulkWorking}
                      style={{
                        padding: '7px 14px',
                        background: 'rgba(220, 38, 38, 0.10)',
                        color: '#DC2626',
                        border: '1px solid #FCA5A5',
                        borderRadius: '7px',
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: bulkWorking ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      🗑 Archive
                    </button>
                  )}

                  {/* Export ZIP */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setShowBulkExportPicker(v => !v)}
                      disabled={bulkWorking}
                      style={{
                        padding: '7px 14px',
                        background: 'var(--accent-soft)',
                        color: 'var(--text-primary)',
                        border: '1px solid #BFDBFE',
                        borderRadius: '7px',
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: bulkWorking ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ↓ Export ZIP <span style={{ fontSize: '10px', opacity: 0.7 }}>▾</span>
                    </button>
                    {showBulkExportPicker && (
                      <>
                        <div
                          onClick={() => setShowBulkExportPicker(false)}
                          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            top: 'calc(100% + 6px)',
                            left: 0,
                            zIndex: 100,
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-default)',
                            borderRadius: '10px',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
                            width: '230px',
                            overflow: 'hidden',
                          }}
                        >
                          <div style={{ background: 'var(--text-primary)', padding: '10px 14px' }}>
                            <div style={{ color: '#fff', fontWeight: 900, fontSize: '12px' }}>
                              Export {selectedCount} doc{selectedCount !== 1 ? 's' : ''} as ZIP
                            </div>
                          </div>
                          <div style={{ padding: '6px' }}>
                            {[
                              { id: 'MD', label: 'Markdown (.md)' },
                              { id: 'TXT', label: 'Plain Text (.txt)' },
                              { id: 'CSV', label: 'CSV (metadata)' },
                            ].map(fmt => (
                              <button
                                key={fmt.id}
                                onClick={() => setBulkExportFmt(fmt.id)}
                                style={{
                                  width: '100%',
                                  padding: '8px 10px',
                                  borderRadius: '7px',
                                  border: `1.5px solid ${bulkExportFmt === fmt.id ? 'var(--text-primary)' : 'transparent'}`,
                                  background:
                                    bulkExportFmt === fmt.id ? 'var(--accent-soft)' : 'transparent',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  fontSize: '12px',
                                  fontFamily: "'Inter', sans-serif",
                                  fontWeight: 700,
                                  color: 'var(--text-primary)',
                                  marginBottom: '2px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                }}
                              >
                                {fmt.label}
                                {bulkExportFmt === fmt.id && (
                                  <span style={{ color: 'var(--text-primary)' }}>✓</span>
                                )}
                              </button>
                            ))}
                          </div>
                          <div style={{ padding: '0 6px 8px' }}>
                            <button
                              onClick={handleBulkExportZip}
                              style={{
                                width: '100%',
                                padding: '9px',
                                background: 'var(--accent-primary)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '7px',
                                fontFamily: "'Inter', sans-serif",
                                fontWeight: 700,
                                fontSize: '12px',
                                cursor: 'pointer',
                              }}
                            >
                              Download ZIP ({bulkExportFmt})
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Change Category — admin only */}
                  {isAdmin && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <select
                        value={bulkCat}
                        onChange={e => setBulkCat(e.target.value)}
                        style={selectStyle}
                      >
                        <option value="">Category…</option>
                        {DOC_CATEGORIES.map(c => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleBulkChangeCategory}
                        disabled={!bulkCat || bulkWorking}
                        style={applyBtnStyle(!bulkCat || bulkWorking)}
                      >
                        Apply
                      </button>
                    </div>
                  )}

                  {/* Change Visibility — admin only */}
                  {isAdmin && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <select
                        value={bulkVis}
                        onChange={e => setBulkVis(e.target.value)}
                        style={selectStyle}
                      >
                        <option value="">Visibility…</option>
                        {VISIBILITY_OPTIONS.map(v => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleBulkChangeVisibility}
                        disabled={!bulkVis || bulkWorking}
                        style={applyBtnStyle(!bulkVis || bulkWorking)}
                      >
                        Apply
                      </button>
                    </div>
                  )}

                  {/* Bookmark All */}
                  <button
                    onClick={handleBulkBookmark}
                    disabled={bulkWorking}
                    style={{
                      padding: '7px 14px',
                      background: 'rgba(245, 158, 11, 0.10)',
                      color: '#D97706',
                      border: '1px solid #FDE68A',
                      borderRadius: '7px',
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: bulkWorking ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ★ Bookmark All
                  </button>

                  {/* Clear */}
                  <button
                    onClick={() => manager.clearSelection()}
                    style={{
                      padding: '7px 14px',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '7px',
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer',
                      marginLeft: 'auto',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ✕ Clear
                  </button>
                </div>
              )}

              {/* Selection mode hint when nothing selected yet */}
              {selectionMode && selectedCount === 0 && (
                <div
                  style={{
                    padding: '10px 14px',
                    background: 'var(--accent-soft)',
                    border: '1px solid #BFDBFE',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    fontSize: '12px',
                    color: '#2563EB',
                    fontWeight: 700,
                  }}
                >
                  Click any document card to select it. Use "Select All" to select all visible
                  documents.
                </div>
              )}

              {/* Recently Viewed strip */}
              {!debouncedQuery && catTab === 'All' && recentIds.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      marginBottom: '10px',
                    }}
                  >
                    🕐 Recently Viewed
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {recentIds.slice(0, 3).map(id => {
                      const doc = manager.docs.find(d => d.id === id);
                      if (!doc) return null;
                      return (
                        <button
                          key={id}
                          onClick={() => openFullPage(doc)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 14px',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-default)',
                            borderRadius: '100px',
                            cursor: 'pointer',
                            fontFamily: "'Inter', sans-serif",
                            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                          }}
                          onMouseEnter={e =>
                            (e.currentTarget.style.borderColor = 'var(--accent-primary)')
                          }
                          onMouseLeave={e =>
                            (e.currentTarget.style.borderColor = 'var(--border-default)')
                          }
                        >
                          <span>{doc.icon}</span>
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {doc.title}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {doc.category}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Skeleton loading */}
              {manager.loading && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '14px',
                    marginBottom: '40px',
                  }}
                >
                  {Array.from({ length: 8 }).map((_, i) => (
                    <SkeletonCard key={i} />
                  ))}
                </div>
              )}

              {/* Error */}
              {manager.docsError && (
                <div
                  style={{
                    padding: '14px 18px',
                    background: 'rgba(220, 38, 38, 0.10)',
                    border: '1px solid #FCA5A5',
                    borderRadius: '8px',
                    color: '#DC2626',
                    fontSize: '13px',
                    fontWeight: 700,
                    marginBottom: '16px',
                  }}
                >
                  ⚠ {manager.docsError}
                </div>
              )}

              {/* Cards grid */}
              {!manager.loading && sortedDocs.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '14px',
                    marginBottom: '40px',
                  }}
                >
                  {sortedDocs.map(doc => (
                    <DocCard
                      key={doc.id}
                      doc={doc}
                      role={role}
                      isBookmarked={manager.isBookmarked(doc.id)}
                      onToggleBookmark={manager.toggleBookmark}
                      onOpen={setSidebarDoc}
                      onFullPage={openFullPage}
                      onEdit={d => openFullPage(d, { edit: true })}
                      selectionMode={selectionMode}
                      isSelected={selectedIds.includes(doc.id)}
                      onToggleSelect={manager.toggleSelected}
                      searchQuery={debouncedQuery}
                      matchedContent={contentMatchIds.has(doc.id)}
                      onTogglePin={async d => {
                        const featuredCount = manager.docs.filter(
                          x => x.featured && x.status === 'Active'
                        ).length;
                        if (!d.featured && featuredCount >= 3) {
                          showToast('error', 'You can pin at most 3 docs to Home.');
                          return;
                        }
                        await pinDoc(d.id, !d.featured);
                        await manager.loadDocs();
                        showToast(
                          'success',
                          d.featured ? 'Unpinned from Home.' : 'Pinned to Home.'
                        );
                      }}
                      onFlagReview={d => setFlagDoc(d)}
                      onClearReview={async d => {
                        await clearReview(d.id);
                        await manager.loadDocs();
                        showToast('success', 'Review cleared.');
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Load more */}
              {manager.totalDocs > sortedDocs.length + (manager.page - 1) * 20 &&
                !manager.loading && (
                  <div style={{ textAlign: 'center', marginTop: '20px' }}>
                    <button
                      onClick={() => manager.setPage(p => p + 1)}
                      style={{
                        padding: '10px 28px',
                        background: 'var(--bg-elevated)',
                        border: '1.5px solid var(--border-default)',
                        borderRadius: '100px',
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Load more documents
                    </button>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      Showing {sortedDocs.length} of {manager.totalDocs}
                    </div>
                  </div>
                )}

              {/* Empty state */}
              {!manager.loading && displayDocs.length === 0 && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '60px 40px',
                    background: 'var(--bg-elevated)',
                    border: '1px dashed var(--border-default)',
                    borderRadius: '12px',
                  }}
                >
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>📂</div>
                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: '16px',
                      color: 'var(--text-primary)',
                      marginBottom: '6px',
                    }}
                  >
                    No documents found
                  </div>
                  <div
                    style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}
                  >
                    {localSearch || catTab !== 'All'
                      ? 'Try clearing your filters.'
                      : 'No documents have been uploaded yet.'}
                  </div>
                  {isAdmin && catTab === 'All' && !localSearch && (
                    <button
                      onClick={() => setShowUploader(true)}
                      style={{
                        padding: '10px 22px',
                        background: 'var(--accent-primary)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                        fontSize: '14px',
                        cursor: 'pointer',
                      }}
                    >
                      ↑ Upload the first document
                    </button>
                  )}
                </div>
              )}

              {/* Sidebar doc detail panel */}
              {sidebarDoc && !selectionMode && (
                <>
                  <div
                    onClick={() => setSidebarDoc(null)}
                    style={{ position: 'fixed', inset: 0, zIndex: 300 }}
                  />
                  <div
                    style={{
                      position: 'fixed',
                      top: 0,
                      right: 0,
                      bottom: 0,
                      width: '400px',
                      maxWidth: '95vw',
                      background: 'var(--bg-elevated)',
                      borderLeft: '1px solid var(--border-default)',
                      boxShadow: '-8px 0 32px rgba(0,0,0,0.1)',
                      zIndex: 301,
                      overflowY: 'auto',
                      padding: '28px 24px',
                      fontFamily: "'Inter', sans-serif",
                      animation: 'slideUp 0.2s ease',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '18px',
                      }}
                    >
                      <div>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: '100px',
                            background: 'var(--bg-hover)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {sidebarDoc.category}
                        </span>
                      </div>
                      <button
                        onClick={() => setSidebarDoc(null)}
                        aria-label="Close"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          fontSize: '20px',
                          lineHeight: 1,
                          padding: '2px',
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <div style={{ fontSize: '30px', marginBottom: '10px' }}>{sidebarDoc.icon}</div>
                    <h2
                      style={{
                        fontSize: '20px',
                        fontWeight: 900,
                        color: 'var(--text-primary)',
                        marginBottom: '8px',
                        lineHeight: 1.2,
                      }}
                    >
                      {sidebarDoc.title}
                    </h2>
                    <p
                      style={{
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.6,
                        marginBottom: '20px',
                      }}
                    >
                      {sidebarDoc.description || sidebarDoc.summary}
                    </p>
                    <div
                      style={{
                        display: 'flex',
                        gap: '8px',
                        marginBottom: '20px',
                        flexWrap: 'wrap',
                      }}
                    >
                      {sidebarDoc.version && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: 'rgba(59, 130, 246, 0.12)',
                            color: '#2563EB',
                            border: '1px solid #BFDBFE',
                          }}
                        >
                          v{sidebarDoc.version}
                        </span>
                      )}
                      {sidebarDoc.author && (
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          By {sidebarDoc.author}
                        </span>
                      )}
                    </div>
                    {(sidebarDoc.tags || []).length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          gap: '4px',
                          flexWrap: 'wrap',
                          marginBottom: '20px',
                        }}
                      >
                        {sidebarDoc.tags.map(t => (
                          <span
                            key={t}
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '100px',
                              background: 'var(--bg-hover)',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => {
                        openFullPage(sidebarDoc);
                        setSidebarDoc(null);
                      }}
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: 'var(--accent-primary)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                        fontSize: '14px',
                        cursor: 'pointer',
                        marginBottom: '8px',
                      }}
                    >
                      Read full article →
                    </button>
                    <button
                      onClick={() => {
                        manager.toggleBookmark(sidebarDoc.id);
                      }}
                      aria-label={
                        manager.isBookmarked(sidebarDoc.id) ? 'Remove bookmark' : 'Add bookmark'
                      }
                      style={{
                        width: '100%',
                        padding: '11px',
                        background: 'transparent',
                        border: '1.5px solid var(--border-default)',
                        borderRadius: '8px',
                        fontFamily: "'Inter', sans-serif",
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {manager.isBookmarked(sidebarDoc.id) ? '★ Bookmarked' : '☆ Bookmark'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Manage Docs tab (admin only) ──────────────────────────────── */}
          {activeTab === 'manage' && isAdmin && (
            <DocAdminPanel
              docs={manager.docs}
              onRefresh={manager.loadDocs}
              onEdit={d => openFullPage(d, { edit: true })}
            />
          )}

          {/* ── Archived tab (admin only) ─────────────────────────────────── */}
          {activeTab === 'archived' && isAdmin && (
            <ArchivedDocsList
              onRestore={async d => {
                await restoreDoc(d.id);
                await manager.loadDocs();
                showToast('success', `${d.title} restored.`);
              }}
            />
          )}
        </div>

        {/* Uploader modal */}
        {showUploader && (
          <UploaderModal
            manager={manager}
            currentUser={currentUser}
            onClose={() => {
              setShowUploader(false);
              manager.loadDocs();
            }}
          />
        )}

        {/* Archive confirm modal */}
        {showArchiveConfirm && (
          <ArchiveConfirmModal
            count={selectedCount}
            onCancel={() => setShowArchiveConfirm(false)}
            onConfirm={handleBulkArchive}
            working={bulkWorking}
          />
        )}

        {/* Flag-for-review modal */}
        {flagDoc && (
          <FlagReviewModal
            doc={flagDoc}
            onClose={() => setFlagDoc(null)}
            onConfirm={async payload => {
              await markNeedsReview(flagDoc.id, payload);
              setFlagDoc(null);
              await manager.loadDocs();
              showToast('success', 'Flagged for review.');
            }}
          />
        )}

        {/* Command palette */}
        {showCmdPalette && (
          <>
            <div
              onClick={() => setShowCmdPalette(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 800 }}
            />
            <CmdPalette
              docs={manager.docs}
              onSelectDoc={doc => {
                openFullPage(doc);
                setShowCmdPalette(false);
              }}
              onAction={action => {
                setShowCmdPalette(false);
                if (action === 'upload') setShowUploader(true);
                if (action === 'manage') {
                  setActiveTab('manage');
                  exitSelection();
                }
                if (action === 'select') setSelectionMode(true);
              }}
              onClose={() => setShowCmdPalette(false)}
            />
          </>
        )}
      </div>

      {/* Toast stack */}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 900,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          pointerEvents: 'none',
        }}
        aria-live="polite"
        role="status"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            style={{
              pointerEvents: 'all',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              borderRadius: '10px',
              minWidth: '280px',
              maxWidth: '380px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              background:
                t.type === 'success'
                  ? 'rgba(22, 163, 74, 0.12)'
                  : t.type === 'error'
                    ? 'rgba(220, 38, 38, 0.10)'
                    : 'rgba(59, 130, 246, 0.12)',
              border: `1px solid ${t.type === 'success' ? 'rgba(22, 163, 74, 0.4)' : t.type === 'error' ? 'rgba(220, 38, 38, 0.4)' : 'rgba(59, 130, 246, 0.4)'}`,
              fontFamily: "'Inter', sans-serif",
              animation: 'slideUp 0.2s ease',
            }}
          >
            <span style={{ fontSize: '16px' }}>
              {t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}
            </span>
            <span
              style={{
                flex: 1,
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                lineHeight: 1.4,
              }}
            >
              {t.msg}
            </span>
            <button
              onClick={() => dismissToast(t.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: '16px',
                lineHeight: 1,
                padding: '0 0 0 4px',
              }}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
