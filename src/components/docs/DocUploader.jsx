// src/components/docs/DocUploader.jsx
// Full-featured mass document upload component with drag-and-drop, auto-categorization,
// metadata editing, bulk actions, and upload queue table.

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { DOC_CATEGORIES } from '../../mocks/docsMockData.js';

// Every file type is accepted. Formats with a converter (PDF, DOCX, MD, TXT,
// CSV, images) become readable pages; anything else is stored as-is and served
// back through a download card on the doc page.
const FILE_TYPE_ICONS = [
  { ext: 'PDF', icon: '📄', label: '.pdf' },
  { ext: 'DOCX', icon: '📝', label: '.docx/.doc' },
  { ext: 'MD', icon: '⬇️', label: '.md' },
  { ext: 'TXT', icon: '📃', label: '.txt' },
  { ext: 'CSV', icon: '📊', label: '.csv' },
  { ext: 'XLSX', icon: '📈', label: '.xlsx' },
  { ext: 'PPTX', icon: '📑', label: '.pptx' },
  { ext: 'IMG', icon: '🖼️', label: '.png/.jpg/.gif/.webp' },
  { ext: 'ANY', icon: '📦', label: '+ any other format' },
];

const STATUS_CONFIG = {
  queued: { label: 'Queued', color: 'var(--text-secondary)', bg: 'var(--bg-hover)' },
  uploading: { label: 'Uploading', color: '#2563EB', bg: 'rgba(59, 130, 246, 0.12)' },
  complete: { label: 'Complete', color: '#16A34A', bg: 'rgba(22, 163, 74, 0.10)' },
  error: { label: 'Error', color: '#DC2626', bg: 'rgba(220, 38, 38, 0.10)' },
  skipped: { label: 'Skipped', color: '#D97706', bg: 'rgba(245, 158, 11, 0.10)' },
};

const fmtSize = bytes => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const totalSize = queue => {
  const bytes = queue.reduce((s, i) => s + (i.file?.size || 0), 0);
  return fmtSize(bytes);
};

const getExt = filename => filename.split('.').pop().toUpperCase();

const friendlyError = err => {
  if (!err) return '';
  const msg = String(err).toLowerCase();
  if (
    msg.includes('too large') ||
    msg.includes('size') ||
    msg.includes('exceeds') ||
    msg.includes('limit')
  )
    return 'File too large';
  if (msg.includes('format') || msg.includes('type') || msg.includes('unsupported'))
    return 'Format not supported';
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('connect'))
    return 'Connection failed';
  if (msg.includes('permission') || msg.includes('auth')) return 'Permission denied';
  return 'Upload failed';
};

// ─── Metadata Modal ────────────────────────────────────────────────────────────
function MetadataModal({ item, onSave, onClose }) {
  const [form, setForm] = useState({
    title: item.title || '',
    description: item.description || '',
    category: item.category || 'Other',
    tags: item.tags || '',
    author: item.author || '',
    version: item.version || '1.0',
    visibility: item.visibility || 'Public',
  });

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const inputStyle = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1.5px solid var(--border-default)',
    fontFamily: "'Inter', sans-serif",
    fontSize: '13px',
    color: 'var(--text-primary)',
    background: 'var(--bg-page)',
    outline: 'none',
    boxSizing: 'border-box',
  };
  const labelStyle = {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    display: 'block',
    marginBottom: '5px',
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 600 }}
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
          width: '500px',
          maxWidth: '95vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          overflow: 'hidden',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div
          style={{
            background: 'var(--text-primary)',
            padding: '18px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>
            Edit Document Metadata
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              fontSize: '20px',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            padding: '22px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            maxHeight: '70vh',
            overflowY: 'auto',
          }}
        >
          <div>
            <label style={labelStyle}>Title</label>
            <input value={form.title} onChange={set('title')} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Category</label>
              <select
                value={form.category}
                onChange={set('category')}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {DOC_CATEGORIES.map(c => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Version</label>
              <input
                value={form.version}
                onChange={set('version')}
                placeholder="1.0"
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Tags (comma-separated)</label>
            <input
              value={form.tags}
              onChange={set('tags')}
              placeholder="vpn, security, remote access"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Author</label>
            <input value={form.author} onChange={set('author')} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Visibility</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['Public', 'IT Team Only'].map(v => (
                <button
                  key={v}
                  onClick={() => setForm(f => ({ ...f, visibility: v }))}
                  style={{
                    flex: 1,
                    padding: '9px',
                    borderRadius: '8px',
                    border: `1.5px solid ${form.visibility === v ? 'var(--text-primary)' : 'var(--border-default)'}`,
                    background: form.visibility === v ? 'var(--text-primary)' : 'transparent',
                    color: form.visibility === v ? '#fff' : 'var(--text-secondary)',
                    fontFamily: "'Inter', sans-serif",
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {v === 'Public' ? '🌐 All Staff' : '🔒 IT Team Only'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div
          style={{
            padding: '0 22px 22px',
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '9px 18px',
              background: 'transparent',
              border: '1.5px solid var(--border-default)',
              borderRadius: '8px',
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onSave(form);
              onClose();
            }}
            style={{
              padding: '9px 22px',
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
            Save
          </button>
        </div>
      </div>
    </>
  );
}

// ─── DocUploader ───────────────────────────────────────────────────────────────
export default function DocUploader({
  queue,
  addToQueue,
  removeFromQueue,
  clearQueue,
  updateQueueItem,
  setBulkCategory,
  removeErrored,
  uploading,
  uploadProgress,
  uploadSummary,
  uploadAll,
  currentUser,
}) {
  const [editingItem, setEditingItem] = useState(null);
  const [bulkCatValue, setBulkCatValue] = useState(DOC_CATEGORIES[0]);

  const onDrop = useCallback(
    acceptedFiles => {
      addToQueue(acceptedFiles, currentUser?.name || '');
    },
    [addToQueue, currentUser]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  const multipleErrored = queue.filter(i => i.status === 'error').length;

  const inputStyle = {
    padding: '6px 10px',
    borderRadius: '7px',
    border: '1.5px solid var(--border-default)',
    fontFamily: "'Inter', sans-serif",
    fontSize: '12px',
    background: 'var(--bg-page)',
    outline: 'none',
    color: 'var(--text-primary)',
  };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Drop zone */}
      <div
        {...getRootProps()}
        aria-label="Drop files here or click to browse"
        style={{
          minHeight: '200px',
          border: `2px dashed ${isDragActive ? 'var(--accent-primary)' : 'var(--border-strong)'}`,
          borderRadius: '12px',
          background: isDragActive ? 'var(--accent-soft)' : 'var(--bg-page)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '14px',
          cursor: 'pointer',
          transition: 'all 0.15s',
          padding: '32px 20px',
          marginBottom: '20px',
        }}
      >
        <input {...getInputProps()} />
        <div style={{ fontSize: '36px' }}>{isDragActive ? '📂' : '☁️'}</div>
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontWeight: 900,
              fontSize: '15px',
              color: 'var(--text-primary)',
              marginBottom: '4px',
            }}
          >
            {isDragActive ? 'Drop files here' : 'Drag & drop files, or click to browse'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Any file type · up to 3 MB per file. PDF, DOCX, MD, TXT, CSV and images become readable
            pages; everything else is stored with a download card.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {FILE_TYPE_ICONS.map(f => (
            <span
              key={f.ext}
              style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              {f.icon} {f.label}
            </span>
          ))}
        </div>
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <>
          {/* Summary + bulk actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {queue.length} file{queue.length !== 1 ? 's' : ''} · {totalSize(queue)} total
            </div>

            {queue.length >= 2 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  value={bulkCatValue}
                  onChange={e => setBulkCatValue(e.target.value)}
                  style={inputStyle}
                >
                  {DOC_CATEGORIES.map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <button
                  onClick={() => setBulkCategory(bulkCatValue)}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--text-primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '7px',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Set all categories
                </button>
                {multipleErrored > 0 && (
                  <button
                    onClick={removeErrored}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(220, 38, 38, 0.10)',
                      color: '#DC2626',
                      border: '1px solid #FCA5A5',
                      borderRadius: '7px',
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Remove errored ({multipleErrored})
                  </button>
                )}
                <button
                  onClick={clearQueue}
                  aria-label="Clear upload queue"
                  style={{
                    padding: '6px 12px',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    border: '1.5px solid var(--border-default)',
                    borderRadius: '7px',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Clear queue
                </button>
              </div>
            )}
          </div>

          {/* Table */}
          <div
            style={{
              border: '1px solid var(--border-default)',
              borderRadius: '10px',
              overflow: 'hidden',
              marginBottom: '16px',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr
                  style={{
                    background: 'var(--bg-page)',
                    borderBottom: '1px solid var(--border-default)',
                  }}
                >
                  {['File', 'Size', 'Type', 'Category', 'Status', ''].map(h => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 12px',
                        textAlign: 'left',
                        fontWeight: 700,
                        color: 'var(--text-secondary)',
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.map((item, idx) => {
                  const st = STATUS_CONFIG[item.status] || STATUS_CONFIG.queued;
                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom:
                          idx < queue.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                        background:
                          item.status === 'error' ? 'rgba(220, 38, 38, 0.10)' : 'var(--bg-surface)',
                      }}
                    >
                      {/* File name */}
                      <td style={{ padding: '10px 12px', maxWidth: '200px' }}>
                        <button
                          onClick={() => setEditingItem(item)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                            padding: 0,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 700,
                              color: 'var(--text-primary)',
                              fontSize: '12px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: '180px',
                            }}
                          >
                            {item.title || item.file?.name}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {item.file?.name}
                          </div>
                        </button>
                      </td>
                      {/* Size */}
                      <td
                        style={{
                          padding: '10px 12px',
                          color: 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {fmtSize(item.file?.size || 0)}
                      </td>
                      {/* Type */}
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: 'var(--bg-hover)',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {getExt(item.file?.name || '')}
                        </span>
                      </td>
                      {/* Category */}
                      <td style={{ padding: '10px 8px', minWidth: '160px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <select
                            value={item.category}
                            onChange={e =>
                              updateQueueItem(item.id, {
                                category: e.target.value,
                                autoDetected: false,
                              })
                            }
                            style={{ ...inputStyle, fontSize: '11px', padding: '5px 8px' }}
                          >
                            {DOC_CATEGORIES.map(c => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                          {item.autoDetected && (
                            <span
                              style={{
                                fontSize: '9px',
                                fontWeight: 700,
                                padding: '2px 5px',
                                borderRadius: '4px',
                                background: 'rgba(16, 185, 129, 0.10)',
                                color: '#059669',
                                border: '1px solid #A7F3D0',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Auto
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Status */}
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <div>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: '100px',
                              background: st.bg,
                              color: st.color,
                            }}
                            title={
                              item.status === 'error' ? item.error || 'Upload failed' : undefined
                            }
                          >
                            {item.status === 'complete'
                              ? '✓ '
                              : item.status === 'error'
                                ? '✕ '
                                : ''}
                            {item.status === 'error' ? friendlyError(item.error) : st.label}
                          </span>
                          {item.status === 'uploading' && (
                            <div
                              style={{
                                marginTop: '4px',
                                height: '3px',
                                background: 'var(--border-default)',
                                borderRadius: '2px',
                                overflow: 'hidden',
                                minWidth: '80px',
                              }}
                            >
                              <div
                                style={{
                                  height: '100%',
                                  background: '#2563EB',
                                  width: `${item.progress || 0}%`,
                                  transition: 'width 0.2s',
                                }}
                              />
                            </div>
                          )}
                          {item.status === 'error' && item.error && (
                            <div style={{ fontSize: '10px', color: '#DC2626', marginTop: '2px' }}>
                              {item.error}
                            </div>
                          )}
                        </div>
                      </td>
                      {/* Actions */}
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => setEditingItem(item)}
                            title="Edit metadata"
                            style={{
                              padding: '4px 8px',
                              background: 'var(--bg-page)',
                              border: '1px solid var(--border-default)',
                              borderRadius: '5px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            ✎
                          </button>
                          {item.status === 'error' && (
                            <button
                              onClick={() =>
                                updateQueueItem(item.id, {
                                  status: 'queued',
                                  error: null,
                                  progress: 0,
                                })
                              }
                              title="Retry upload"
                              aria-label="Retry failed upload"
                              style={{
                                padding: '3px 8px',
                                background: 'rgba(59, 130, 246, 0.12)',
                                border: '1px solid #BFDBFE',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                color: '#2563EB',
                                fontFamily: "'Inter', sans-serif",
                                fontWeight: 700,
                              }}
                            >
                              ↺ Retry
                            </button>
                          )}
                          <button
                            onClick={() => removeFromQueue(item.id)}
                            title="Remove"
                            aria-label={`Remove ${item.title || item.file?.name} from queue`}
                            style={{
                              padding: '4px 8px',
                              background: 'rgba(220, 38, 38, 0.10)',
                              border: '1px solid #FCA5A5',
                              borderRadius: '5px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              color: '#DC2626',
                            }}
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Overall progress */}
          {uploading && (
            <div style={{ marginBottom: '14px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '6px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                }}
              >
                <span>Uploading…</span>
                <span>{uploadProgress}%</span>
              </div>
              <div
                style={{
                  height: '6px',
                  background: 'var(--border-default)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    background: 'var(--accent-primary)',
                    width: `${uploadProgress}%`,
                    transition: 'width 0.3s',
                    borderRadius: '3px',
                  }}
                />
              </div>
            </div>
          )}

          {/* Summary card */}
          {uploadSummary && (
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '10px',
                background:
                  uploadSummary.failed > 0 ? 'rgba(245, 158, 11, 0.10)' : 'rgba(22, 163, 74, 0.10)',
                border: `1px solid ${uploadSummary.failed > 0 ? '#FDE68A' : '#BBF7D0'}`,
                marginBottom: '14px',
                fontSize: '13px',
                fontWeight: 700,
                color: uploadSummary.failed > 0 ? '#92400E' : '#166534',
              }}
            >
              {uploadSummary.succeeded > 0 &&
                `✓ ${uploadSummary.succeeded} document${uploadSummary.succeeded !== 1 ? 's' : ''} added to the library successfully.`}
              {uploadSummary.failed > 0 &&
                ` ${uploadSummary.succeeded > 0 ? ' ' : ''}✕ ${uploadSummary.failed} failed.`}
            </div>
          )}

          {/* Upload buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={uploadAll}
              disabled={uploading || queue.every(i => i.status === 'complete')}
              aria-label="Upload all queued files"
              style={{
                padding: '11px 24px',
                background: uploading ? 'var(--border-strong)' : 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontFamily: "'Inter', sans-serif",
                fontWeight: 700,
                fontSize: '14px',
                cursor: uploading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {uploading ? (
                <>
                  <span
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      border: '2px solid rgba(255,255,255,0.3)',
                      borderTopColor: '#fff',
                      display: 'inline-block',
                      animation: 'spin 0.7s linear infinite',
                    }}
                  />{' '}
                  Uploading…
                </>
              ) : (
                'Upload All'
              )}
            </button>
            <button
              onClick={clearQueue}
              disabled={uploading}
              aria-label="Clear upload queue"
              style={{
                padding: '11px 18px',
                background: 'transparent',
                border: '1.5px solid var(--border-default)',
                borderRadius: '8px',
                fontFamily: "'Inter', sans-serif",
                fontSize: '14px',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
            >
              Clear
            </button>
          </div>
        </>
      )}

      {/* Metadata modal */}
      {editingItem && (
        <MetadataModal
          item={{ ...editingItem, author: editingItem.author || currentUser?.name || '' }}
          onSave={updates => {
            updateQueueItem(editingItem.id, updates);
            setEditingItem(null);
          }}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}
