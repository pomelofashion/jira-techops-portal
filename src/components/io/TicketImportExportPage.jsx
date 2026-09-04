// src/components/io/TicketImportExportPage.jsx
// Admin tool for migrating tickets off Jira and exporting to CSV.
//   Import: upload Jira's "Export → CSV" file, preview the mapping, then
//           import in batches of 50 with per-row outcomes (created / skipped
//           duplicate / errored). Idempotent — re-importing skips by Jira key.
//   Export: download this platform's tickets as CSV (all, or one board).
// Gated by system.export_data (admin tier) at the section + route level.

import { useState, useEffect, useRef } from 'react';
import { Upload, Download } from 'lucide-react';
import { S } from '../../lib/styles.js';
import { mapRows } from '../../lib/jiraImport.js';
import { importTickets, ticketsCsvUrl } from '../../api/ticketsApi.js';
import * as spacesApi from '../../api/spacesApi.js';

const BATCH = 50;
const OUTCOME = {
  created: { label: 'Created', color: '#16A34A' },
  skipped: { label: 'Skipped (duplicate)', color: '#D97706' },
  error: { label: 'Error', color: '#DC2626' },
};

export default function TicketImportExportPage({ onToast }) {
  const [tab, setTab] = useState('import');
  const [boards, setBoards] = useState([]);
  const [boardId, setBoardId] = useState('');
  const [parsed, setParsed] = useState(null); // { rows, columns, warnings, fileName }
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total }
  const [summary, setSummary] = useState(null); // { created, skipped, error, rows[] }
  const fileRef = useRef(null);

  const toast = (m, t) => onToast?.(m, t);

  useEffect(() => {
    spacesApi.listSpaces({ all: '1' }).then(({ data }) => {
      const all = (data?.spaces || []).flatMap(s =>
        (s.boards || []).filter(b => !b.archived).map(b => ({ ...b, spaceName: s.name }))
      );
      setBoards(all);
      const def = all.find(b => b.key === 'PESD1') || all[0];
      if (def) setBoardId(def.id);
    });
  }, []);

  const onPickFile = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSummary(null);
    try {
      const text = await file.text();
      const result = mapRows(text);
      setParsed({ ...result, fileName: file.name });
      if (!result.rows.length) toast('No importable rows found in that file.', 'error');
    } catch {
      toast('Could not read that file — is it a CSV?', 'error');
    }
  };

  const runImport = async () => {
    if (!parsed?.rows.length || !boardId || importing) return;
    setImporting(true);
    setSummary(null);
    const rows = parsed.rows;
    const acc = { created: 0, skipped: 0, error: 0, rows: [] };
    setProgress({ done: 0, total: rows.length });
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { data, error } = await importTickets(boardId, batch);
      if (error) {
        // Whole-batch failure — mark each row errored and keep going.
        batch.forEach(r => {
          acc.error++;
          acc.rows.push({ jiraKey: r.jiraKey, status: 'error', error });
        });
      } else {
        for (const r of data.results) {
          acc[r.status] = (acc[r.status] || 0) + 1;
          acc.rows.push(r);
        }
      }
      setProgress({ done: Math.min(i + BATCH, rows.length), total: rows.length });
    }
    setImporting(false);
    setProgress(null);
    setSummary(acc);
    setParsed(null);
    toast(`Import finished — ${acc.created} created, ${acc.skipped} skipped.`);
  };

  const boardLabel = b => `${b.spaceName} · ${b.name} (${b.key})`;
  const previewCols = [
    ['jiraKey', 'Jira key'],
    ['title', 'Title'],
    ['status', 'Status'],
    ['priority', 'Priority'],
    ['issueType', 'Type'],
    ['assigneeEmail', 'Assignee'],
    ['createdAt', 'Created'],
  ];

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)' }}>
        Import / Export
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '4px 0 20px' }}>
        Migrate tickets from Jira, or export this platform's tickets to CSV.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '20px' }}>
        {[
          ['import', '⬇ Import from Jira'],
          ['export', '⬆ Export to CSV'],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: `2px solid ${tab === id ? 'var(--accent-primary)' : 'transparent'}`,
              background: 'none',
              color: tab === id ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'import' && (
        <div style={{ ...S.card, padding: '20px', maxWidth: '900px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px' }}>
              <label style={S.label}>Destination board</label>
              <select value={boardId} onChange={e => setBoardId(e.target.value)} style={S.select}>
                {boards.map(b => (
                  <option key={b.id} value={b.id}>
                    {boardLabel(b)}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              style={{ ...S.orangeBtn, display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Upload size={15} /> Choose Jira CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={onPickFile}
            />
          </div>

          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px' }}>
            In Jira: <b>Filters → export your issues → Export CSV (all fields)</b>, then upload it
            here. Re-importing the same file is safe — already-imported tickets are skipped by their
            Jira key.
          </p>

          {parsed && (
            <div style={{ marginTop: '18px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
                {parsed.fileName} — {parsed.rows.length} ticket(s) ready
              </div>
              {parsed.warnings.map((w, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: '12px',
                    color: '#D97706',
                    background: 'rgba(245, 158, 11, 0.10)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    marginBottom: '6px',
                  }}
                >
                  ⚠ {w}
                </div>
              ))}
              {parsed.rows.length > 0 && (
                <div
                  style={{
                    overflowX: 'auto',
                    border: '1px solid var(--border-default)',
                    borderRadius: '8px',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-hover)' }}>
                        {previewCols.map(([, label]) => (
                          <th
                            key={label}
                            style={{
                              textAlign: 'left',
                              padding: '8px 10px',
                              fontWeight: 700,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, 10).map((r, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                          {previewCols.map(([field]) => (
                            <td
                              key={field}
                              style={{
                                padding: '6px 10px',
                                maxWidth: '220px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {field.endsWith('At') && r[field]
                                ? new Date(r[field]).toLocaleDateString()
                                : r[field] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {parsed.rows.length > 10 && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Showing 10 of {parsed.rows.length}.
                </div>
              )}
              <button
                onClick={runImport}
                disabled={importing || !parsed.rows.length}
                style={{ ...S.orangeBtn, marginTop: '14px', opacity: importing ? 0.7 : 1 }}
              >
                {importing
                  ? `Importing… ${progress?.done ?? 0}/${progress?.total ?? 0}`
                  : `Import ${parsed.rows.length} ticket(s)`}
              </button>
            </div>
          )}

          {summary && (
            <div style={{ marginTop: '18px' }}>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
                {['created', 'skipped', 'error'].map(k => (
                  <span
                    key={k}
                    style={{ fontSize: '13px', fontWeight: 700, color: OUTCOME[k].color }}
                  >
                    {summary[k]} {OUTCOME[k].label}
                  </span>
                ))}
              </div>
              {summary.error > 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {summary.rows
                    .filter(r => r.status === 'error')
                    .slice(0, 5)
                    .map((r, i) => (
                      <div key={i}>
                        {r.jiraKey}: {r.error}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'export' && (
        <div style={{ ...S.card, padding: '20px', maxWidth: '600px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>
            Export tickets
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Downloads a CSV of tickets (excludes problems and changes). Includes the original Jira
            key where present.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <a
              href={ticketsCsvUrl()}
              style={{
                ...S.orangeBtn,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Download size={15} /> All tickets
            </a>
          </div>
          <div style={{ marginTop: '18px' }}>
            <label style={S.label}>Or one board</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={boardId} onChange={e => setBoardId(e.target.value)} style={S.select}>
                {boards.map(b => (
                  <option key={b.id} value={b.id}>
                    {boardLabel(b)}
                  </option>
                ))}
              </select>
              <a
                href={ticketsCsvUrl({ boardId })}
                style={{
                  ...S.ghostBtn,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Download size={15} /> Export board
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
