// src/components/docs/DocAdminPanel.jsx
// Admin-only document management panel — sortable table, bulk actions, filters, pagination.

import { useState, useMemo } from 'react';
import { updateDoc, deleteDoc, bulkArchive } from '../../api/docsApi.js';
import { DOC_CATEGORIES, FORMAT_COLORS } from '../../mocks/docsMockData.js';
import DocExporter from './DocExporter.jsx';
import DateField from '../DateField.jsx';

const PAGE_SIZE = 20;

const relDate = iso => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const fmtSize = bytes => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

// ─── Confirm delete modal ──────────────────────────────────────────────────────
function ConfirmModal({ count, onConfirm, onCancel }) {
  return (
    <>
      <div
        onClick={onCancel}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 700 }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          background: 'var(--bg-elevated)',
          borderRadius: '14px',
          zIndex: 701,
          width: '420px',
          maxWidth: '95vw',
          padding: '28px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ fontSize: '24px', marginBottom: '12px' }}>🗑️</div>
        <div
          style={{
            fontWeight: 900,
            fontSize: '17px',
            color: 'var(--text-primary)',
            marginBottom: '8px',
          }}
        >
          Archive {count} document{count !== 1 ? 's' : ''}?
        </div>
        <div
          style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            marginBottom: '24px',
            lineHeight: 1.6,
          }}
        >
          This will archive the selected document{count !== 1 ? 's' : ''}. Archived documents are
          hidden from the library but can be restored.
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
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
            onClick={onConfirm}
            style={{
              padding: '9px 20px',
              background: '#DC2626',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Archive
          </button>
        </div>
      </div>
    </>
  );
}

// ─── DocAdminPanel ─────────────────────────────────────────────────────────────
export default function DocAdminPanel({ docs, onRefresh, onEdit }) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [fmtFilter, setFmtFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortCol, setSortCol] = useState('updatedAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [confirmCount, setConfirmCount] = useState(0);
  const [bulkCat, setBulkCat] = useState('');
  const [exportDoc, setExportDoc] = useState(null);
  const [working, setWorking] = useState(false);
  const [opError, setOpError] = useState(null);

  // ── Filter + sort ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = [...docs];
    if (search)
      r = r.filter(
        d =>
          d.title.toLowerCase().includes(search.toLowerCase()) ||
          (d.author || '').toLowerCase().includes(search.toLowerCase())
      );
    if (catFilter) r = r.filter(d => d.category === catFilter);
    if (fmtFilter) r = r.filter(d => d.format === fmtFilter);
    if (statusFilter) r = r.filter(d => d.status === statusFilter);
    if (dateFrom) r = r.filter(d => new Date(d.updatedAt) >= new Date(dateFrom));
    if (dateTo) r = r.filter(d => new Date(d.updatedAt) <= new Date(dateTo + 'T23:59:59'));
    r.sort((a, b) => {
      let av = a[sortCol] || '',
        bv = b[sortCol] || '';
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return r;
  }, [docs, search, catFilter, fmtFilter, statusFilter, dateFrom, dateTo, sortCol, sortDir]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamp page when the filtered list shrinks (e.g. after an archive operation)
  const safePage = Math.min(page, pages);
  const pageDocs = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const allPageSelected = pageDocs.length > 0 && pageDocs.every(d => selected.includes(d.id));

  const sort = col => {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const toggleAll = () => {
    if (allPageSelected) setSelected(s => s.filter(id => !pageDocs.map(d => d.id).includes(id)));
    else setSelected(s => [...new Set([...s, ...pageDocs.map(d => d.id)])]);
  };

  const resetFilters = () => {
    setSearch('');
    setCatFilter('');
    setFmtFilter('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const doBulkArchive = async () => {
    setWorking(true);
    setOpError(null);
    const { error } = await bulkArchive(selected);
    setWorking(false);
    if (error) {
      setOpError(`Archive failed: ${error}`);
      return;
    }
    setSelected([]);
    setConfirmCount(0);
    onRefresh?.();
  };

  const doChangeCat = async () => {
    if (!bulkCat) return;
    setWorking(true);
    setOpError(null);
    const results = await Promise.all(selected.map(id => updateDoc(id, { category: bulkCat })));
    setWorking(false);
    const failed = results.filter(r => r.error);
    if (failed.length) {
      setOpError(`${failed.length} update(s) failed. Please try again.`);
      return;
    }
    setSelected([]);
    setBulkCat('');
    onRefresh?.();
  };

  const doArchiveOne = async id => {
    setWorking(true);
    setOpError(null);
    const { error } = await deleteDoc(id);
    setWorking(false);
    if (error) {
      setOpError(`Archive failed: ${error}`);
      return;
    }
    onRefresh?.();
  };

  const doRestoreOne = async id => {
    setWorking(true);
    setOpError(null);
    const { error } = await updateDoc(id, { status: 'Active' });
    setWorking(false);
    if (error) {
      setOpError(`Restore failed: ${error}`);
      return;
    }
    onRefresh?.();
  };

  const inputSt = {
    padding: '7px 10px',
    borderRadius: '7px',
    border: '1.5px solid var(--border-default)',
    fontFamily: "'Inter', sans-serif",
    fontSize: '12px',
    background: 'var(--bg-page)',
    outline: 'none',
    color: 'var(--text-primary)',
  };
  const thSt = {
    padding: '10px 12px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    userSelect: 'none',
    position: 'sticky',
    top: 0,
    background: 'var(--bg-page)',
    borderBottom: '1px solid var(--border-default)',
  };
  const tdSt = {
    padding: '10px 12px',
    fontSize: '12px',
    color: 'var(--text-primary)',
    verticalAlign: 'middle',
    borderBottom: '1px solid var(--border-subtle)',
  };

  const sortIcon = col => (sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Filters bar */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '16px',
          alignItems: 'center',
        }}
      >
        <input
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search title or author…"
          style={{ ...inputSt, minWidth: '200px' }}
        />
        <select
          value={catFilter}
          onChange={e => {
            setCatFilter(e.target.value);
            setPage(1);
          }}
          style={inputSt}
        >
          <option value="">All categories</option>
          {DOC_CATEGORIES.map(c => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          value={fmtFilter}
          onChange={e => {
            setFmtFilter(e.target.value);
            setPage(1);
          }}
          style={inputSt}
        >
          <option value="">All formats</option>
          {['PDF', 'DOCX', 'MD', 'TXT', 'CSV', 'XLSX', 'PPTX'].map(f => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          style={inputSt}
        >
          <option value="">All statuses</option>
          {['Active', 'Archived', 'Draft'].map(s => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <DateField
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          style={inputSt}
          title="From date"
        />
        <DateField
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          style={inputSt}
          title="To date"
        />
        <button
          onClick={resetFilters}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent-primary)',
            fontWeight: 700,
            fontSize: '12px',
            cursor: 'pointer',
            padding: '0 4px',
          }}
        >
          Reset filters
        </button>
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text-muted)' }}>
          {filtered.length} document{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Operation error banner */}
      {opError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            background: 'rgba(220, 38, 38, 0.10)',
            border: '1px solid #FCA5A5',
            borderRadius: '8px',
            marginBottom: '12px',
            fontSize: '13px',
            color: '#DC2626',
          }}
        >
          <span style={{ flex: 1 }}>{opError}</span>
          <button
            onClick={() => setOpError(null)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#DC2626',
              fontSize: '16px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Bulk actions bar */}
      {selected.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            padding: '10px 14px',
            background: 'rgba(59, 130, 246, 0.12)',
            border: '1px solid #BFDBFE',
            borderRadius: '8px',
            marginBottom: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {selected.length} selected
          </span>
          <button
            onClick={() => setConfirmCount(selected.length)}
            style={{
              padding: '6px 12px',
              background: '#DC2626',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontFamily: "'Inter', sans-serif",
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Archive selected
          </button>
          <select
            value={bulkCat}
            onChange={e => setBulkCat(e.target.value)}
            style={{ ...inputSt, fontSize: '11px' }}
          >
            <option value="">Change category…</option>
            {DOC_CATEGORIES.map(c => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {bulkCat && (
            <button
              onClick={doChangeCat}
              disabled={working}
              style={{
                padding: '6px 12px',
                background: 'var(--text-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontFamily: "'Inter', sans-serif",
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Apply
            </button>
          )}
          <button
            onClick={() => setSelected([])}
            style={{
              padding: '6px 10px',
              background: 'transparent',
              border: '1.5px solid #BFDBFE',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
              color: 'var(--text-primary)',
            }}
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div
        style={{
          border: '1px solid var(--border-default)',
          borderRadius: '10px',
          overflow: 'auto',
          maxHeight: '560px',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
          <thead>
            <tr>
              <th style={{ ...thSt, width: '36px' }}>
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={toggleAll}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              {[
                ['title', 'Title'],
                ['category', 'Category'],
                ['format', 'Format'],
                ['author', 'Author'],
                ['updatedAt', 'Updated'],
                ['version', 'Version'],
                ['visibility', 'Visibility'],
                ['status', 'Status'],
              ].map(([col, label]) => (
                <th key={col} style={thSt} onClick={() => sort(col)}>
                  {label}
                  {sortIcon(col)}
                </th>
              ))}
              <th style={thSt}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageDocs.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  style={{
                    ...tdSt,
                    textAlign: 'center',
                    padding: '40px',
                    color: 'var(--text-muted)',
                  }}
                >
                  No documents found.
                </td>
              </tr>
            )}
            {pageDocs.map(doc => {
              const fmt = FORMAT_COLORS[doc.format] || FORMAT_COLORS.TXT;
              const isArchived = doc.status === 'Archived';
              return (
                <tr
                  key={doc.id}
                  style={{
                    background: selected.includes(doc.id)
                      ? 'var(--accent-soft)'
                      : isArchived
                        ? 'var(--bg-hover)'
                        : 'var(--bg-surface)',
                    opacity: isArchived ? 0.7 : 1,
                  }}
                >
                  <td style={tdSt}>
                    <input
                      type="checkbox"
                      checked={selected.includes(doc.id)}
                      onChange={() =>
                        setSelected(s =>
                          s.includes(doc.id) ? s.filter(x => x !== doc.id) : [...s, doc.id]
                        )
                      }
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td style={tdSt}>
                    <div
                      style={{
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        maxWidth: '220px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {doc.icon} {doc.title}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {fmtSize(doc.fileSize)}
                    </div>
                  </td>
                  <td style={tdSt}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '100px',
                        background: 'var(--bg-hover)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {doc.category}
                    </span>
                  </td>
                  <td style={tdSt}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: fmt.bg,
                        color: fmt.color,
                        border: `1px solid ${fmt.border}`,
                      }}
                    >
                      {doc.format}
                    </span>
                  </td>
                  <td style={tdSt}>{doc.author || '—'}</td>
                  <td style={{ ...tdSt, whiteSpace: 'nowrap' }}>{relDate(doc.updatedAt)}</td>
                  <td style={tdSt}>{doc.version || '—'}</td>
                  <td style={tdSt}>
                    {doc.visibility === 'IT Team Only' ? '🔒 IT only' : '🌐 Public'}
                  </td>
                  <td style={tdSt}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '100px',
                        background: isArchived ? 'var(--bg-hover)' : 'rgba(22, 163, 74, 0.10)',
                        color: isArchived ? 'var(--text-secondary)' : '#16A34A',
                      }}
                    >
                      {doc.status}
                    </span>
                  </td>
                  <td style={{ ...tdSt, whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => onEdit?.(doc)}
                        title="Edit"
                        aria-label={`Edit ${doc.title}`}
                        style={{
                          padding: '4px 8px',
                          background: 'var(--accent-soft)',
                          border: '1px solid #BFDBFE',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          color: '#2563EB',
                        }}
                      >
                        ✎
                      </button>
                      <div style={{ position: 'relative' }}>
                        <button
                          onClick={() => setExportDoc(d => (d?.id === doc.id ? null : doc))}
                          title="Export"
                          aria-label={`Export ${doc.title}`}
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
                          ↗
                        </button>
                        {exportDoc?.id === doc.id && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: 'calc(100% + 4px)',
                              right: 0,
                              zIndex: 200,
                            }}
                          >
                            <DocExporter doc={doc} onClose={() => setExportDoc(null)} />
                          </div>
                        )}
                      </div>
                      {isArchived ? (
                        <button
                          onClick={() => doRestoreOne(doc.id)}
                          disabled={working}
                          title="Restore"
                          aria-label={`Restore ${doc.title}`}
                          style={{
                            padding: '4px 8px',
                            background: 'rgba(22, 163, 74, 0.10)',
                            border: '1px solid #BBF7D0',
                            borderRadius: '5px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            color: '#16A34A',
                          }}
                        >
                          ↺
                        </button>
                      ) : (
                        <button
                          onClick={() => doArchiveOne(doc.id)}
                          disabled={working}
                          title="Archive"
                          aria-label={`Archive ${doc.title}`}
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
                          🗑
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginTop: '16px',
          }}
        >
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '6px 12px',
              background: page === 1 ? 'var(--bg-hover)' : 'var(--text-primary)',
              color: page === 1 ? 'var(--text-muted)' : '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: page === 1 ? 'default' : 'pointer',
              fontFamily: "'Inter', sans-serif",
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            ←
          </button>
          {Array.from({ length: pages }, (_, i) => i + 1)
            .filter(p => Math.abs(p - page) <= 2 || p === 1 || p === pages)
            .map((p, idx, arr) => (
              <span key={p}>
                {idx > 0 && arr[idx - 1] !== p - 1 && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '0 4px' }}>
                    …
                  </span>
                )}
                <button
                  onClick={() => setPage(p)}
                  style={{
                    padding: '6px 10px',
                    background: p === page ? 'var(--accent-primary)' : 'transparent',
                    color: p === page ? '#fff' : 'var(--text-primary)',
                    border: `1.5px solid ${p === page ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                >
                  {p}
                </button>
              </span>
            ))}
          <button
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page === pages}
            style={{
              padding: '6px 12px',
              background: page === pages ? 'var(--bg-hover)' : 'var(--text-primary)',
              color: page === pages ? 'var(--text-muted)' : '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: page === pages ? 'default' : 'pointer',
              fontFamily: "'Inter', sans-serif",
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            →
          </button>
        </div>
      )}

      {/* Confirm modal */}
      {confirmCount > 0 && (
        <ConfirmModal
          count={confirmCount}
          onConfirm={doBulkArchive}
          onCancel={() => setConfirmCount(0)}
        />
      )}
    </div>
  );
}
